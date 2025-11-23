import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { queueService } from '@/lib/services/queue.service';
import { urlValidationService } from '@/lib/services/url-validation.service';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    const validation = urlValidationService.validateUrl(url);
    
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: validation.error || 'Invalid URL' 
      }, { status: 400 });
    }

    console.log(`Importing from ${validation.type}:`, validation.metadata);

    // Generate unique file ID
    const fileId = uuidv4();
    const sanitizedUrl = urlValidationService.sanitizeUrl(url);
    
    // Determine source type
    const importSource = validation.type === 'youtube' ? 'youtube' : 'direct_url';
    
    // Create a placeholder filename (will be updated after download)
    const placeholderName = validation.metadata?.videoId 
      ? `youtube-${validation.metadata.videoId}.mp4`
      : `import-${fileId}.mp4`;
    
    const rawFileName = `${fileId}-${placeholderName}`;

    // Create database record
    // Note: size and format will be updated after download
    const dbFile = await databaseService.createFile({
      name: placeholderName,
      size: 0, // Will be updated after download
      mimeType: 'video/mp4', // Default, will be updated
      category: 'video', // Assume video for URL imports
      originalFormat: 'mp4', // Will be updated after download
      targetFormat: 'webm', // Convert to WebM for Commons
      needsConversion: 'true',
      rawFilePath: rawFileName,
      importSource,
      sourceUrl: sanitizedUrl,
      status: 'pending',
    });

    // Add to conversion queue (worker will download first)
    await queueService.addConversionJob({
      fileId: dbFile.id,
      fileName: placeholderName,
      mimeType: 'video/mp4',
    });

    // Update status to queued
    await databaseService.updateFileStatus(dbFile.id, 'queued');

    console.log(`✓ URL import queued: ${placeholderName}`);

    return NextResponse.json({
      success: true,
      file: {
        id: dbFile.id,
        name: placeholderName,
        importSource,
        sourceUrl: sanitizedUrl,
        status: 'queued',
        type: validation.type,
        platform: validation.metadata?.platform,
      },
    });
  } catch (error) {
    console.error('URL import error:', error);
    return NextResponse.json(
      { error: 'Failed to import from URL' },
      { status: 500 }
    );
  }
}

