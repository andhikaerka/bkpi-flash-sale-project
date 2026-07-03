import { IProductRepository } from '../domain/repositories/IProductRepository';
import { IPurchaseRepository } from '../domain/repositories/IPurchaseRepository';
import { ICacheRepository, PurchaseResult } from '../domain/repositories/ICacheRepository';
import {
  FlashSaleNotActiveError,
  AlreadyPurchasedError,
  OutOfStockError,
  InvalidTimeRangeError,
} from '../domain/errors/FlashSaleErrors';
import { IFlashSaleService } from '../domain/services/IFlashSaleService';
import { ILogger } from '../domain/logger/ILogger';
import { IPurchaseQueue } from '../domain/queues/IPurchaseQueue';

export interface FlashSaleConfig {
  productId: string;
  initialStock: number;
  startTime: Date;
  endTime: Date;
}

export interface FlashSaleStatus {
  status: 'upcoming' | 'active' | 'ended';
  productId: string;
  remainingStock: number;
  startTime: Date;
  endTime: Date;
}

/**
 * FlashSaleService — Service Layer.
 *
 * SOLID Compliance:
 * - S (SRP): Hanya bertanggung jawab atas logika bisnis flash sale.
 * - O (OCP): Dapat diperluas dengan behavior baru tanpa memodifikasi class ini (mis. via decorator).
 * - L (LSP): Tidak berlaku langsung, namun service dapat diganti dengan implementasi lain jika ada interface.
 * - I (ISP): Mengkonsumsi interface-interface kecil dan terfokus (IProductRepo, IPurchaseRepo, ICacheRepo).
 * - D (DIP): Bergantung pada abstraksi (interfaces), bukan implementasi konkret (Prisma, Redis).
 */
export class FlashSaleService implements IFlashSaleService {
  // State waktu flash sale disimpan di-memory dalam instance ini,
  // dan disinkronisasi dari database saat initializeSystem() dipanggil.
  private startTime: Date;
  private endTime: Date;

  constructor(
    private readonly productRepo: IProductRepository,
    private readonly purchaseRepo: IPurchaseRepository,
    private readonly purchaseQueue: IPurchaseQueue,
    private readonly cacheRepo: ICacheRepository,
    private readonly config: FlashSaleConfig,
    private readonly logger: ILogger
  ) {
    // Default state (akan di-override oleh initializeSystem)
    this.startTime = config.startTime;
    this.endTime = config.endTime;
  }

  /**
   * Inisialisasi awal sistem: Sinkronisasi database dan redis (Self-Healing).
   * Dipanggil sekali saat server startup.
   */
  async initializeSystem(): Promise<void> {
    const lockKey = `lock:initialize_system:${this.config.productId}`;
    // Coba dapatkan lock selama 60 detik
    const lockAcquired = await this.cacheRepo.acquireLock(lockKey, 60);

    if (!lockAcquired) {
      this.logger.info(`[Init] Pod lain sedang melakukan inisialisasi untuk ${this.config.productId}. Melewati sinkronisasi.`);
      return;
    }

    try {
      // 1. Ambil state terkini dari database
      const existingProduct = await this.productRepo.findById(this.config.productId);
      const existingPurchases = await this.purchaseRepo.findAllByProductId(
        this.config.productId
      );

      const purchaseCount = existingPurchases.length;
      const calculatedCurrentStock = this.config.initialStock - purchaseCount;

      this.logger.info(
        `[Init] Sinkronisasi DB... Terjual: ${purchaseCount}, Sisa Stok: ${calculatedCurrentStock}`
      );

      // 2. Upsert produk ke database
      await this.productRepo.upsert({
        id: this.config.productId,
        name: 'Flash Sale Product',
        initialStock: this.config.initialStock,
        currentStock: calculatedCurrentStock,
        startTime: this.config.startTime,
        endTime: this.config.endTime,
      });

      // Update state di memory/instance
      this.startTime = this.config.startTime;
      this.endTime = this.config.endTime;

      // 3. Sinkronisasi sisa stok ke Redis (Self-Healing)
      await this.cacheRepo.set(`stock:${this.config.productId}`, calculatedCurrentStock.toString());

      // 4. Sinkronisasi daftar pembeli ke Redis Set (Self-Healing)
      await this.cacheRepo.del(`buyers:${this.config.productId}`);
      if (purchaseCount > 0) {
        const userIds = existingPurchases.map((p) => p.userId);
        await this.cacheRepo.addToSet(`buyers:${this.config.productId}`, ...userIds);
      }

      this.logger.info(`[Init] Sistem Flash Sale berhasil diinisialisasi untuk produk ${this.config.productId}.`);
    } finally {
      // Selalu lepas lock setelah selesai, bahkan jika terjadi error
      await this.cacheRepo.releaseLock(lockKey);
    }
  }

  /**
   * Mendapatkan status flash sale saat ini beserta sisa stok.
   */
  async getStatus(): Promise<FlashSaleStatus> {
    const now = new Date();
    let status: FlashSaleStatus['status'] = 'upcoming';

    if (now >= this.startTime && now <= this.endTime) {
      status = 'active';
    } else if (now > this.endTime) {
      status = 'ended';
    }

    // Ambil sisa stok dari Redis untuk performa tinggi
    const remainingStock = await this.cacheRepo.get(`stock:${this.config.productId}`);

    return {
      status,
      productId: this.config.productId,
      remainingStock: remainingStock ?? 0,
      startTime: this.startTime,
      endTime: this.endTime,
    };
  }

  /**
   * Mencoba melakukan pembelian produk (atomik dengan Redis).
   */
  async attemptPurchase(userId: string, productId: string): Promise<void> {
    const now = new Date();
    if (now < this.startTime || now > this.endTime) {
      throw new FlashSaleNotActiveError();
    }

    // Eksekusi Atomic Operation di Redis
    const result = await this.cacheRepo.attemptPurchase(
      `stock:${productId}`,
      `buyers:${productId}`,
      userId
    );

    if (result === PurchaseResult.AlreadyPurchased) {
      throw new AlreadyPurchasedError();
    }

    if (result === PurchaseResult.OutOfStock) {
      throw new OutOfStockError();
    }

    // JIKA LOLOS REDIS: Kirim pesanan ke Antrean Queue (BullMQ) untuk diproses ke PostgreSQL secara aman
    await this.purchaseQueue.addPurchaseJob(userId, productId);
  }

  /**
   * Mengecek apakah user berhasil mengamankan item (lewat Redis Set).
   */
  async checkPurchase(userId: string): Promise<boolean> {
    return this.cacheRepo.isBuyer(`buyers:${this.config.productId}`, userId);
  }

  /**
   * Memperbarui konfigurasi waktu flash sale.
   */
  async updateConfig(newStart: Date, newEnd: Date): Promise<void> {
    if (newStart >= newEnd) {
      throw new InvalidTimeRangeError();
    }

    await this.productRepo.updateConfig(this.config.productId, newStart, newEnd);

    // Update in-memory state
    this.startTime = newStart;
    this.endTime = newEnd;
  }
}
