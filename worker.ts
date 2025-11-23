import { Worker, Job } from 'bullmq';
import * as fs from 'fs/promises';
import { ConversionJobData } from './lib/services/queue.service';
import { databaseService } from './lib/services/database.service';
import { minioService, BUCKETS } from './lib/services/minio.service';
import { conversionService } from './lib/services/conversion.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};

const worker = new Worker<ConversionJobData>(
  'file-conversion',
  async (job: Job<ConversionJobData>) => {
    const { fileId, fileName, mimeType } = job.data;

    console.log('\n=== Processing Conversion Job ===');
    console.log(`Job ID: ${job.id}`);
    console.log(`File ID: ${fileId}`);
    console.log(`File Name: ${fileName}`);
    console.log(`MIME Type: ${mimeType}`);

    try {
      // Get file details from database
      const fileRecord = await databaseService.getFileById(fileId);
      if (!fileRecord) {
        throw new Error(`File record not found: ${fileId}`);
      }

      console.log(`Category: ${fileRecord.category}`);
      console.log(`Original Format: ${fileRecord.originalFormat}`);
      console.log(`Target Format: ${fileRecord.targetFormat}`);
      console.log(`Needs Conversion: ${fileRecord.needsConversion}`);

      // Update status to converting
      await databaseService.updateFileStatus(fileId, 'converting');

      // If no conversion needed, just mark as completed
      if (fileRecord.needsConversion === 'false' || !fileRecord.targetFormat) {
        console.log('✓ No conversion needed - file is already in supported format');
        await databaseService.updateFileStatus(fileId, 'completed');
        return { success: true, fileId, converted: false };
      }

      // Download file from MinIO
      console.log('Downloading file from MinIO...');
      const fileBuffer = await minioService.downloadFile(
        BUCKETS.RAW_FILES,
        fileRecord.rawFilePath
      );

      // Ensure temp directory exists
      await conversionService.init();

      // Create temp paths
      const inputPath = conversionService.getTempPath(`input-${fileId}.${fileRecord.originalFormat}`);
      const outputPath = conversionService.getTempPath(`output-${fileId}.${fileRecord.targetFormat}`);

      // Write buffer to temp file
      await fs.writeFile(inputPath, fileBuffer);
      console.log('✓ File downloaded to temp storage');

      // Perform conversion
      console.log(`Converting ${fileRecord.originalFormat} → ${fileRecord.targetFormat}...`);
      const conversionResult = await conversionService.convert({
        inputPath,
        outputPath,
        sourceFormat: fileRecord.originalFormat,
        targetFormat: fileRecord.targetFormat!,
        category: fileRecord.category as any,
      });

      if (!conversionResult.success) {
        throw new Error(conversionResult.error || 'Conversion failed');
      }

      console.log(`✓ Conversion completed`);
      console.log(`  Original size: ${Math.round(fileRecord.size / 1024)} KB`);
      console.log(`  Converted size: ${Math.round((conversionResult.outputSize || 0) / 1024)} KB`);

      // Upload converted file to MinIO
      const processedFileName = `${fileId}-processed.${fileRecord.targetFormat}`;
      const convertedBuffer = await fs.readFile(outputPath);
      
      console.log('Uploading converted file to MinIO...');
      await minioService.uploadFile(
        BUCKETS.PROCESSED_FILES,
        processedFileName,
        convertedBuffer,
        {
          'Content-Type': `${fileRecord.category}/${fileRecord.targetFormat}`,
          'original-name': fileName,
        }
      );
      console.log('✓ Converted file uploaded');

      // Update database with conversion results
      await databaseService.updateFileConversion(
        fileId,
        conversionResult.outputSize || 0,
        processedFileName
      );

      // Clean up temp files
      await conversionService.cleanup(inputPath);
      await conversionService.cleanup(outputPath);

      // Mark as completed
      await databaseService.updateFileStatus(fileId, 'completed');

      console.log(`✓ File ${fileName} processed successfully!`);
      console.log('=================================\n');

      return { success: true, fileId, converted: true };
    } catch (error) {
      console.error('❌ Error processing job:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
      await databaseService.updateFileStatus(fileId, 'failed', errorMessage);
      await databaseService.incrementRetryCount(fileId);
      
      console.log('=================================\n');
      throw error;
    }
  },
  { 
    connection,
    concurrency: 2, // Process 2 jobs concurrently
  }
);

worker.on('completed', (job) => {
  console.log(`✓ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

console.log('🚀 Worker started and waiting for conversion jobs...');
console.log('   Concurrency: 2 jobs');
console.log('   Supported conversions:');
console.log('   - Images: HEIC/HEIF/WebP → JPEG');
console.log('   - RAW: CR2/NEF/ARW/DNG → TIFF');
console.log('   - Videos: MP4/MOV/AVI → WebM (VP9+Opus)');
console.log('   - Audio: MP3/AAC/M4A → Ogg Vorbis');
console.log('');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nSIGTERM signal received: closing worker');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing worker');
  await worker.close();
  process.exit(0);
});

