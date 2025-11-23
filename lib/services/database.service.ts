import { db } from '../db';
import { files, type File, type NewFile } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

export class DatabaseService {
  async createFile(fileData: NewFile): Promise<File> {
    const [file] = await db.insert(files).values(fileData).returning();
    return file;
  }

  async getFileById(id: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async getAllFiles(): Promise<File[]> {
    return await db.select().from(files).orderBy(desc(files.createdAt));
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

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }
}

export const databaseService = new DatabaseService();

