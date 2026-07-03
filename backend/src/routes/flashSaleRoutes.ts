import { FastifyInstance } from 'fastify';
import { FlashSaleController } from '../controllers/FlashSaleController';
import { FlashSaleService } from '../services/FlashSaleService';

/**
 * Flash Sale Routes — Route Layer.
 *
 * Menerima `FlashSaleService` yang sudah dirakit dari satu-satunya
 * Composition Root (src/index.ts) via parameter `options`.
 * File ini TIDAK menginstantiasi dependency apapun.
 */
export default async function flashSaleRoutes(
  fastify: FastifyInstance,
  options: { flashSaleService: FlashSaleService }
) {
  // --- Controller Layer ---
  const controller = new FlashSaleController(options.flashSaleService);

  // --- Route Definitions ---
  // Health check endpoint — digunakan oleh Docker healthcheck
  fastify.get('/health', async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  // Bind methods ke instance controller agar `this` context tetap benar
  fastify.get('/flash-sale/status', controller.getStatus.bind(controller));
  fastify.post('/purchase', controller.purchase.bind(controller));
  fastify.get('/purchase/:userId', controller.getPurchaseStatus.bind(controller));
  fastify.patch('/flash-sale/config', controller.updateConfig.bind(controller));
}
