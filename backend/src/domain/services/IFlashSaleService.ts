import { FlashSaleStatus } from '../../services/FlashSaleService';

/**
 * IFlashSaleService — Abstraksi Service Layer.
 *
 * Controller dan lapisan mana pun yang perlu berinteraksi dengan logika bisnis
 * flash sale HARUS bergantung pada interface ini, bukan implementasi konkret.
 *
 * Manfaat:
 * - Controller dapat diuji dengan mudah menggunakan mock (Testability).
 * - Implementasi dapat diganti tanpa mengubah Controller (OCP).
 * - Dependency arah dari luar ke dalam (DIP terpenuhi).
 */
export interface IFlashSaleService {
  /** Mendapatkan status flash sale saat ini beserta sisa stok. */
  getStatus(): Promise<FlashSaleStatus>;

  /** Mencoba melakukan pembelian produk secara atomik. */
  attemptPurchase(userId: string, productId: string): Promise<void>;

  /** Mengecek apakah user berhasil mengamankan item. */
  checkPurchase(userId: string): Promise<boolean>;

  /** Memperbarui konfigurasi waktu flash sale. */
  updateConfig(newStart: Date, newEnd: Date): Promise<void>;
}
