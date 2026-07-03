import Redis from 'ioredis';
import { ICacheRepository, PurchaseResult } from '../../domain/repositories/ICacheRepository';

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

  -- 3. Potong stok dan catat user ke dalam Set
  redis.call('DECR', stockKey)
  redis.call('SADD', buyersKey, userId)
  return 1
`;

// Extend ioredis type untuk TypeScript
declare module 'ioredis' {
  interface RedisCommander<Context> {
    attemptPurchase(
      stockKey: string,
      buyersKey: string,
      userId: string
    ): Promise<number>;
  }
}

export class RedisCacheRepository implements ICacheRepository {
  private readonly client: Redis;

  constructor(redisClient: Redis) {
    this.client = redisClient;
    // Register Lua script sebagai custom command
    this.client.defineCommand('attemptPurchase', {
      numberOfKeys: 2,
      lua: purchaseLuaScript,
    });
  }

  async attemptPurchase(stockKey: string, buyersKey: string, userId: string): Promise<PurchaseResult> {
    const result = await this.client.attemptPurchase(stockKey, buyersKey, userId);
    return result as PurchaseResult;
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    // 'NX' memastikan hanya di-set jika belum ada.
    // 'EX' memastikan key akan otomatis terhapus setelah ttlSeconds untuk mencegah deadlock.
    const result = await this.client.set(key, 'locked', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  async isBuyer(buyersKey: string, userId: string): Promise<boolean> {
    const result = await this.client.sismember(buyersKey, userId);
    return result === 1;
  }

  async set(key: string, value: number | string): Promise<void> {
    await this.client.set(key, String(value));
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async addToSet(key: string, ...members: string[]): Promise<void> {
    await this.client.sadd(key, ...members);
  }

  async get(key: string): Promise<number | null> {
    const value = await this.client.get(key);
    if (value === null) return null;
    return parseInt(value, 10);
  }
}
