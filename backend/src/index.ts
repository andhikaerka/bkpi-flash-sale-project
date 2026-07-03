import { buildApp } from './app';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { FlashSaleService } from './services/FlashSaleService';
import { PrismaProductRepository } from './infrastructure/repositories/PrismaProductRepository';
import { PrismaPurchaseRepository } from './infrastructure/repositories/PrismaPurchaseRepository';
import { RedisCacheRepository } from './infrastructure/repositories/RedisCacheRepository';
import { BullMQPurchaseQueue } from './infrastructure/queues/BullMQPurchaseQueue';
import { PRODUCT_ID, INITIAL_STOCK, DEFAULT_START_TIME, DEFAULT_END_TIME } from './config/constants';
import { env } from './config/env';

/**
 * Entry point aplikasi — satu-satunya Composition Root yang sah.
 *
 * Urutan inisialisasi:
 * 1. Fastify app dibuat terlebih dahulu agar `app.log` (Pino) tersedia sebagai logger.
 * 2. Infrastructure & repository layer dirakit.
 * 3. FlashSaleService dibuat dengan logger dari Fastify (bukan console).
 * 4. initializeSystem() dipanggil untuk sinkronisasi DB & Redis.
 * 5. Server mulai menerima request.
 */
const start = async () => {
  // Buat app duluan agar logger Pino tersedia untuk di-inject ke service
  const app = buildApp();

  try {
    // --- Infrastructure Layer ---
    const prismaClient = new PrismaClient();
    const redisClient = new Redis(env.REDIS_URL);

    // --- Repository & Queue Layer ---
    const productRepo = new PrismaProductRepository(prismaClient);
    const purchaseRepo = new PrismaPurchaseRepository(prismaClient);
    const cacheRepo = new RedisCacheRepository(redisClient);
    
    // Gunakan koneksi redis yang terpisah (atau sama, tapi BullMQ biasanya butuh connection object `ioredis`)
    const purchaseQueue = new BullMQPurchaseQueue(redisClient, purchaseRepo, app.log);

    // --- Service Layer ---
    // app.log adalah Pino logger dari Fastify — terstruktur, level-aware, dan konsisten
    const flashSaleService = new FlashSaleService(productRepo, purchaseRepo, purchaseQueue, cacheRepo, {
      productId: PRODUCT_ID,
      initialStock: INITIAL_STOCK,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    }, app.log);

    // Sinkronisasi database dan redis (Self-Healing) sebelum server menerima request
    await flashSaleService.initializeSystem();

    // Daftarkan routes dengan service yang sudah ter-inisialisasi
    app.register(require('./routes/flashSaleRoutes').default, { flashSaleService });

    const port = parseInt(env.PORT, 10);
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`⚡ Server Flash Sale berjalan di http://localhost:${port}`);

    // --- Graceful Shutdown ---
    const shutdown = async (signal: string) => {
      app.log.info(`\n🛑 Menerima sinyal ${signal}. Menutup server secara elegan...`);
      try {
        await app.close();
        await purchaseQueue.close();
        await prismaClient.$disconnect();
        redisClient.quit();
        app.log.info('✅ Graceful shutdown selesai.');
        process.exit(0);
      } catch (err) {
        app.log.error(err, '❌ Error saat graceful shutdown:');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    // Note: since app might not be defined if buildApp fails, this needs to be safe.
    // However, app is instantiated before try block, so it's safe.
    app.log.error(err, 'Server failed to start');
    process.exit(1);
  }
};

start();