import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

export const BUCKETS = {
  RAW_FILES: 'raw-files',
  PROCESSED_FILES: 'processed-files',
} as const;

export class MinioService {
  private client: Minio.Client;

  constructor() {
    this.client = minioClient;
  }

  async uploadFile(
    bucketName: string,
    fileName: string,
    fileBuffer: Buffer,
    metadata?: Record<string, string>
  ): Promise<void> {
    await this.client.putObject(bucketName, fileName, fileBuffer, fileBuffer.length, metadata);
  }

  async downloadFile(bucketName: string, fileName: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = await this.client.getObject(bucketName, fileName);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async deleteFile(bucketName: string, fileName: string): Promise<void> {
    await this.client.removeObject(bucketName, fileName);
  }

  async getFileUrl(bucketName: string, fileName: string, expirySeconds: number = 3600): Promise<string> {
    return await this.client.presignedGetObject(bucketName, fileName, expirySeconds);
  }

  async fileExists(bucketName: string, fileName: string): Promise<boolean> {
    try {
      await this.client.statObject(bucketName, fileName);
      return true;
    } catch {
      return false;
    }
  }
}

export const minioService = new MinioService();

