import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';

export type AuditAction =
  | 'file.upload'
  | 'file.download'
  | 'file.stream'
  | 'file.convert'
  | 'file.delete'
  | 'file.retry'
  | 'file.import.url'
  | 'file.import.youtube'
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.update_email'
  | 'admin.access'
  | 'system.cleanup'
  | 'system.requeue';

export type AuditResourceType = 'file' | 'user' | 'system';

interface AuditLogParams {
  userId?: string;
  username?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  metadata?: Record<string, any>;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Log an audit event
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const {
      userId,
      username,
      action,
      resourceType,
      resourceId,
      metadata,
      success = true,
      errorMessage,
    } = params;

    await db.insert(auditLogs).values({
      userId: userId || null,
      username: username || null,
      action,
      resourceType,
      resourceId: resourceId || null,
      metadata: metadata || null,
      success,
      errorMessage: errorMessage || null,
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    console.error('Failed to log audit event:', error);
  }
}
