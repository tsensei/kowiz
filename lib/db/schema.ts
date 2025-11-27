import { pgTable, uuid, varchar, bigint, timestamp, text, boolean, jsonb, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  wikimediaId: varchar('wikimedia_id', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(), // original size in bytes
  mimeType: varchar('mime_type', { length: 100 }).notNull(),

  // Media categorization
  category: varchar('category', { length: 50 }).notNull(), // image, video, audio, raw
  
  // Format tracking
  originalFormat: varchar('original_format', { length: 50 }).notNull(), // e.g., heic, mp4, mp3
  targetFormat: varchar('target_format', { length: 50 }), // e.g., jpeg, webm, ogg
  needsConversion: varchar('needs_conversion', { length: 10 }).notNull().default('true'), // true, false
  
  // Size tracking
  convertedSize: bigint('converted_size', { mode: 'number' }), // size after conversion in bytes
  
  // Import tracking
  importSource: varchar('import_source', { length: 50 }).notNull().default('upload'), // upload, youtube, direct_url
  sourceUrl: text('source_url'), // Original URL if imported
  batchId: varchar('batch_id', { length: 255 }), // upload batch identifier
  notifyOnComplete: boolean('notify_on_complete').notNull().default(false),
  
  // Storage paths
  rawFilePath: varchar('raw_file_path', { length: 500 }).notNull(), // path in raw-files bucket
  processedFilePath: varchar('processed_file_path', { length: 500 }), // path in processed-files bucket
  
  // Status and error tracking
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, queued, downloading, converting, uploading, completed, failed
  errorMessage: text('error_message'),
  retryCount: bigint('retry_count', { mode: 'number' }).default(0),
  conversionProgress: integer('conversion_progress').default(0), // 0-100 percentage for real-time progress
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  convertedAt: timestamp('converted_at'),
  uploadedAt: timestamp('uploaded_at'),
});

export const notificationRequests = pgTable('notification_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchId: varchar('batch_id', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  totalFiles: integer('total_files').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, sent, failed
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastError: text('last_error'),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // nullable for system actions
  username: varchar('username', { length: 255 }), // denormalized for historical tracking
  action: varchar('action', { length: 100 }).notNull(), // upload, download, convert, delete, import, retry, etc.
  resourceType: varchar('resource_type', { length: 50 }).notNull(), // file, user, system
  resourceId: uuid('resource_id'), // ID of the affected resource
  metadata: jsonb('metadata'), // flexible JSON field for action-specific data
  success: boolean('success').notNull().default(true),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type NotificationRequest = typeof notificationRequests.$inferSelect;
export type NewNotificationRequest = typeof notificationRequests.$inferInsert;
