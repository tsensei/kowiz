import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { databaseService } from '@/lib/services/database.service';
import { notificationService } from '@/lib/services/notification.service';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';

const updateSchema = z.object({
  email: z.string().email(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await databaseService.getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const quota = await notificationService.getDailyStats(user.id);

  return NextResponse.json({
    id: user.id,
    username: user.username,
    email: user.email,
    notificationQuota: {
      limit: quota.limit,
      used: quota.sent,
      pending: quota.pending,
      remaining: quota.remaining,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const updatedUser = await databaseService.updateUserEmail(session.user.id, parsed.data.email);

  if (!updatedUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await logAudit({
    userId: updatedUser.id,
    username: updatedUser.username,
    action: 'user.update_email',
    resourceType: 'user',
    resourceId: updatedUser.id,
    metadata: { email: updatedUser.email },
  });

  return NextResponse.json({
    id: updatedUser.id,
    username: updatedUser.username,
    email: updatedUser.email,
  });
}
