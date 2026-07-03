import { Queue, Worker, Job } from 'bullmq';
import { IPurchaseQueue } from '../../domain/queues/IPurchaseQueue';
import { IPurchaseRepository } from '../../domain/repositories/IPurchaseRepository';
import { ILogger } from '../../domain/logger/ILogger';

export class BullMQPurchaseQueue implements IPurchaseQueue {
  private queue: Queue;
  private worker: Worker;

  constructor(
    connection: any, // Redis connection string or object compatible with BullMQ
    private readonly purchaseRepo: IPurchaseRepository,
    private readonly logger: ILogger
  ) {
    const queueName = 'purchase-queue';

    this.queue = new Queue(queueName, { connection });

    // Inisialisasi Worker yang akan memproses antrean
    this.worker = new Worker(queueName, async (job: Job) => {
      const { userId, productId } = job.data;
      await this.purchaseRepo.create(userId, productId);
    }, { 
      connection,
      concurrency: 5 // Proses 5 purchase sekaligus
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(err, `[Worker] Job ${job?.id} (user: ${job?.data?.userId}) gagal disimpan ke DB.`);
    });
    
    this.worker.on('completed', (job) => {
      this.logger.info(`[Worker] Job ${job?.id} (user: ${job?.data?.userId}) berhasil disimpan ke DB.`);
    });
  }

  async addPurchaseJob(userId: string, productId: string): Promise<void> {
    await this.queue.add('process-purchase', { userId, productId }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.worker.close();
  }
}
