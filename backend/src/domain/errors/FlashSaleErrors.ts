/**
 * Domain Error Classes — Flash Sale.
 *
 * Setiap error merepresentasikan kondisi bisnis yang spesifik dan teridentifikasi.
 * Controller menggunakan `instanceof` untuk menentukan HTTP status code yang tepat,
 * menggantikan pola string matching yang rapuh (error.message === '...').
 *
 * Hierarki:
 *   Error
 *   └── FlashSaleError          (base — semua domain error)
 *       ├── FlashSaleNotActiveError   (400 — sale belum/sudah berakhir)
 *       ├── AlreadyPurchasedError     (400 — user sudah membeli)
 *       ├── OutOfStockError           (400 — stok habis)
 *       └── InvalidTimeRangeError     (400 — startTime >= endTime)
 */

/** Base class untuk semua domain error Flash Sale. */
export class FlashSaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Memperbaiki prototype chain agar `instanceof` bekerja dengan benar saat di-transpile ke ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Flash sale belum dimulai atau sudah berakhir. */
export class FlashSaleNotActiveError extends FlashSaleError {
  constructor() {
    super('Flash sale is not active');
  }
}

/** User sudah pernah melakukan pembelian pada flash sale ini. */
export class AlreadyPurchasedError extends FlashSaleError {
  constructor() {
    super('You have already purchased this item');
  }
}

/** Stok produk sudah habis. */
export class OutOfStockError extends FlashSaleError {
  constructor() {
    super('Product is sold out');
  }
}

/** Waktu mulai tidak boleh sama dengan atau setelah waktu selesai. */
export class InvalidTimeRangeError extends FlashSaleError {
  constructor() {
    super('Start time must be before end time');
  }
}
