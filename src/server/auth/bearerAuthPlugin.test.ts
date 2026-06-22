import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { IDatabase } from '#/db/IDatabase.js';
import { createStubDatabase } from '#/db/stubDatabase.js';
import type { ApiTokenRecord, UserRecord } from '#/db/types.js';
import { hashToken } from '#/server/auth/apiTokens.js';
import {
  createBearerAuthHook,
  registerBearerAuthDecorator
} from '#/server/auth/bearerAuthPlugin.js';

const sampleUser: UserRecord = {
  id: 'user-1',
  name: 'Test user',
  role: 'user',
  collectionAccess: ['*'],
  environmentAccess: ['*'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

const sampleRecord: ApiTokenRecord = {
  id: 'token-1',
  userId: sampleUser.id,
  name: 'Test token',
  tokenHash: hashToken('hbk_valid-token'),
  tokenPrefix: 'hbk_valid-',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastUsedAt: null,
  revokedAt: null
};

/**
 * Builds a stub database for bearer auth integration tests.
 *
 * @param record - Active token returned by hash lookup, or null when invalid.
 * @param user - User returned for token ownership lookup, or null when missing.
 * @returns Mock database implementing token lookup and touch methods.
 */
function createAuthDb(
  record: ApiTokenRecord | null,
  user: UserRecord | null = sampleUser
): IDatabase {
  const db = createStubDatabase();
  db.findActiveApiTokenByHash.mockResolvedValue(record);
  db.findUserById.mockResolvedValue(user);
  db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  return db;
}

/**
 * Creates a Fastify app with one protected route behind bearer auth.
 *
 * @param db - Database stub used by the auth hook.
 * @returns Listening-ready Fastify instance with GET /protected.
 */
async function createProtectedApp(db: IDatabase) {
  const app = Fastify();

  await app.register(async (protectedApp) => {
    registerBearerAuthDecorator(protectedApp);
    protectedApp.addHook('onRequest', createBearerAuthHook(db));
    protectedApp.get('/protected', async () => ({ ok: true }));
  });

  return app;
}

describe('createBearerAuthHook', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = await createProtectedApp(createAuthDb(sampleRecord));

    const response = await app.inject({
      method: 'GET',
      url: '/protected'
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.json()).toEqual({ error: 'Unauthorized' });

    await app.close();
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const app = await createProtectedApp(createAuthDb(null));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_invalid'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });

    await app.close();
  });

  it('returns 401 when the token owner user is missing', async () => {
    const app = await createProtectedApp(createAuthDb(sampleRecord, null));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_valid-token'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });

    await app.close();
  });

  it('allows requests with a valid bearer token', async () => {
    const db = createAuthDb(sampleRecord);
    const app = await createProtectedApp(db);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_valid-token'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(db.findActiveApiTokenByHash).toHaveBeenCalledWith(sampleRecord.tokenHash);
    expect(db.findUserById).toHaveBeenCalledWith(sampleUser.id);
    expect(db.touchApiTokenLastUsed).toHaveBeenCalledWith(sampleRecord.id, expect.any(Date));

    await app.close();
  });
});
