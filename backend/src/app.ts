import Fastify from 'fastify';
import cors from '@fastify/cors';

const logger = {
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
};

/**
 * Membangun instance Fastify dasar.
 * Route didaftarkan secara terpisah oleh caller setelah menginisialisasi service.
 */
export function buildApp() {
  const fastify = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : logger });

  fastify.register(cors, {
    origin: true
  });

  return fastify;
}
