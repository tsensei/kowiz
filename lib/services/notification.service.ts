import { db } from '@/lib/db';
import { files, notificationRequests, users, type File as DbFile, type NotificationRequest } from '@/lib/db/schema';
import { emailService } from './email.service';
import { and, eq, gte, sql } from 'drizzle-orm';

const ACTIVE_STATUSES = ['pending', 'queued', 'downloading', 'converting'];
const DAILY_LIMIT = 5;
const MAX_RETRIES = 3; // keep in sync with worker.ts

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export class NotificationService {
  async getDailyStats(userId: string) {
    const today = startOfToday();

    const [sentRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRequests)
      .where(
        and(
          eq(notificationRequests.userId, userId),
          eq(notificationRequests.status, 'sent'),
          gte(notificationRequests.sentAt, today)
        )
      );

    const [pendingRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notificationRequests)
      .where(
        and(
          eq(notificationRequests.userId, userId),
          eq(notificationRequests.status, 'pending'),
          gte(notificationRequests.createdAt, today)
        )
      );

    const sent = Number(sentRow?.count ?? 0);
    const pending = Number(pendingRow?.count ?? 0);
    const remaining = Math.max(DAILY_LIMIT - (sent + pending), 0);

    return {
      sent,
      pending,
      remaining,
      limit: DAILY_LIMIT,
    };
  }

  async canRequest(userId: string) {
    const stats = await this.getDailyStats(userId);
    return stats.remaining > 0;
  }

  async createRequest(params: {
    userId: string;
    batchId: string;
    email: string;
    totalFiles: number;
  }): Promise<NotificationRequest> {
    const [row] = await db
      .insert(notificationRequests)
      .values({
        userId: params.userId,
        batchId: params.batchId,
        email: params.email,
        totalFiles: params.totalFiles,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return row;
  }

  async getRequestByBatch(batchId: string): Promise<NotificationRequest | undefined> {
    const [row] = await db
      .select()
      .from(notificationRequests)
      .where(eq(notificationRequests.batchId, batchId));
    return row;
  }

  async markSent(id: string): Promise<void> {
    await db
      .update(notificationRequests)
      .set({
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(notificationRequests.id, id));
  }

  async markFailed(id: string, message?: string): Promise<void> {
    await db
      .update(notificationRequests)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        lastError: message,
      })
      .where(eq(notificationRequests.id, id));
  }

  async checkAndSendForBatch(batchId?: string, username?: string) {
    if (!batchId) {
      return { sent: false, reason: 'no-batch-id' };
    }

    const request = await this.getRequestByBatch(batchId);
    if (!request || request.status !== 'pending') {
      return { sent: false, reason: 'no-pending-request' };
    }

    const batchFiles = await db
      .select()
      .from(files)
      .where(eq(files.batchId, batchId));

    if (!batchFiles.length) {
      return { sent: false, reason: 'no-files' };
    }

    if (batchFiles.length < request.totalFiles) {
      return { sent: false, reason: 'awaiting-files' };
    }

    const hasActive = batchFiles.some((file) => {
      if (ACTIVE_STATUSES.includes(file.status)) return true;
      if (file.status === 'failed' && (file.retryCount || 0) < MAX_RETRIES) return true;
      return false;
    });

    if (hasActive) {
      return { sent: false, reason: 'still-processing' };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.userId));

    const stats = await this.getDailyStats(request.userId);

    if (stats.sent >= DAILY_LIMIT) {
      await this.markFailed(request.id, 'Daily notification limit reached before sending');
      return { sent: false, reason: 'limit-exhausted' };
    }

    const emailResult = await emailService.sendBatchCompleteEmail({
      to: request.email,
      username: username || user?.username || user?.email,
      batchId,
      files: batchFiles as DbFile[],
    });

    if (!emailResult.success) {
      await this.markFailed(request.id, emailResult.error);
      return { sent: false, reason: 'send-failed', error: emailResult.error };
    }

    await this.markSent(request.id);
    return { sent: true };
  }
}

export const notificationService = new NotificationService();
