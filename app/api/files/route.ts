import { NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';

export async function GET() {
  try {
    const files = await databaseService.getAllFiles();
    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

