// backend/src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';

const logger = {
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
};

const fastify = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : logger });
fastify.register(cors, {
  origin: true
});
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// --- DUMMY CONFIG UNTUK FLASH SALE ---
const PRODUCT_ID = "flash-sale-product-id";
const FLASH_SALE_START = new Date(Date.now() - 1000 * 60 * 10); // Sudah mulai 10 menit lalu
const FLASH_SALE_END = new Date(Date.now() + 1000 * 60 * 60);   // Selesai 1 jam lagi
const INITIAL_STOCK = 100;

// --- REDIS LUA SCRIPT FOR ATOMIC OPERATIONS ---
// Fungsi: Mengecek duplikasi user & mengurangi stok secara atomik dalam 1 waktu (thread-safe)
const purchaseLuaScript = `
  local stockKey = KEYS[1]
  local buyersKey = KEYS[2]
  local userId = ARGV[1]

  -- 1. Cek apakah user sudah pernah membeli
  if redis.call('SISMEMBER', buyersKey, userId) == 1 then
    return -1
  end

  -- 2. Cek ketersediaan stok
  local currentStock = tonumber(redis.call('GET', stockKey))
  if not currentStock or currentStock <= 0 then
    return -2
  end

  -- 3. Potong stok dan catat user ke dalam Set[cite: 1]
  redis.call('DECR', stockKey)
  redis.call('SADD', buyersKey, userId)
  return 1
`;

// Register script ke ioredis
redis.defineCommand('attemptPurchase', {
  numberOfKeys: 2,
  lua: purchaseLuaScript,
});

// --- API ENDPOINTS ---

// 1. Endpoint: Cek status flash sale[cite: 1]
fastify.get('/flash-sale/status', async (request, reply) => {
  const now = new Date();
  let status = 'upcoming';

  if (now >= FLASH_SALE_START && now <= FLASH_SALE_END) {
    status = 'active';
  } else if (now > FLASH_SALE_END) {
    status = 'ended';
  }

  // Ambil sisa stok dari Redis untuk performa tinggi
  const stock = await redis.get(`stock:${PRODUCT_ID}`);

  return {
    status,
    productId: PRODUCT_ID,
    remainingStock: stock ? parseInt(stock) : 0,
    startTime: FLASH_SALE_START,
    endTime: FLASH_SALE_END
  };
});

// 2. Endpoint: Mencoba melakukan pembelian (High Throughput)[cite: 1]
const purchaseSchema = z.object({
  userId: z.string().min(1),
  productId: z.string().min(1),
});

fastify.post('/purchase', async (request, reply) => {
  // Validasi input dengan Zod
  const parseResult = purchaseSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({ error: "Invalid input fields", details: parseResult.error.format() });
  }

  const { userId, productId } = parseResult.data;

  // Validasi Waktu Flash Sale[cite: 1]
  const now = new Date();
  if (now < FLASH_SALE_START || now > FLASH_SALE_END) {
    return reply.status(400).send({ error: "Flash sale is not active" });
  }

  // Eksekusi Atomic Operation di Redis
  // @ts-ignore (mengabaikan warning tipe dynamic command ioredis)
  const result = await redis.attemptPurchase(`stock:${productId}`, `buyers:${productId}`, userId);

  if (result === -1) {
    return reply.status(400).send({ error: "You have already purchased this item" }); // Aturan 1 item per user[cite: 1]
  }

  if (result === -2) {
    return reply.status(400).send({ error: "Product is sold out" }); // Mencegah overselling[cite: 1]
  }

  // JIKA LOLOS REDIS: Kirim pesanan ke PostgreSQL secara asinkronus (Opsi Fire-and-Forget)
  // Cara ini membuat API merespons dengan kilat tanpa tertahan latensi database
  prisma.purchase.create({
    data: { user_id: userId, product_id: productId }
  }).catch((err) => {
    // Log jika terjadi kegagalan sistem di latar belakang
    fastify.log.error(`Fails to write purchase to DB for user ${userId}: ${err.message}`);
  });

  return reply.status(201).send({ message: "Purchase successful! Your item is secured." });
});

// 3. Endpoint: Cek apakah user berhasil mengamankan item[cite: 1]
fastify.get('/purchase/:userId', async (request, reply) => {
  const { userId } = request.params as { userId: string };

  // Cek ke Redis Set (lebih cepat dari DB)
  const isBuyer = await redis.sismember(`buyers:${PRODUCT_ID}`, userId);

  return {
    userId,
    hasSecuredItem: isBuyer === 1
  };
});

// --- SEEDING & START SERVER ---
const start = async () => {
  try {
    // Sinkronisasi stok & pembeli ke Redis dari database (Self-Healing / State Recovery)
    const existingPurchases = await prisma.purchase.findMany({
      where: { product_id: PRODUCT_ID },
      select: { user_id: true }
    });

    const purchaseCount = existingPurchases.length;
    const remainingStock = Math.max(0, INITIAL_STOCK - purchaseCount);

    // Inisialisasi data produk awal di Postgres sebelum server melayani request
    await prisma.product.upsert({
      where: { id: PRODUCT_ID },
      update: {
        current_stock: remainingStock,
        start_time: FLASH_SALE_START,
        end_time: FLASH_SALE_END
      },
      create: {
        id: PRODUCT_ID,
        name: "Limited Edition Smartphone",
        initial_stock: INITIAL_STOCK,
        current_stock: remainingStock,
        start_time: FLASH_SALE_START,
        end_time: FLASH_SALE_END
      }
    });

    // Sinkronisasi stok ke Redis
    await redis.set(`stock:${PRODUCT_ID}`, remainingStock);

    // Sinkronisasi daftar pembeli ke Redis Set (Self-Healing)
    await redis.del(`buyers:${PRODUCT_ID}`);
    if (purchaseCount > 0) {
      const userIds = existingPurchases.map(p => p.user_id);
      await redis.sadd(`buyers:${PRODUCT_ID}`, ...userIds);
    }

    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log("⚡ Server Flash Sale berjalan di http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();