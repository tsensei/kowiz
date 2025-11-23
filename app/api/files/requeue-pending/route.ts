import { NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { queueService } from '@/lib/services/queue.service';

export async function POST() {
  try {
    // Get all pending files
    const allFiles = await databaseService.getAllFiles();
    const pendingFiles = allFiles.filter(f => f.status === 'pending');

    const results = [];

    for (const file of pendingFiles) {
      try {
        // Add to queue
        await queueService.addConversionJob({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        });

        // Update status to queued
        await databaseService.updateFileStatus(file.id, 'queued');

        results.push({ id: file.id, name: file.name, success: true });
      } catch (error) {
        console.error(`Failed to requeue ${file.name}:`, error);
        results.push({
          id: file.id,
          name: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Requeued ${results.filter(r => r.success).length} of ${pendingFiles.length} pending files`,
      results,
    });
  } catch (error) {
    console.error('Requeue error:', error);
    return NextResponse.json(
      { error: 'Failed to requeue pending files' },
      { status: 500 }
    );
  }
}

