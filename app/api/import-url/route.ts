import { NextRequest, NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { queueService } from '@/lib/services/queue.service';
import { urlValidationService } from '@/lib/services/url-validation.service';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const body = await request.json();
    const { url, filename, size } = body;

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

    // Determine file details
    let finalName = filename;
    let mimeType = 'video/mp4'; // Default fallback
    let category = 'video';
    let originalFormat = 'mp4';
    let targetFormat = 'webm';

    if (filename) {
      // Infer from provided filename
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext) {
        originalFormat = ext;
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif'].includes(ext)) {
          mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          category = 'image';
          targetFormat = 'webp'; // Convert images to WebP
        } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
          mimeType = `audio/${ext}`;
          category = 'audio';
          targetFormat = 'mp3';
        } else {
          // Keep video defaults
          mimeType = `video/${ext}`;
        }
      }
    } else if (validation.metadata?.videoId) {
      // YouTube defaults
      finalName = `youtube-${validation.metadata.videoId}.mp4`;
    } else {
      // Fallback
      finalName = `import-${fileId}.mp4`;
    }

    const rawFileName = `${fileId}-${finalName}`;

    // Create database record
    const dbFile = await databaseService.createFile({
      userId,
      name: finalName,
      size: size || 0, // Use provided size or default to 0
      mimeType,
      category: category as any,
      originalFormat,
      targetFormat,
      needsConversion: 'true',
      rawFilePath: rawFileName,
      importSource,
      sourceUrl: sanitizedUrl,
      status: 'pending',
    });

    // Add to conversion queue (worker will download first)
    await queueService.addConversionJob({
      fileId: dbFile.id,
      fileName: finalName,
      mimeType,
    });

    // Update status to queued
    await databaseService.updateFileStatus(dbFile.id, 'queued');

    console.log(`✓ URL import queued: ${finalName}`);

    // Log import audit event
    await logAudit({
      userId,
      username: session.user.username,
      action: importSource === 'youtube' ? 'file.import.youtube' : 'file.import.url',
      resourceType: 'file',
      resourceId: dbFile.id,
      metadata: {
        sourceUrl: sanitizedUrl,
        importSource,
        validationType: validation.type,
        platform: validation.metadata?.platform,
        videoId: validation.metadata?.videoId,
      },
      success: true,
    });

    return NextResponse.json({
      success: true,
      file: {
        id: dbFile.id,
        name: finalName,
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

