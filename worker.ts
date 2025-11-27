// Load environment variables FIRST before any imports
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import * as fs from 'fs/promises';
import { ConversionJobData } from './lib/services/queue.service';
import { databaseService } from './lib/services/database.service';
import { minioService, BUCKETS } from './lib/services/minio.service';
import { conversionService } from './lib/services/conversion.service';
import { urlDownloadService } from './lib/services/url-download.service';
import { notificationService } from './lib/services/notification.service';
import type { File as DbFile } from './lib/db/schema';

console.log('[worker] ENV check: RESEND_API_KEY', process.env.RESEND_API_KEY ? 'present' : 'missing');
console.log('[worker] ENV check: RESEND_FROM_EMAIL', process.env.RESEND_FROM_EMAIL || 'not set');

const connectionString = `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || 'postgres'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || 5432}/${process.env.DATABASE_NAME || 'kowiz'}`;

const boss = new PgBoss(connectionString);

async function processConversionJob(jobs: Job<ConversionJobData>[]) {
  // pg-boss can batch jobs, but we'll process them one at a time
  for (const job of jobs) {
    const { fileId, fileName, mimeType } = job.data;

    console.log('\n=== Processing Conversion Job ===');
    console.log(`Job ID: ${job.id}`);
    console.log(`File ID: ${fileId}`);
    console.log(`File Name: ${fileName}`);
    console.log(`MIME Type: ${mimeType}`);
    if ('attemptsmade' in job) {
      console.log(`Attempt: ${(job as any).attemptsmade + 1}`);
    }

    let fileRecord: DbFile | undefined;

    try {
      // Get file details from database
      fileRecord = await databaseService.getFileById(fileId);
      if (!fileRecord) {
        throw new Error(`File record not found: ${fileId}`);
      }

      // Check if we've exceeded retry limit
      const retryCount = fileRecord.retryCount || 0;
      const maxRetries = 3;

      if (retryCount >= maxRetries) {
        const errorMessage = `Maximum retry attempts (${maxRetries}) reached. Last error: ${fileRecord.errorMessage || 'Unknown error'}`;
        console.error(`❌ Retry limit exceeded (${retryCount}/${maxRetries}):`, errorMessage);
        await databaseService.updateFileStatus(fileId, 'failed', errorMessage);
        // Don't throw error - just return to prevent pg-boss from retrying
        return { success: false, fileId, error: errorMessage };
      }

      console.log(`Category: ${fileRecord.category}`);
      console.log(`Original Format: ${fileRecord.originalFormat}`);
      console.log(`Target Format: ${fileRecord.targetFormat}`);
      console.log(`Needs Conversion: ${fileRecord.needsConversion}`);

      let fileBuffer: Buffer;
      let actualFileName = fileRecord.name;
      let actualFormat = fileRecord.originalFormat;

      // Check if this is a URL import
      if (fileRecord.sourceUrl && fileRecord.importSource !== 'upload') {
        console.log(`Downloading from ${fileRecord.importSource}: ${fileRecord.sourceUrl}`);

        // Update status to downloading
        await databaseService.updateFileStatus(fileId, 'downloading');

        // Download from URL
        const downloadPath = urlDownloadService.getTempPath(`download-${fileId}.tmp`);
        const downloadResult = await urlDownloadService.download({
          url: fileRecord.sourceUrl,
          type: fileRecord.importSource === 'youtube' ? 'youtube' : 'direct',
          outputPath: downloadPath,
        });

        if (!downloadResult.success) {
          throw new Error(downloadResult.error || 'URL download failed');
        }

        console.log(`✓ Downloaded: ${downloadResult.fileName}`);
        console.log(`  Size: ${Math.round((downloadResult.fileSize || 0) / 1024 / 1024 * 100) / 100} MB`);

        // Read the downloaded file
        fileBuffer = await fs.readFile(downloadResult.filePath!);
        actualFileName = downloadResult.fileName || fileRecord.name;
        actualFormat = downloadResult.format || fileRecord.originalFormat;

        // Upload to MinIO for storage
        console.log('Uploading downloaded file to MinIO...');
        await minioService.uploadFile(
          BUCKETS.RAW_FILES,
          fileRecord.rawFilePath,
          fileBuffer,
          {
            'Content-Type': `video/${actualFormat}`,
            'original-url': fileRecord.sourceUrl,
            'import-source': fileRecord.importSource,
          }
        );

        // Update file record with actual metadata
        await databaseService.updateFileStatus(fileId, 'converting');

        // Clean up temp download file
        await urlDownloadService.cleanup(downloadResult.filePath!);

        console.log('✓ File uploaded to MinIO');
      } else {
        // Normal flow: download from MinIO
        console.log('Downloading file from MinIO...');
        fileBuffer = await minioService.downloadFile(
          BUCKETS.RAW_FILES,
          fileRecord.rawFilePath
        );
      }

      // Update status to converting
      await databaseService.updateFileStatus(fileId, 'converting');

      // If no conversion needed, just mark as completed
      if (fileRecord.needsConversion === 'false' || !fileRecord.targetFormat) {
        console.log('✓ No conversion needed - file is already in supported format');
        await databaseService.updateFileStatus(fileId, 'completed');
        if (fileRecord.notifyOnComplete) {
          await notificationService.checkAndSendForBatch(fileRecord.batchId || undefined);
        }
        // Job completes automatically when function returns without error
        return { success: true, fileId, converted: false };
      }

      // Ensure temp directory exists
      await conversionService.init();

      // Create temp paths
      const inputPath = conversionService.getTempPath(`input-${fileId}.${fileRecord.originalFormat}`);
      const outputPath = conversionService.getTempPath(`output-${fileId}.${fileRecord.targetFormat}`);

      // Write buffer to temp file
      await fs.writeFile(inputPath, fileBuffer);
      console.log('✓ File downloaded to temp storage');

      // Perform conversion with progress tracking
      console.log(`Converting ${fileRecord.originalFormat} → ${fileRecord.targetFormat}...`);

      // Throttle progress updates: every 5 seconds or 10% change
      const PROGRESS_UPDATE_INTERVAL = 5000; // 5 seconds
      const MIN_PROGRESS_DELTA = 10; // 10%
      let lastProgressUpdate = 0;
      let lastProgressValue = 0;

      const conversionResult = await conversionService.convert({
        inputPath,
        outputPath,
        sourceFormat: fileRecord.originalFormat,
        targetFormat: fileRecord.targetFormat!,
        category: fileRecord.category as any,
        onProgress: async (progress: number) => {
          const now = Date.now();
          const timeSinceLastUpdate = now - lastProgressUpdate;
          const progressDelta = Math.abs(progress - lastProgressValue);

          // Update if enough time has passed OR progress changed significantly
          if (timeSinceLastUpdate >= PROGRESS_UPDATE_INTERVAL || progressDelta >= MIN_PROGRESS_DELTA) {
            await databaseService.updateConversionProgress(fileId, progress);
            console.log(`  Progress: ${progress}%`);
            lastProgressUpdate = now;
            lastProgressValue = progress;
          }
        },
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

      if (fileRecord.notifyOnComplete) {
        await notificationService.checkAndSendForBatch(fileRecord.batchId || undefined);
      }

      // Job completes automatically when function returns without error
      return { success: true, fileId, converted: true };
    } catch (error) {
      console.error('❌ Error processing job:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';

      // Increment retry count
      const updatedFile = await databaseService.incrementRetryCount(fileId);
      const newRetryCount = updatedFile?.retryCount || 0;
      const maxRetries = 3;

      // Update status with error
      if (newRetryCount >= maxRetries) {
        // Final failure - exceeded retry limit
        const finalErrorMessage = `Failed after ${maxRetries} attempts: ${errorMessage}`;
        await databaseService.updateFileStatus(fileId, 'failed', finalErrorMessage);
        console.error(`❌ Maximum retry attempts (${maxRetries}) reached. Marking as permanently failed.`);
        if (fileRecord?.notifyOnComplete) {
          await notificationService.checkAndSendForBatch(fileRecord.batchId || undefined);
        }
        console.log('=================================\n');
        // Don't throw - let pg-boss mark job as failed
        return { success: false, fileId, error: finalErrorMessage };
      } else {
        // Still have retries left
        await databaseService.updateFileStatus(fileId, 'failed', errorMessage);
        console.log(`⚠️  Retry ${newRetryCount}/${maxRetries} - will retry automatically`);
        console.log('=================================\n');
        // Throw error to trigger pg-boss retry
        throw error;
      }
    }
  }
}

// Start pg-boss and worker
async function startWorker() {
  try {
    console.log('Starting pg-boss...');
    await boss.start();
    console.log('✓ pg-boss connected to PostgreSQL');

    // Create the queue (pg-boss requires explicit queue creation)
    console.log('Creating file-conversion queue...');
    try {
      await boss.createQueue('file-conversion');
      console.log('✓ Queue created');
    } catch (error: any) {
      // Queue might already exist
      if (error?.message?.includes('already exists')) {
        console.log('✓ Queue already exists');
      } else {
        throw error;
      }
    }

    console.log('\n🚀 Worker started and waiting for conversion jobs...');
    console.log('   Concurrency: 2 jobs');
    console.log('   Queue: PostgreSQL (pg-boss)');
    console.log('   Supported conversions:');
    console.log('   - Images: HEIC/HEIF/WebP → JPEG');
    console.log('   - RAW: CR2/CR3/NEF/ARW/DNG → TIFF');
    console.log('   - Videos: MP4/MOV/AVI → WebM (VP9+Opus)');
    console.log('   - Audio: MP3/AAC/M4A → Ogg Vorbis');
    console.log('');

    // Start processing jobs
    // pg-boss handles concurrency automatically based on teamSize
    await boss.work('file-conversion', processConversionJob);

    console.log('✓ Worker is now processing jobs...\n');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nSIGTERM signal received: closing worker');
  await boss.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing worker');
  await boss.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

// Start the worker
startWorker();
