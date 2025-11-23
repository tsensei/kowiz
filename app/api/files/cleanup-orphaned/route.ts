import { NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { minioService, BUCKETS } from '@/lib/services/minio.service';

export async function POST() {
  try {
    // Get all files from database
    const allFiles = await databaseService.getAllFiles();
    const orphaned = [];
    const valid = [];

    for (const file of allFiles) {
      try {
        // Check if file exists in MinIO
        const exists = await minioService.fileExists(BUCKETS.RAW_FILES, file.rawFilePath);
        
        if (!exists) {
          orphaned.push({
            id: file.id,
            name: file.name,
            status: file.status,
            rawFilePath: file.rawFilePath,
          });
          
          // Delete orphaned record
          await databaseService.deleteFile(file.id);
        } else {
          valid.push(file.id);
        }
      } catch (error) {
        console.error(`Error checking file ${file.name}:`, error);
        orphaned.push({
          id: file.id,
          name: file.name,
          status: file.status,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        // Delete on error too
        await databaseService.deleteFile(file.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${orphaned.length} orphaned records`,
      orphaned,
      validFiles: valid.length,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup orphaned files' },
      { status: 500 }
    );
  }
}

