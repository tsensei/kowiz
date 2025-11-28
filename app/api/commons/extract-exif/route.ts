import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';
import exifr from 'exifr';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const fileIds: string[] = body.fileIds;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'File IDs are required' }, { status: 400 });
    }

    const exifDates: Record<string, string | null> = {};

    // Extract EXIF dates for each file
    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const file = await databaseService.getFileById(fileId, session.user.id);
          if (!file || file.category !== 'image') {
            exifDates[fileId] = null;
            return;
          }

          const bucket = file.processedFilePath ? BUCKETS.PROCESSED_FILES : BUCKETS.RAW_FILES;
          const filePath = file.processedFilePath || file.rawFilePath;
          const buffer = await minioService.downloadFile(bucket, filePath);

          const exifData = await exifr.parse(buffer, {
            pick: ['DateTimeOriginal', 'CreateDate', 'DateTime'],
          });

          if (exifData) {
            const dateValue = exifData.DateTimeOriginal || exifData.CreateDate || exifData.DateTime;
            if (dateValue instanceof Date) {
              exifDates[fileId] = dateValue.toISOString().slice(0, 10);
            } else {
              exifDates[fileId] = null;
            }
          } else {
            exifDates[fileId] = null;
          }
        } catch (error) {
          console.log(`Could not extract EXIF date for file ${fileId}:`, error);
          exifDates[fileId] = null;
        }
      })
    );

    return NextResponse.json({ exifDates });
  } catch (error: any) {
    console.error('Extract EXIF error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to extract EXIF data' },
      { status: 500 }
    );
  }
}
