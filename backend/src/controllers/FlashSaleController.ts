import { FastifyRequest, FastifyReply } from 'fastify';
import { IFlashSaleService } from '../domain/services/IFlashSaleService';
import { purchaseSchema, configSchema } from '../schemas/flashSaleSchemas';
import {
  FlashSaleError,
  InvalidTimeRangeError,
} from '../domain/errors/FlashSaleErrors';

/**
 * FlashSaleController — Controller Layer.
 *
 * SOLID Compliance:
 * - S (SRP): Hanya bertanggung jawab untuk menerjemahkan HTTP request/response.
 *            Tidak mengandung logika bisnis sama sekali.
 * - D (DIP): Bergantung pada IFlashSaleService (abstraksi/interface),
 *            bukan FlashSaleService (implementasi konkret).
 */
export class FlashSaleController {
  constructor(private readonly service: IFlashSaleService) {}

  /**
   * GET /status — Cek status flash sale
   */
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await this.service.getStatus();
    return reply.send(status);
  }

  /**
   * POST /purchase — Melakukan pembelian produk
   */
  async purchase(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = purchaseSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid input fields', details: parseResult.error.format() });
    }

    const { userId, productId } = parseResult.data;

    try {
      await this.service.attemptPurchase(userId, productId);
      return reply.status(201).send({ message: 'Purchase successful! Your item is secured.' });
    } catch (error) {
      // Domain errors (stok habis, sudah beli, sale tidak aktif) → 400 Bad Request
      if (error instanceof FlashSaleError) {
        return reply.status(400).send({ error: (error as Error).message });
      }
      // Error infrastruktur yang tidak terduga → 500 Internal Server Error
      return reply.status(500).send({ error: 'An unexpected error occurred' });
    }
  }

  /**
   * GET /purchase/:userId — Cek apakah user berhasil mengamankan item
   */
  async getPurchaseStatus(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.params as { userId: string };
    const hasSecuredItem = await this.service.checkPurchase(userId);

    return reply.send({ userId, hasSecuredItem });
  }

  /**
   * PUT /config — Update konfigurasi flash sale
   */
  async updateConfig(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = configSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid input fields', details: parseResult.error.format() });
    }

    const { startTime, endTime } = parseResult.data;
    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);

    try {
      await this.service.updateConfig(newStart, newEnd);
      return reply
        .status(200)
        .send({ message: 'Flash sale period updated successfully', startTime, endTime });
    } catch (error) {
      // Validasi domain: waktu mulai harus sebelum waktu selesai → 400 Bad Request
      if (error instanceof InvalidTimeRangeError) {
        return reply.status(400).send({ error: (error as Error).message });
      }
      // Error infrastruktur (DB gagal, dsb.) → 500 Internal Server Error
      return reply.status(500).send({ error: 'Failed to update database' });
    }
  }
}
