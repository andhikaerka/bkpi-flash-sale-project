/**
 * ILogger — Abstraksi Logger.
 *
 * Service layer bergantung pada interface ini, bukan pada implementasi konkret
 * seperti `console`, `pino`, atau logger library lainnya.
 *
 * Di production : diisi dengan `app.log` (Pino logger dari Fastify).
 * Di test       : diisi dengan no-op logger agar output test tetap bersih.
 */
export interface ILogger {
  info(message: any, ...args: any[]): void;
  warn(message: any, ...args: any[]): void;
  error(message: any, ...args: any[]): void;
}
