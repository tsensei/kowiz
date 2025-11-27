import { Server } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { databaseService } from './database.service';
import { queueService } from './queue.service';
import { formatDetectionService } from './format-detection.service';
import { notificationService } from './notification.service';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '@/lib/audit';
import { BUCKETS } from './minio.service';

// Create S3 store for TUS with proper MinIO configuration
const s3Store = new S3Store({
  partSize: 8 * 1024 * 1024, // 8MB chunks
  s3ClientConfig: {
    bucket: BUCKETS.RAW_FILES,
    region: process.env.MINIO_REGION || 'us-east-1',
    endpoint: `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    },
    forcePathStyle: true, // Required for MinIO
  },
});

interface UploadMetadata {
  filename?: string;
  filetype?: string;
  userId?: string;
  username?: string;
  batchId?: string;
  notifyOnComplete?: string;
  userEmail?: string;
}

// In-memory store for tracking batch uploads
// In production, consider using Redis or similar
const batchTracker = new Map<string, { userId: string; email: string; fileCount: number }>();

// Create TUS server instance
export const tusServer = new Server({
  path: '/api/tus',
  datastore: s3Store,
  // Generate S3 object key with UUID prefix for uniqueness
  namingFunction: (req, metadata?: UploadMetadata) => {
    const fileId = uuidv4();
    const filename = metadata?.filename || 'unknown';
    return `${fileId}-${filename}`;
  },
  // Called when upload is created
  async onUploadCreate(req, upload) {
    console.log('[TUS Service] onUploadCreate called');
    console.log('[TUS Service] Upload ID:', upload.id);
    console.log('[TUS Service] Upload size:', upload.size);
    console.log('[TUS Service] Upload metadata:', upload.metadata);

    const metadata = upload.metadata as UploadMetadata;
    const userId = metadata?.userId;
    const username = metadata?.username;
    const filename = metadata?.filename || 'unknown';
    const mimeType = metadata?.filetype || 'application/octet-stream';
    const batchId = metadata?.batchId;
    const notifyOnComplete = metadata?.notifyOnComplete === 'true';
    const userEmail = metadata?.userEmail;

    console.log('[TUS Service] Parsed metadata:', { userId, username, filename, mimeType, batchId, notifyOnComplete });

    if (!userId) {
      console.error('[TUS Service] No userId in metadata!');
      throw new Error('User ID is required');
    }

    // Track batch for notification
    if (batchId && notifyOnComplete && userEmail) {
      const batch = batchTracker.get(batchId);
      if (batch) {
        batch.fileCount++;
      } else {
        batchTracker.set(batchId, { userId, email: userEmail, fileCount: 1 });
      }
    }

    // Detect format and conversion requirements
    const formatInfo = formatDetectionService.detectFormat(filename, mimeType);

    try {
      // Create database record
      const dbFile = await databaseService.createFile({
        userId,
        name: filename,
        size: upload.size || 0,
        mimeType,
        category: formatInfo.category,
        originalFormat: formatInfo.originalFormat,
        targetFormat: formatInfo.targetFormat,
        needsConversion: formatInfo.needsConversion ? 'true' : 'false',
        rawFilePath: upload.id || filename,
        status: 'uploading',
        batchId: batchId || undefined,
        notifyOnComplete,
      });

      // Store database file ID in upload metadata for later use
      upload.metadata = {
        ...upload.metadata,
        dbFileId: dbFile.id,
      };

      // Log audit event
      if (username) {
        await logAudit({
          userId,
          username,
          action: 'file.upload',
          resourceType: 'file',
          resourceId: dbFile.id,
          metadata: {
            fileName: filename,
            fileSize: upload.size,
            mimeType,
            category: formatInfo.category,
            originalFormat: formatInfo.originalFormat,
            targetFormat: formatInfo.targetFormat,
            uploadStatus: 'started',
          },
          success: true,
        });
      }

      console.log(`✓ TUS upload created: ${filename} (DB ID: ${dbFile.id})`);
    } catch (error) {
      console.error(`✗ Failed to create database record for ${filename}:`, error);
      console.error('[TUS Service] Full error:', error);
      throw error;
    }

    console.log('[TUS Service] onUploadCreate completed successfully');
    return {};
  },
  // Called when upload is completed
  async onUploadFinish(req, upload) {
    const metadata = upload.metadata as UploadMetadata & { dbFileId?: string };
    const userId = metadata?.userId;
    const username = metadata?.username;
    const filename = metadata?.filename || 'unknown';
    const mimeType = metadata?.filetype || 'application/octet-stream';
    const dbFileId = metadata?.dbFileId;
    const batchId = metadata?.batchId;

    console.log(`✓ TUS upload finished: ${filename}`);

    if (!dbFileId) {
      console.error('No database file ID found in upload metadata');
      return {};
    }

    try {
      // Update file status to queued
      await databaseService.updateFileStatus(dbFileId, 'queued');

      // Add to conversion queue
      await queueService.addConversionJob({
        fileId: dbFileId,
        fileName: filename,
        mimeType,
      });

      console.log(`✓ Added ${filename} to conversion queue`);

      // Handle batch notification if this is the first file of a batch
      if (batchId) {
        const batch = batchTracker.get(batchId);
        if (batch) {
          // Create notification request for the batch
          try {
            await notificationService.createRequest({
              userId: batch.userId,
              batchId,
              email: batch.email,
              totalFiles: batch.fileCount,
            });
            console.log(`✓ Created notification request for batch ${batchId}`);
            // Remove from tracker after creating notification
            batchTracker.delete(batchId);
          } catch (notifError) {
            console.error(`Failed to create notification request:`, notifError);
            // Don't fail the upload if notification creation fails
          }
        }
      }

      // Log audit event
      if (userId && username) {
        await logAudit({
          userId,
          username,
          action: 'file.upload',
          resourceType: 'file',
          resourceId: dbFileId,
          metadata: {
            fileName: filename,
            fileSize: upload.size,
            mimeType,
          },
          success: true,
        });
      }
    } catch (error) {
      console.error(`✗ Failed to finalize upload for ${filename}:`, error);

      // Update file status to failed
      if (dbFileId) {
        await databaseService.updateFileStatus(dbFileId, 'failed');
      }

      // Log failed audit event
      if (userId && username) {
        await logAudit({
          userId,
          username,
          action: 'file.upload',
          resourceType: 'file',
          resourceId: dbFileId,
          metadata: {
            fileName: filename,
            fileSize: upload.size,
            mimeType,
          },
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Upload finalization failed',
        });
      }

      throw error;
    }

    return {};
  },
});
