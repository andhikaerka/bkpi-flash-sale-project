import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app';
import { PRODUCT_ID, INITIAL_STOCK, DEFAULT_START_TIME, DEFAULT_END_TIME } from '../config/constants';
import { FlashSaleService } from '../services/FlashSaleService';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaPurchaseRepository } from '../infrastructure/repositories/PrismaPurchaseRepository';
import { RedisCacheRepository } from '../infrastructure/repositories/RedisCacheRepository';
import { PurchaseResult } from '../domain/repositories/ICacheRepository';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import flashSaleRoutes from '../routes/flashSaleRoutes';

// ─── MOCK: Prisma ───────────────────────────────────────────────────────────
const mockPrisma = {
  purchase: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
  },
  product: {
    upsert: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null),
  },
};
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));

// ─── MOCK: ioredis ──────────────────────────────────────────────────────────
const mockRedis = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  sadd: vi.fn().mockResolvedValue(1),
  sismember: vi.fn(),
  defineCommand: vi.fn(),
  attemptPurchase: vi.fn(),
};
vi.mock('ioredis', () => ({ default: vi.fn(() => mockRedis) }));

// ─── SETUP APP ──────────────────────────────────────────────────────────────
async function getApp() {
  const prismaClient = new PrismaClient();
  const redisClient = new Redis();

  const productRepo = new PrismaProductRepository(prismaClient);
  const purchaseRepo = new PrismaPurchaseRepository(prismaClient);
  const cacheRepo = new RedisCacheRepository(redisClient);

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockPurchaseQueue = {
    addPurchaseJob: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const flashSaleService = new FlashSaleService(productRepo, purchaseRepo, mockPurchaseQueue, cacheRepo, {
    productId: PRODUCT_ID,
    initialStock: INITIAL_STOCK,
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
  }, mockLogger);

  const app = buildApp();
  app.register(flashSaleRoutes, { flashSaleService });

  await app.ready();
  return app;
}

// ─── TESTS ──────────────────────────────────────────────────────────────────
describe('Concurrency safety (unit simulation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only one of two simultaneous purchasers succeeds (Redis Lua atomicity)', async () => {
    // Simulate: first call = success, second call = already purchased
    mockRedis.attemptPurchase
      .mockResolvedValueOnce(PurchaseResult.Success)
      .mockResolvedValueOnce(PurchaseResult.AlreadyPurchased);

    const app = await getApp();

    const [res1, res2] = await Promise.all([
      app.inject({ method: 'POST', url: '/purchase', payload: { userId: 'user-A', productId: PRODUCT_ID } }),
      app.inject({ method: 'POST', url: '/purchase', payload: { userId: 'user-A', productId: PRODUCT_ID } }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 400]);

    await app.close();
  });
});
