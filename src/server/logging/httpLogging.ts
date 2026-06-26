import type { FastifyInstance } from 'fastify';
import type { Logger } from '#/server/logging/logger.js';

/**
 * Registers HTTP request and error logging hooks on a Fastify instance.
 *
 * Logs every incoming request at debug level and logs unhandled request errors
 * at error level without altering response handling.
 *
 * @param app - Fastify server to attach hooks to.
 * @param logger - Winston logger configured from server.yaml.
 */
export function registerHttpLogging(app: FastifyInstance, logger: Logger): void {
  app.addHook('onRequest', async (request) => {
    logger.debug('request', {
      reqId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip
    });
  });

  app.addHook('onError', async (request, reply, error) => {
    logger.error('request error', {
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      message: error.message,
      stack: error.stack
    });
  });
}
