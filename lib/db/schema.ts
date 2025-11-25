import { pgTable, uuid, varchar, bigint, timestamp, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  wikimediaId: varchar('wikimedia_id', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
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
  
  // Storage paths
  rawFilePath: varchar('raw_file_path', { length: 500 }).notNull(), // path in raw-files bucket
  processedFilePath: varchar('processed_file_path', { length: 500 }), // path in processed-files bucket
  
  // Status and error tracking
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, queued, downloading, converting, uploading, completed, failed
  errorMessage: text('error_message'),
  retryCount: bigint('retry_count', { mode: 'number' }).default(0),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  convertedAt: timestamp('converted_at'),
  uploadedAt: timestamp('uploaded_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

