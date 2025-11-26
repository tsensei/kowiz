import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { databaseService } from '@/lib/services/database.service';
import { minioService } from '@/lib/services/minio.service';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { fileIds, type } = body;

        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            return NextResponse.json(
                { error: 'No files selected' },
                { status: 400 }
            );
        }

        if (type !== 'raw' && type !== 'converted') {
            return NextResponse.json(
                { error: 'Invalid download type' },
                { status: 400 }
            );
        }

        // Verify ownership and get file details
        const filesToDownload = [];
        for (const id of fileIds) {
            const file = await databaseService.getFileById(id, session.user.id);
            if (file) {
                if (type === 'converted' && !file.processedFilePath) continue;
                filesToDownload.push(file);
            }
        }

        if (filesToDownload.length === 0) {
            return NextResponse.json(
                { error: 'No valid files found for download' },
                { status: 404 }
            );
        }

        // Create archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        const stream = new PassThrough();

        // Pipe archive data to the stream
        archive.pipe(stream);

        // Add files to archive
        for (const file of filesToDownload) {
            try {
                const bucket = type === 'raw' ? 'raw-files' : 'processed-files';
                const objectName = type === 'raw' ? file.rawFilePath : file.processedFilePath!;

                const fileStream = await minioService.getFileStream(bucket, objectName);

                // Determine filename in zip
                let filename = file.name;
                if (type === 'converted' && file.targetFormat) {
                    // Ensure correct extension for converted files
                    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
                    filename = `${nameWithoutExt}.${file.targetFormat}`;
                }

                archive.append(fileStream as any, { name: filename });
            } catch (err) {
                console.error(`Error adding file ${file.id} to archive:`, err);
                // Continue with other files
            }
        }

        // Finalize the archive (this triggers the end of the stream)
        archive.finalize();

        // Return the stream as a response
        return new Response(stream as any, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="kowiz-bulk-download-${new Date().toISOString()}.zip"`,
            },
        });

    } catch (error) {
        console.error('Bulk download error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
