import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { tusServer } from '@/lib/services/tus.service';
import { databaseService } from '@/lib/services/database.service';
import { notificationService } from '@/lib/services/notification.service';
import { v4 as uuidv4 } from 'uuid';

// Convert Next.js Request to standard Request for TUS server
async function convertNextRequestToRequest(req: NextRequest): Promise<Request> {
  const url = req.url;
  const method = req.method;
  const headers = new Headers();

  req.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  // For requests with body (POST, PATCH), clone the body
  let body = null;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    body = await req.arrayBuffer();
  }

  return new Request(url, {
    method,
    headers,
    body,
  });
}

// Convert standard Response to Next.js Response (not used but kept for reference)
// TUS server actually returns Response directly

// Main handler for all TUS operations
async function handleTusRequest(req: NextRequest): Promise<NextResponse> {
  const method = req.method;
  const url = req.url;
  console.log(`[TUS] ${method} ${url}`);

  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('[TUS] Unauthorized request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const username = session.user.username;
    console.log(`[TUS] Authenticated user: ${userId} (${username})`);

    // For POST requests (upload creation), inject user metadata
    if (req.method === 'POST') {
      const user = await databaseService.getUserById(userId);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Get metadata from Upload-Metadata header
      const uploadMetadata = req.headers.get('upload-metadata') || '';
      const metadataObj: Record<string, string> = {};

      // Parse existing metadata
      if (uploadMetadata) {
        uploadMetadata.split(',').forEach((pair) => {
          const [key, value] = pair.trim().split(' ');
          if (key && value) {
            metadataObj[key] = Buffer.from(value, 'base64').toString('utf-8');
          }
        });
      }

      // Check if notification requested
      const notifyOnComplete = metadataObj.notifyOnComplete === 'true';

      if (notifyOnComplete && !user.email) {
        return NextResponse.json(
          { error: 'Email required for notifications. Please add an email in your profile.' },
          { status: 400 }
        );
      }

      // Check notification quota
      if (notifyOnComplete) {
        const notificationStats = await notificationService.getDailyStats(userId);
        if (notificationStats && notificationStats.remaining <= 0) {
          return NextResponse.json(
            { error: 'Daily notification limit reached', limit: notificationStats.limit },
            { status: 429 }
          );
        }
      }

      // Generate batch ID if notification requested
      const batchId = notifyOnComplete ? uuidv4() : null;

      // Inject user ID, batch ID, and email into metadata
      metadataObj.userId = userId;
      metadataObj.username = username || 'unknown';
      if (batchId) {
        metadataObj.batchId = batchId;
      }
      if (notifyOnComplete && user.email) {
        metadataObj.userEmail = user.email;
      }

      // Rebuild Upload-Metadata header
      const newMetadata = Object.entries(metadataObj)
        .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
        .join(',');

      // Create new headers with updated metadata
      const newHeaders = new Headers(req.headers);
      newHeaders.set('upload-metadata', newMetadata);

      // Store batch ID for notification creation after upload finishes
      if (batchId && user.email) {
        // We'll handle notification creation in the onUploadFinish hook
        // Store batch info temporarily (you may want to use a cache here)
        req.headers.set('x-batch-id', batchId);
        req.headers.set('x-user-email', user.email);
      }

      // Create modified request
      const modifiedReq = new NextRequest(req.url, {
        method: req.method,
        headers: newHeaders,
        body: req.body,
      });

      // Convert to standard Request
      const standardReq = await convertNextRequestToRequest(modifiedReq);

      // Handle with TUS server using web standard Request/Response
      console.log('[TUS] Calling tusServer.handleWeb for POST with modified request');
      const tusResponse = await tusServer.handleWeb(standardReq);
      console.log(`[TUS] POST Response status: ${tusResponse.status}`);

      // Fix Location header to use HTTPS in production
      const responseHeaders = new Headers(tusResponse.headers);
      const location = responseHeaders.get('location');
      if (location && location.startsWith('http://')) {
        // Get the proper protocol from the request or environment
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('host') || req.headers.get('x-forwarded-host');

        if (protocol === 'https' && host) {
          // Replace http:// with https:// using the request's host
          const fixedLocation = location.replace(/^http:\/\/[^/]+/, `https://${host}`);
          responseHeaders.set('location', fixedLocation);
          console.log(`[TUS] Fixed Location header: ${location} -> ${fixedLocation}`);
        }
      }

      // Convert to NextResponse
      return new NextResponse(tusResponse.body, {
        status: tusResponse.status,
        statusText: tusResponse.statusText,
        headers: responseHeaders,
      });
    }

    // For other methods, convert and handle normally
    console.log(`[TUS] Calling tusServer.handleWeb for ${method}`);
    const standardReq = await convertNextRequestToRequest(req);
    const tusResponse = await tusServer.handleWeb(standardReq);
    console.log(`[TUS] ${method} Response status: ${tusResponse.status}`);

    return new NextResponse(tusResponse.body, {
      status: tusResponse.status,
      statusText: tusResponse.statusText,
      headers: tusResponse.headers,
    });
  } catch (error) {
    console.error('[TUS] Request error:', error);
    console.error('[TUS] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export handlers for all HTTP methods TUS needs
export async function GET(req: NextRequest) {
  return handleTusRequest(req);
}

export async function POST(req: NextRequest) {
  return handleTusRequest(req);
}

export async function PATCH(req: NextRequest) {
  return handleTusRequest(req);
}

export async function HEAD(req: NextRequest) {
  return handleTusRequest(req);
}

export async function DELETE(req: NextRequest) {
  return handleTusRequest(req);
}

export async function OPTIONS(req: NextRequest) {
  return handleTusRequest(req);
}
