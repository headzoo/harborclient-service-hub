import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import type { ServerConfig } from '#/config/serverConfig.js';
import type { IDatabase } from '#/db/IDatabase.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { readPackageVersion } from '#/packageVersion.js';
import { registerRoutes } from '#/server/routes/index.js';

export interface CreateServerOptions {
  /**
   * When true, enables Fastify's built-in request logger.
   */
  verbose?: boolean;

  /**
   * Package version exposed on the health endpoint (defaults to package.json).
   */
  version?: string;

  /**
   * Database used for bearer token validation on protected routes.
   */
  db: IDatabase;

  /**
   * Redis-backed store for authentication throttling on protected routes.
   */
  throttleStore: IThrottleStore;
}

/**
 * Builds a configured Fastify instance with Zod validation and registered routes.
 *
 * Does not call `listen`; use {@link runServer} or test inject for that.
 *
 * @param config - Server bind settings and optional LLM configuration.
 * @param options - Logger, version, and database overrides.
 * @returns Fastify app with type provider and routes attached.
 */
export async function createServer(
  config: ServerConfig,
  options: CreateServerOptions
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.verbose ?? false
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerRoutes(app, {
    version: options.version ?? readPackageVersion(),
    db: options.db,
    throttleStore: options.throttleStore,
    llm: config.llm
  });

  return app;
}
