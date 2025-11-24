import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';

/**
 * Stream endpoint for serving audio/video files inline (not as download)
 * This is used by Audiomass to load files for editing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'converted'; // 'raw' or 'converted'

    // Get file from database
    const file = await databaseService.getFileById(id);

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    let fileName: string;
    let contentType: string;
    let bucketName: string;
    let filePath: string;

    if (type === 'raw') {
      // Serve raw/original file
      bucketName = BUCKETS.RAW_FILES;
      filePath = file.rawFilePath;
      fileName = file.name;
      contentType = file.mimeType;
    } else {
      // Serve converted file
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

    // Return file as stream with inline disposition and CORS headers
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        // Use 'inline' instead of 'attachment' so it can be loaded in Audiomass
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        // Add CORS headers for iframe access
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Cache for better performance
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Stream error:', error);
    return NextResponse.json(
      { error: 'Failed to stream file' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
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
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
  };
  return contentTypes[formatLower] || 'application/octet-stream';
}
