import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';
import { commonsService } from '@/lib/commons/commons.service';
import { CommonsPublishItem, CommonsPublishResult } from '@/types/commons';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = (session as any).accessToken as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing Commons access token. Please reconnect your Wikimedia account.' }, { status: 400 });
    }

    const body = await request.json();
    const items: CommonsPublishItem[] | undefined = body?.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No publish items provided' }, { status: 400 });
    }

    const results: CommonsPublishResult[] = [];

    for (const item of items) {
      const { fileId, metadata, release } = item;
      if (!fileId || !metadata || release !== 'own') {
        results.push({
          fileId: fileId || '',
          success: false,
          error: 'Invalid payload. Only own-work uploads are supported.',
        });
        continue;
      }

      try {
        const file = await databaseService.getFileById(fileId, session.user.id);
        if (!file) {
          results.push({ fileId, success: false, error: 'File not found' });
          continue;
        }

        const normalizedMeta = {
          ...metadata,
          filename: metadata.filename || file.name,
          source: metadata.source || '{{own}}',
          categories: Array.isArray(metadata.categories) ? metadata.categories : [],
        };

        // Download file from MinIO
        const bucket = file.processedFilePath ? BUCKETS.PROCESSED_FILES : BUCKETS.RAW_FILES;
        const filePath = file.processedFilePath || file.rawFilePath;
        const buffer = await minioService.downloadFile(bucket, filePath);

        // Upload to Commons
        const uploadResult = await commonsService.uploadBufferToCommons(
          buffer,
          normalizedMeta,
          accessToken,
          normalizedMeta.filename || file.name
        );

        results.push({
          ...uploadResult,
          fileId,
        });

        // Audit log
        await logAudit({
          userId: session.user.id,
          username: session.user.username,
          action: 'commons.upload',
          resourceType: 'file',
          resourceId: fileId,
          success: uploadResult.success,
          metadata: {
            filename: metadata.filename,
            descriptionUrl: uploadResult.descriptionUrl,
            warnings: uploadResult.warnings,
          },
          errorMessage: uploadResult.error,
        });
      } catch (error: any) {
        console.error('Commons upload error', error);
        results.push({
          fileId,
          success: false,
          error: error?.message || 'Failed to upload to Commons',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Commons upload API error', error);
    return NextResponse.json({ error: 'Failed to publish to Commons' }, { status: 500 });
  }
}
