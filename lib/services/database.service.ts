import { db } from '../db';
import { files, type File, type NewFile, users, type User } from '../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export class DatabaseService {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserEmail(id: string, email: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ email, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createFile(fileData: NewFile): Promise<File> {
    const [file] = await db.insert(files).values(fileData).returning();
    return file;
  }

  async getFileById(id: string, userId?: string): Promise<File | undefined> {
    const conditions = userId
      ? and(eq(files.id, id), eq(files.userId, userId))
      : eq(files.id, id);

    const [file] = await db.select().from(files).where(conditions);
    return file;
  }

  async getAllFiles(userId?: string): Promise<File[]> {
    const query = userId
      ? db.select().from(files).where(eq(files.userId, userId)).orderBy(desc(files.createdAt))
      : db.select().from(files).orderBy(desc(files.createdAt));

    return await query;
  }

  async getFilesByUser(userId: string): Promise<File[]> {
    return await db.select().from(files).where(eq(files.userId, userId)).orderBy(desc(files.createdAt));
  }

  async getFilesByUserPaginated(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{ files: File[]; total: number }> {
    const offset = (page - 1) * limit;

    let conditions = eq(files.userId, userId);
    if (status) {
      conditions = and(conditions, eq(files.status, status))!;
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(conditions);

    const total = Number(countResult.count);

    const result = await db
      .select()
      .from(files)
      .where(conditions)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(files.createdAt));

    return { files: result, total };
  }



  async updateFileStatus(id: string, status: string, errorMessage?: string): Promise<File | undefined> {
    const updateData: any = { status, updatedAt: new Date() };

    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }

    if (status === 'converting') {
      // Clear error message when retrying
      updateData.errorMessage = null;
    }

    if (status === 'completed') {
      updateData.uploadedAt = new Date();
    }

    const [file] = await db
      .update(files)
      .set(updateData)
      .where(eq(files.id, id))
      .returning();
    return file;
  }

  async updateFileConversion(
    id: string,
    convertedSize: number,
    processedFilePath: string
  ): Promise<File | undefined> {
    const [file] = await db
      .update(files)
      .set({
        convertedSize,
        processedFilePath,
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(files.id, id))
      .returning();
    return file;
  }

  async incrementRetryCount(id: string): Promise<File | undefined> {
    const file = await this.getFileById(id);
    if (!file) return undefined;

    const [updatedFile] = await db
      .update(files)
      .set({
        retryCount: (file.retryCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(files.id, id))
      .returning();
    return updatedFile;
  }

  async updateConversionProgress(id: string, progress: number): Promise<File | undefined> {
    const [file] = await db
      .update(files)
      .set({
        conversionProgress: Math.min(100, Math.max(0, progress)),
        updatedAt: new Date(),
      })
      .where(eq(files.id, id))
      .returning();
    return file;
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }
}

export const databaseService = new DatabaseService();
