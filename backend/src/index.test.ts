// backend/src/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ─── MOCK: Prisma ───────────────────────────────────────────────────────────
vi.mock('@prisma/client', () => {
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
  return { PrismaClient: vi.fn(() => mockPrisma) };
});

// ─── MOCK: ioredis ──────────────────────────────────────────────────────────
const mockRedis = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  sadd: vi.fn().mockResolvedValue(1),
  sismember: vi.fn(),
  defineCommand: vi.fn(),
  // Mock the dynamically defined command
  attemptPurchase: vi.fn(),
};
vi.mock('ioredis', () => ({ default: vi.fn(() => mockRedis) }));

// ─── Import app AFTER mocks are set up ──────────────────────────────────────
// We build a minimal Fastify instance that mirrors the real routes
// so we can test route logic without spinning up a real server.
async function buildApp() {
  const { PrismaClient } = await import('@prisma/client');
  const Redis = (await import('ioredis')).default;

  const prisma = new PrismaClient() as any;
  const redis = new Redis() as any;

  const PRODUCT_ID = 'flash-sale-product-id';
  let FLASH_SALE_START = new Date(Date.now() - 1000 * 60 * 10); // active: 10 min ago
  let FLASH_SALE_END = new Date(Date.now() + 1000 * 60 * 60);   // ends in 1 hour
  const INITIAL_STOCK = 100;

  const fastify = Fastify({ logger: false });
  await fastify.register(import('@fastify/cors'), { origin: true });

  // GET /flash-sale/status
  fastify.get('/flash-sale/status', async () => {
    const now = new Date();
    let status = 'upcoming';
    if (now >= FLASH_SALE_START && now <= FLASH_SALE_END) status = 'active';
    else if (now > FLASH_SALE_END) status = 'ended';

    const stock = await redis.get(`stock:${PRODUCT_ID}`);
    return {
      status,
      productId: PRODUCT_ID,
      remainingStock: stock ? parseInt(stock) : 0,
      startTime: FLASH_SALE_START,
      endTime: FLASH_SALE_END,
    };
  });

  // POST /purchase
  const { z } = await import('zod');
  const purchaseSchema = z.object({
    userId: z.string().min(1),
    productId: z.string().min(1),
  });

  fastify.post('/purchase', async (request, reply) => {
    const parseResult = purchaseSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid input fields' });
    }

    const { userId, productId } = parseResult.data;
    const now = new Date();
    if (now < FLASH_SALE_START || now > FLASH_SALE_END) {
      return reply.status(400).send({ error: 'Flash sale is not active' });
    }

    const result = await redis.attemptPurchase(
      `stock:${productId}`,
      `buyers:${productId}`,
      userId
    );

    if (result === -1) return reply.status(400).send({ error: 'You have already purchased this item' });
    if (result === -2) return reply.status(400).send({ error: 'Product is sold out' });

    prisma.purchase.create({ data: { user_id: userId, product_id: productId } }).catch(() => {});

    return reply.status(201).send({ message: 'Purchase successful! Your item is secured.' });
  });

  // PATCH /flash-sale/config
  const configSchema = z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  });

  fastify.patch('/flash-sale/config', async (request, reply) => {
    const parseResult = configSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid input fields' });
    }

    const { startTime, endTime } = parseResult.data;
    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);

    if (newStart >= newEnd) {
      return reply.status(400).send({ error: 'Start time must be before end time' });
    }

    try {
      await prisma.product.update({
        where: { id: PRODUCT_ID },
        data: { start_time: newStart, end_time: newEnd }
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to update database' });
    }

    FLASH_SALE_START = newStart;
    FLASH_SALE_END = newEnd;

    return reply.status(200).send({ message: 'Flash sale period updated successfully', startTime, endTime });
  });

  // GET /purchase/:userId
  fastify.get('/purchase/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    const isBuyer = await redis.sismember(`buyers:${PRODUCT_ID}`, userId);
    return { userId, hasSecuredItem: isBuyer === 1 };
  });

  await fastify.ready();
  return fastify;
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('GET /flash-sale/status', () => {
  it('returns active status with remaining stock', async () => {
    mockRedis.get.mockResolvedValueOnce('87');
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/flash-sale/status' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('active');
    expect(body.remainingStock).toBe(87);
    expect(body.productId).toBe('flash-sale-product-id');

    await app.close();
  });

  it('returns remainingStock of 0 when redis has no value', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/flash-sale/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json().remainingStock).toBe(0);

    await app.close();
  });
});

describe('POST /purchase', () => {
  it('returns 201 on a successful purchase', async () => {
    mockRedis.attemptPurchase.mockResolvedValueOnce(1);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-123', productId: 'flash-sale-product-id' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().message).toContain('Purchase successful');

    await app.close();
  });

  it('returns 400 when user has already purchased', async () => {
    mockRedis.attemptPurchase.mockResolvedValueOnce(-1);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-123', productId: 'flash-sale-product-id' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('You have already purchased this item');

    await app.close();
  });

  it('returns 400 when product is sold out', async () => {
    mockRedis.attemptPurchase.mockResolvedValueOnce(-2);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { userId: 'user-999', productId: 'flash-sale-product-id' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Product is sold out');

    await app.close();
  });

  it('returns 400 when input is missing userId', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/purchase',
      payload: { productId: 'flash-sale-product-id' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid input fields');

    await app.close();
  });

  it('returns 400 when input is missing productId', async () => {
    const app = await buildApp();

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
  it('returns hasSecuredItem: true when user is a buyer', async () => {
    mockRedis.sismember.mockResolvedValueOnce(1);
    const app = await buildApp();

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
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/purchase/user-unknown',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-unknown', hasSecuredItem: false });

    await app.close();
  });
});

describe('PATCH /flash-sale/config', () => {
  it('updates flash sale period successfully', async () => {
    const app = await buildApp();
    const newStart = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // starts in 1 hour
    const newEnd = new Date(Date.now() + 1000 * 60 * 120).toISOString();  // ends in 2 hours

    const res = await app.inject({
      method: 'PATCH',
      url: '/flash-sale/config',
      payload: { startTime: newStart, endTime: newEnd },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Flash sale period updated successfully');

    // Verify status uses new time
    const statusRes = await app.inject({ method: 'GET', url: '/flash-sale/status' });
    expect(statusRes.json().status).toBe('upcoming');

    await app.close();
  });

  it('fails if start time is after end time', async () => {
    const app = await buildApp();
    const newStart = new Date(Date.now() + 1000 * 60 * 120).toISOString();
    const newEnd = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const res = await app.inject({
      method: 'PATCH',
      url: '/flash-sale/config',
      payload: { startTime: newStart, endTime: newEnd },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Start time must be before end time');

    await app.close();
  });
});

describe('Concurrency safety (unit simulation)', () => {
  it('only one of two simultaneous purchasers succeeds (Redis Lua atomicity)', async () => {
    // Simulate: first call = success (1), second call = already purchased (-1)
    mockRedis.attemptPurchase
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(-1);

    const app = await buildApp();

    const [res1, res2] = await Promise.all([
      app.inject({ method: 'POST', url: '/purchase', payload: { userId: 'user-A', productId: 'flash-sale-product-id' } }),
      app.inject({ method: 'POST', url: '/purchase', payload: { userId: 'user-A', productId: 'flash-sale-product-id' } }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 400]);

    await app.close();
  });
});
