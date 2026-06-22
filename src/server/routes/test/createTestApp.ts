import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Mocked } from 'vitest';
import type { IDatabase } from '#/db/IDatabase.js';
import type { ApiTokenRecord, UserRecord } from '#/db/types.js';
import { hashToken } from '#/server/auth/apiTokens.js';
import { registerProtectedRoutes } from '#/server/routes/index.js';

export const validBearerToken = 'hbk_valid-token';

/**
 * Sample user record used by protected route tests.
 */
export const sampleUserRecord: UserRecord = {
  id: 'user-1',
  name: 'Test user',
  role: 'user',
  collectionAccess: ['*'],
  environmentAccess: ['*'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

/**
 * Sample API token record matching {@link validBearerToken}.
 */
export const sampleApiTokenRecord: ApiTokenRecord = {
  id: 'token-1',
  userId: sampleUserRecord.id,
  name: 'Test token',
  tokenHash: hashToken(validBearerToken),
  tokenPrefix: 'hbk_valid-',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastUsedAt: null,
  revokedAt: null
};

/**
 * Options for building a protected-route test Fastify instance.
 */
export interface CreateProtectedTestAppOptions {
  /**
   * Database stub wired into bearer auth and entity routes.
   */
  db: Mocked<IDatabase>;

  /**
   * When true, configures auth lookup to accept {@link validBearerToken}.
   */
  withValidAuth?: boolean;

  /**
   * User record returned by auth lookup; defaults to {@link sampleUserRecord}.
   */
  user?: UserRecord;
}

/**
 * Builds a Fastify app with protected entity routes and optional valid bearer auth.
 *
 * @param options - Database stub and auth configuration.
 * @returns Fastify instance ready for inject-based route tests.
 */
export async function createProtectedTestApp(
  options: CreateProtectedTestAppOptions
): Promise<FastifyInstance> {
  const user = options.user ?? sampleUserRecord;

  if (options.withValidAuth) {
    options.db.findActiveApiTokenByHash.mockResolvedValue(sampleApiTokenRecord);
    options.db.findUserById.mockResolvedValue(user);
    options.db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  }

  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(async (protectedApp) => {
    await registerProtectedRoutes(protectedApp, {
      version: '0.1.0',
      db: options.db
    });
  });

  return app;
}

/**
 * Authorization header value for {@link validBearerToken}.
 */
export function authHeader(): { authorization: string } {
  return { authorization: `Bearer ${validBearerToken}` };
}
