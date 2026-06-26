import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerHttpLogging } from '#/server/logging/httpLogging.js';
import type { Logger } from '#/server/logging/logger.js';

/**
 * Builds a mock Winston logger for HTTP logging hook tests.
 *
 * @returns Logger stub with debug and error methods.
 */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    error: vi.fn()
  } as unknown as Logger;
}

describe('registerHttpLogging', () => {
  it('logs incoming requests at debug level', async () => {
    const logger = createMockLogger();
    const app = Fastify();
    registerHttpLogging(app, logger);

    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    expect(response.statusCode).toBe(200);
    expect(logger.debug).toHaveBeenCalledWith(
      'request',
      expect.objectContaining({
        method: 'GET',
        url: '/test'
      })
    );

    await app.close();
  });

  it('logs request errors at error level', async () => {
    const logger = createMockLogger();
    const app = Fastify();
    registerHttpLogging(app, logger);

    app.get('/fail', async () => {
      throw new Error('boom');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/fail'
    });

    expect(response.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      'request error',
      expect.objectContaining({
        method: 'GET',
        url: '/fail',
        message: 'boom'
      })
    );

    await app.close();
  });
});
