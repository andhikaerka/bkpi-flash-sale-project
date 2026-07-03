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
describe('POST /purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 on a successful purchase', async () => {
    mockRedis.attemptPurchase.mockResolvedValueOnce(PurchaseResult.Success);
    const app = await getApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-123', productId: PRODUCT_ID },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().message).toContain('Purchase successful');

    await app.close();
  });

  it('returns 400 when user has already purchased', async () => {
    mockRedis.attemptPurchase.mockResolvedValueOnce(PurchaseResult.AlreadyPurchased);
    const app = await getApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-123', productId: PRODUCT_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('You have already purchased this item');

    await app.close();
  });

  it('returns 400 when product is sold out', async () => {
    mockRedis.attemptPurchase.mockResolvedValueOnce(PurchaseResult.OutOfStock);
    const app = await getApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-999', productId: PRODUCT_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Product is sold out');

    await app.close();
  });

  it('returns 400 when input is missing userId', async () => {
    const app = await getApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { productId: PRODUCT_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid input fields');

    await app.close();
  });

  it('returns 400 when input is missing productId', async () => {
    const app = await getApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-123' },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});

describe('GET /purchase/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns hasSecuredItem: true when user is a buyer', async () => {
    mockRedis.sismember.mockResolvedValueOnce(1);
    const app = await getApp();

    const res = await app.inject({
      method: 'GET',
      url: '/purchase/user-123',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-123', hasSecuredItem: true });

    await app.close();
  });

  it('returns hasSecuredItem: false when user has not purchased', async () => {
    mockRedis.sismember.mockResolvedValueOnce(0);
    const app = await getApp();

    const res = await app.inject({
      method: 'GET',
      url: '/purchase/user-unknown',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-unknown', hasSecuredItem: false });

    await app.close();
  });
});
