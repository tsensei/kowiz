import { NextResponse } from 'next/server';
import { databaseService } from '@/lib/services/database.service';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || undefined;
    const all = searchParams.get('all') === 'true';

    if (all) {
      const files = await databaseService.getFilesByUser(session.user.id);
      return NextResponse.json({ files });
    }

    const { files, total } = await databaseService.getFilesByUserPaginated(
      session.user.id,
      page,
      limit,
      status
    );

    return NextResponse.json({
      files,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

