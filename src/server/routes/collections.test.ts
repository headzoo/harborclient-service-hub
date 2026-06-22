import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { defaultAuth } from '#/db/types.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleUserRecord,
  validBearerToken
} from '#/server/routes/test/createTestApp.js';

const sampleCollection = {
  id: 'collection-1',
  name: 'Shared API',
  variables: [],
  headers: [],
  auth: defaultAuth(),
  preRequestScript: '',
  postRequestScript: '',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
};

describe('collection routes', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/collections'
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lists collections with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([sampleCollection]);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      collections: [
        {
          ...sampleCollection,
          createdAt: sampleCollection.createdAt.toISOString()
        }
      ]
    });
    expect(db.findActiveApiTokenByHash).toHaveBeenCalledWith(expect.any(String));

    await app.close();
  });

  it('creates a collection with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.createCollection.mockResolvedValue(sampleCollection);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: authHeader(),
      payload: { name: 'Shared API' }
    });

    expect(response.statusCode).toBe(200);
    expect(db.createCollection).toHaveBeenCalledWith('Shared API');
    expect(response.json().name).toBe('Shared API');

    await app.close();
  });

  it('returns 403 for admin users on collection routes', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        role: 'admin',
        collectionAccess: [],
        environmentAccess: []
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });

    await app.close();
  });

  it('filters collections for scoped users', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([
      sampleCollection,
      { ...sampleCollection, id: 'collection-2', name: 'Other API' }
    ]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1']
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().collections).toHaveLength(1);
    expect(response.json().collections[0].id).toBe('collection-1');

    await app.close();
  });

  it('returns 404 when updating a missing collection', async () => {
    const db = createStubDatabase();
    db.updateCollection.mockRejectedValue(new Error('Collection not found'));
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'PUT',
      url: '/collections/missing-id',
      headers: authHeader(),
      payload: {
        name: 'Updated',
        variables: [],
        headers: [],
        preRequestScript: '',
        postRequestScript: '',
        auth: defaultAuth()
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Collection not found' });

    await app.close();
  });
});

describe('collection routes auth token', () => {
  it('accepts the configured bearer token', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([]);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: { authorization: `Bearer ${validBearerToken}` }
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
