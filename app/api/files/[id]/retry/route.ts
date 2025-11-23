import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { queueService } from '@/lib/services/queue.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get file from database
    const file = await databaseService.getFileById(id);
    
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Check retry count
    if (file.retryCount && file.retryCount >= 3) {
      return NextResponse.json(
        { error: 'Maximum retry attempts reached' },
        { status: 400 }
      );
    }

    // Reset status and add back to queue
    await databaseService.updateFileStatus(id, 'queued');
    
    await queueService.addConversionJob({
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
    });

    return NextResponse.json({
      success: true,
      message: 'File re-queued for conversion',
    });
  } catch (error) {
    console.error('Retry error:', error);
    return NextResponse.json(
      { error: 'Failed to retry conversion' },
      { status: 500 }
    );
  }
}

