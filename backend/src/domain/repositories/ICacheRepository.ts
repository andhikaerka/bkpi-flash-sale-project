/**
 * Hasil dari operasi pembelian atomik di Redis.
 * Menggunakan enum agar tidak ada magic number yang tersebar di codebase.
 */
export enum PurchaseResult {
  Success = 1,
  AlreadyPurchased = -1,
  OutOfStock = -2,
}

export interface ICacheRepository {
  /**
   * Atomic purchase: check duplicate buyer & decrement stock.
   * Returns PurchaseResult enum value.
   */
  attemptPurchase(stockKey: string, buyersKey: string, userId: string): Promise<PurchaseResult>;

  /** Cek apakah userId adalah member dari sebuah set (buyers) */
  isBuyer(buyersKey: string, userId: string): Promise<boolean>;

  /** Set nilai key numerik di cache */
  set(key: string, value: number | string): Promise<void>;

  /** Hapus sebuah key */
  del(key: string): Promise<void>;

  /** Tambahkan satu atau lebih member ke sebuah Set */
  addToSet(key: string, ...members: string[]): Promise<void>;

  /** Ambil nilai numerik dari cache */
  get(key: string): Promise<number | null>;

  /**
   * Mengakuisisi distributed lock (menggunakan SETNX).
   * @param key Kunci lock
   * @param ttlSeconds Lama lock berlaku sebelum kadaluarsa
   * @returns true jika lock berhasil didapat, false jika sedang dipegang pihak lain
   */
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Melepas distributed lock secara manual.
   */
  releaseLock(key: string): Promise<void>;
}
