import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'converted'; // 'raw' or 'converted'

    // Get file from database and verify ownership
    const file = await databaseService.getFileById(id, session.user.id);

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    let fileName: string;
    let contentType: string;
    let bucketName: string;
    let filePath: string;

    if (type === 'raw') {
      // Download raw/original file
      bucketName = BUCKETS.RAW_FILES;
      filePath = file.rawFilePath;
      fileName = file.name;
      contentType = file.mimeType;
    } else {
      // Download converted file
      if (!file.processedFilePath) {
        return NextResponse.json(
          { error: 'Converted file not available yet' },
          { status: 404 }
        );
      }

      bucketName = BUCKETS.PROCESSED_FILES;
      filePath = file.processedFilePath;
      
      // Create filename with new extension
      const nameParts = file.name.split('.');
      nameParts[nameParts.length - 1] = file.targetFormat || file.originalFormat;
      fileName = nameParts.join('.');
      
      // Determine content type based on target format
      const format = file.targetFormat || file.originalFormat;
      contentType = getContentType(format);
    }

    // Get file stream from MinIO
    const fileStream = await minioService.getFileStream(bucketName, filePath);

    // Convert Node.js stream to Web ReadableStream
    const webStream = new ReadableStream({
      async start(controller) {
        try {
          fileStream.on('data', (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          fileStream.on('end', () => {
            controller.close();
          });
          fileStream.on('error', (error: Error) => {
            controller.error(error);
          });
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // Return file as stream with proper headers
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}

function getContentType(format: string): string {
  const formatLower = format.toLowerCase();
  const contentTypes: Record<string, string> = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    webm: 'video/webm',
    mp4: 'video/mp4',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };
  return contentTypes[formatLower] || 'application/octet-stream';
}

