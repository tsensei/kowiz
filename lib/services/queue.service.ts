import { PgBoss } from 'pg-boss';

const connectionString = `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || 'postgres'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || 5432}/${process.env.DATABASE_NAME || 'kowiz'}`;

export interface ConversionJobData {
  fileId: string;
  fileName: string;
  mimeType: string;
}

export class QueueService {
  private boss: PgBoss;
  private started: boolean = false;

  constructor() {
    this.boss = new PgBoss(connectionString);
  }

  async start(): Promise<void> {
    if (!this.started) {
      await this.boss.start();
      
      // Create the queue if it doesn't exist
      // pg-boss requires explicit queue creation
      try {
        await this.boss.createQueue('file-conversion');
      } catch (error) {
        // Queue might already exist, that's okay
        // pg-boss throws if queue already exists
      }
      
      this.started = true;
      console.log('✓ pg-boss queue started');
    }
  }

  async stop(): Promise<void> {
    if (this.started) {
      await this.boss.stop();
      this.started = false;
      console.log('✓ pg-boss queue stopped');
    }
  }

  async addConversionJob(jobData: ConversionJobData): Promise<void> {
    await this.start();
    
    await this.boss.send('file-conversion', jobData, {
      retryLimit: 3,
      retryDelay: 2,
      retryBackoff: true,
      expireInSeconds: 60 * 60, // 1 hour
    });
  }

  getBoss(): PgBoss {
    return this.boss;
  }
}

export const queueService = new QueueService();

