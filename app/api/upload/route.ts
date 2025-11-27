import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';
import { queueService } from '@/lib/services/queue.service';
import { formatDetectionService } from '@/lib/services/format-detection.service';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '@/lib/audit';
import { notificationService } from '@/lib/services/notification.service';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const user = await databaseService.getUserById(userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const uploadedFiles = formData.getAll('files') as File[];
    const notifyOnComplete = formData.get('notifyOnComplete') === 'true';

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (notifyOnComplete && !user.email) {
      return NextResponse.json(
        { error: 'Email required for notifications. Please add an email in your profile.' },
        { status: 400 }
      );
    }

    const notificationStats = notifyOnComplete
      ? await notificationService.getDailyStats(userId)
      : null;

    if (notifyOnComplete && notificationStats && notificationStats.remaining <= 0) {
      return NextResponse.json(
        { error: 'Daily notification limit reached', limit: notificationStats.limit },
        { status: 429 }
      );
    }

    const batchId = notifyOnComplete ? uuidv4() : null;

    const results = [];

    for (const file of uploadedFiles) {
      let dbFile = null;
      let minioUploaded = false;
      let queueAdded = false;

      try {
        // Step 1: Detect format and conversion requirements
        const formatInfo = formatDetectionService.detectFormat(file.name, file.type);
        console.log(`Processing: ${file.name}`, formatInfo);

        // Step 2: Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Step 3: Generate unique filename for raw storage
        const fileId = uuidv4();
        const rawFileName = `${fileId}-${file.name}`;

        // Step 4: Create database record with full metadata
        try {
          dbFile = await databaseService.createFile({
            userId,
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            category: formatInfo.category,
            originalFormat: formatInfo.originalFormat,
            targetFormat: formatInfo.targetFormat,
            needsConversion: formatInfo.needsConversion ? 'true' : 'false',
            rawFilePath: rawFileName,
            status: 'pending',
            batchId: batchId || undefined,
            notifyOnComplete: notifyOnComplete,
          });
        } catch (dbError) {
          console.error(`Database creation failed for ${file.name}:`, dbError);
          throw new Error(`Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        }

        // Step 5: Upload original file to MinIO raw-files bucket
        try {
          await minioService.uploadFile(BUCKETS.RAW_FILES, rawFileName, buffer, {
            'Content-Type': file.type || 'application/octet-stream',
            'original-name': file.name,
          });
          minioUploaded = true;

          // Verify upload succeeded
          const exists = await minioService.fileExists(BUCKETS.RAW_FILES, rawFileName);
          if (!exists) {
            throw new Error('File upload verification failed');
          }
        } catch (minioError) {
          console.error(`MinIO upload failed for ${file.name}:`, minioError);
          // Rollback: Delete database record
          if (dbFile) {
            await databaseService.deleteFile(dbFile.id);
          }
          throw new Error(`Storage upload failed: ${minioError instanceof Error ? minioError.message : 'Unknown error'}`);
        }

        // Step 6: Add to conversion queue
        try {
          await queueService.addConversionJob({
            fileId: dbFile.id,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
          });
          queueAdded = true;
        } catch (queueError) {
          console.error(`Queue add failed for ${file.name}:`, queueError);
          // Rollback: Delete from MinIO and database
          if (minioUploaded) {
            try {
              await minioService.deleteFile(BUCKETS.RAW_FILES, rawFileName);
            } catch (deleteError) {
              console.error(`Failed to rollback MinIO file for ${file.name}:`, deleteError);
            }
          }
          if (dbFile) {
            await databaseService.deleteFile(dbFile.id);
          }
          throw new Error(`Queue error: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`);
        }

        // Step 7: Update status to queued (final step)
        try {
          await databaseService.updateFileStatus(dbFile.id, 'queued');
        } catch (statusError) {
          console.error(`Status update failed for ${file.name}:`, statusError);
          // File is already uploaded and queued, so we don't rollback
          // Just log the error - the worker will still process it
          console.warn(`File ${file.name} is queued but status update failed - worker will still process it`);
        }

        // Success!
        results.push({
          success: true,
          file: {
            id: dbFile.id,
            name: dbFile.name,
            size: dbFile.size,
            category: formatInfo.category,
            originalFormat: formatInfo.originalFormat,
            targetFormat: formatInfo.targetFormat,
            needsConversion: formatInfo.needsConversion,
            status: 'queued',
          },
        });

        console.log(`✓ Successfully uploaded and queued: ${file.name}`);

        // Log audit event
        await logAudit({
          userId,
          username: session.user.username,
          action: 'file.upload',
          resourceType: 'file',
          resourceId: dbFile.id,
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            category: formatInfo.category,
            originalFormat: formatInfo.originalFormat,
            targetFormat: formatInfo.targetFormat,
            needsConversion: formatInfo.needsConversion,
          },
          success: true,
        });

      } catch (error) {
        console.error(`✗ Failed to process file ${file.name}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Upload failed';

        results.push({
          success: false,
          fileName: file.name,
          error: errorMessage,
          rollbackCompleted: true,
        });

        // Log failed upload audit event
        await logAudit({
          userId,
          username: session.user.username,
          action: 'file.upload',
          resourceType: 'file',
          resourceId: dbFile?.id,
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          },
          success: false,
          errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    if (notifyOnComplete && batchId && successCount > 0 && user.email) {
      await notificationService.createRequest({
        userId,
        batchId,
        email: user.email,
        totalFiles: successCount,
      });
    }

    return NextResponse.json({
      success: successCount > 0,
      results,
      totalFiles: uploadedFiles.length,
      successfulUploads: successCount,
      failedUploads: failureCount,
      message: failureCount > 0 
        ? `${successCount} of ${uploadedFiles.length} files uploaded successfully. ${failureCount} failed with rollback completed.`
        : `All ${successCount} files uploaded successfully.`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
