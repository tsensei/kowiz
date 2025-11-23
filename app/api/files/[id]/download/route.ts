import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';

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

    let downloadUrl: string;
    let fileName: string;

    if (type === 'raw') {
      // Download raw/original file
      downloadUrl = await minioService.getFileUrl(
        BUCKETS.RAW_FILES,
        file.rawFilePath,
        3600 // 1 hour expiry
      );
      fileName = file.name;
    } else {
      // Download converted file
      if (!file.processedFilePath) {
        return NextResponse.json(
          { error: 'Converted file not available yet' },
          { status: 404 }
        );
      }

      downloadUrl = await minioService.getFileUrl(
        BUCKETS.PROCESSED_FILES,
        file.processedFilePath,
        3600 // 1 hour expiry
      );
      
      // Create filename with new extension
      const nameParts = file.name.split('.');
      nameParts[nameParts.length - 1] = file.targetFormat || file.originalFormat;
      fileName = nameParts.join('.');
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Download URL generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}

