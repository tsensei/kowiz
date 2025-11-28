import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';
import { geminiService } from '@/lib/services/gemini.service';
import { logAudit } from '@/lib/audit';
import exifr from 'exifr';

export async function POST(request: NextRequest) {
  let fileId: string | undefined;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    fileId = body.fileId;
    const userContext = body.userContext; // Optional user-provided keywords/context

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    // Get file from database
    const file = await databaseService.getFileById(fileId, session.user.id);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Only support image files for now
    if (file.category !== 'image') {
      return NextResponse.json({ error: 'AI metadata generation is only supported for images' }, { status: 400 });
    }

    // Download file from MinIO
    const bucket = file.processedFilePath ? BUCKETS.PROCESSED_FILES : BUCKETS.RAW_FILES;
    const filePath = file.processedFilePath || file.rawFilePath;
    const buffer = await minioService.downloadFile(bucket, filePath);

    // Determine MIME type from file format
    const mimeType = getMimeType(file.targetFormat || file.originalFormat);

    // Extract EXIF data to get the photo creation date
    let exifDate: string | null = null;
    try {
      const exifData = await exifr.parse(buffer, {
        pick: ['DateTimeOriginal', 'CreateDate', 'DateTime'],
      });

      if (exifData) {
        // Try different EXIF date fields in order of preference
        const dateValue = exifData.DateTimeOriginal || exifData.CreateDate || exifData.DateTime;
        if (dateValue instanceof Date) {
          exifDate = dateValue.toISOString().slice(0, 10); // YYYY-MM-DD format
        }
      }
    } catch (exifError) {
      console.log('Could not extract EXIF date:', exifError);
      // Continue without EXIF date
    }

    // Generate metadata using Gemini with user-provided context (AI-assisted)
    const metadata = await geminiService.generateMetadataFromImage(
      buffer,
      mimeType,
      file.name,
      userContext
    );

    // Log successful generation
    await logAudit({
      userId: session.user.id,
      username: session.user.username,
      action: 'commons.generate_metadata',
      resourceType: 'file',
      resourceId: fileId,
      success: true,
      metadata: {
        fileName: file.name,
        generatedTitle: metadata.title,
        categoryCount: metadata.suggestedCategories.length,
        exifDateFound: !!exifDate,
      },
    });

    return NextResponse.json({
      ...metadata,
      exifDate, // Include EXIF date if found
    });
  } catch (error: any) {
    console.error('Generate metadata error:', error);

    // Log failed generation
    const session = await getServerSession(authOptions);
    if (session?.user?.id && fileId) {
      await logAudit({
        userId: session.user.id,
        username: session.user.username,
        action: 'commons.generate_metadata',
        resourceType: 'file',
        resourceId: fileId,
        success: false,
        errorMessage: error?.message || 'Failed to generate metadata',
      });
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}

function getMimeType(format: string): string {
  const formatLower = format.toLowerCase();
  switch (formatLower) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      return 'image/jpeg'; // fallback
  }
}
