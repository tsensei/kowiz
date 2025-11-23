import { Queue, QueueOptions } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};

export interface ConversionJobData {
  fileId: string;
  fileName: string;
  mimeType: string;
}

export class QueueService {
  private conversionQueue: Queue<ConversionJobData>;

  constructor() {
    const queueOptions: QueueOptions = {
      connection,
    };

    this.conversionQueue = new Queue<ConversionJobData>('file-conversion', queueOptions);
  }

  async addConversionJob(jobData: ConversionJobData): Promise<void> {
    await this.conversionQueue.add('convert-heic', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }

  async getQueue() {
    return this.conversionQueue;
  }
}

export const queueService = new QueueService();

