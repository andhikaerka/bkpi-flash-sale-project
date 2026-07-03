/**
 * Application-level constants.
 *
 * File ini hanya berisi nilai-nilai yang IMMUTABLE (tidak berubah).
 * State yang bisa berubah (seperti startTime & endTime flash sale) dikelola
 * secara internal oleh FlashSaleService instance, bukan sebagai global mutable state.
 */
export const PRODUCT_ID = '800af4ee-25d5-4317-8e88-27a07c8fcfe7';
export const INITIAL_STOCK = 100;

/**
 * Default time values — akan di-override oleh data dari database
 * saat FlashSaleService.initializeSystem() dipanggil pada startup.
 */
export const DEFAULT_START_TIME = new Date(Date.now() - 1000 * 60 * 10);
export const DEFAULT_END_TIME = new Date(Date.now() + 1000 * 60 * 60);
