export interface IPurchaseQueue {
  /**
   * Menambahkan tugas (job) penyimpanan pembelian ke dalam antrean.
   * Antrean memastikan penulisan ke database (PostgreSQL) dilakukan secara 
   * asinkron, aman (durable), dan diulang (retry) jika gagal.
   * 
   * @param userId ID pengguna
   * @param productId ID produk
   */
  addPurchaseJob(userId: string, productId: string): Promise<void>;

  /**
   * Menutup koneksi antrean dan worker secara elegan (graceful shutdown).
   */
  close(): Promise<void>;
}
