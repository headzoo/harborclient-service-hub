import { beforeEach, describe, expect, it, vi } from 'vitest';

const { FirestoreMock } = vi.hoisted(() => {
  /**
   * Mock Firestore client constructor used by {@link FirestoreDatabase}.
   */
  class MockFirestore {
    listCollections = vi.fn().mockResolvedValue([]);
    terminate = vi.fn().mockResolvedValue(undefined);
    collection = vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: vi.fn().mockResolvedValue(undefined)
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] })
    });

    /**
     * Captures Firestore construction config for assertions.
     *
     * @param config - Client settings passed to the Firestore constructor.
     */
    constructor(public readonly config: unknown) { }
  }

  return {
    FirestoreMock: vi.fn(MockFirestore)
  };
});

vi.mock('@google-cloud/firestore', () => ({
  Firestore: FirestoreMock
}));

import { FirestoreDatabase } from '#/db/firestore/FirestoreDatabase.js';

beforeEach(() => {
  FirestoreMock.mockClear();
});

describe('FirestoreDatabase.fromConfig', () => {
  it('accepts valid config', () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project'
    });

    expect(db).toBeInstanceOf(FirestoreDatabase);
  });

  it('accepts optional keyFilename', () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project',
      keyFilename: '/path/to/key.json'
    });

    expect(db).toBeInstanceOf(FirestoreDatabase);
  });

  it('throws when projectId is missing', () => {
    expect(() =>
      FirestoreDatabase.fromConfig({
        driver: 'firestore'
      })
    ).toThrow();
  });

  it('throws when driver does not match', () => {
    expect(() =>
      FirestoreDatabase.fromConfig({
        driver: 'mysql',
        projectId: 'my-project'
      })
    ).toThrow();
  });
});

describe('FirestoreDatabase lifecycle', () => {
  it('creates a client, verifies connectivity, and terminates on disconnect', async () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project',
      keyFilename: '/path/to/key.json'
    });

    await db.connect();

    expect(FirestoreMock).toHaveBeenCalledWith({
      projectId: 'my-project',
      keyFilename: '/path/to/key.json'
    });

    const client = FirestoreMock.mock.instances[0];
    expect(client).toBeDefined();
    expect(client.listCollections).toHaveBeenCalledOnce();

    await db.disconnect();

    expect(client.terminate).toHaveBeenCalledOnce();
  });

  it('is idempotent when connect is called more than once', async () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project'
    });

    await db.connect();
    await db.connect();

    expect(FirestoreMock).toHaveBeenCalledOnce();

    const client = FirestoreMock.mock.instances[0];
    expect(client.listCollections).toHaveBeenCalledOnce();
  });

  it('is safe to call disconnect when not connected', async () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project'
    });

    await expect(db.disconnect()).resolves.toBeUndefined();
  });
});

describe('FirestoreDatabase api tokens', () => {
  it('runs bootstrap migration for orphan tokens', async () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project'
    });

    await db.connect();
    await expect(db.migrate()).resolves.toBeUndefined();
    await db.disconnect();
  });

  it('throws when api token methods are called before connect', async () => {
    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project'
    });

    await expect(
      db.createApiToken({
        userId: 'user-1',
        id: 'id',
        name: 'name',
        tokenHash: 'hash',
        tokenPrefix: 'prefix',
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null
      })
    ).rejects.toThrow('Firestore database is not connected.');
  });
});

describe('FirestoreDatabase collections', () => {
  it('creates and lists collections', async () => {
    const setMock = vi.fn().mockResolvedValue(undefined);
    const getMock = vi.fn().mockResolvedValue({
      docs: [
        {
          id: 'collection-1',
          data: () => ({
            name: 'Shared API',
            variables: [],
            headers: [],
            auth: {
              type: 'none',
              basic: { username: '', password: '' },
              bearer: { token: '' }
            },
            preRequestScript: '',
            postRequestScript: '',
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          })
        }
      ]
    });

    FirestoreMock.mockImplementationOnce(
      /**
       * Builds a Firestore client mock with collection helpers for entity tests.
       */
      class EntityFirestoreMock {
        listCollections = vi.fn().mockResolvedValue([]);
        terminate = vi.fn().mockResolvedValue(undefined);
        collection = vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({ set: setMock }),
          orderBy: vi.fn().mockReturnThis(),
          get: getMock
        });

        /**
         * Captures Firestore construction config for assertions.
         *
         * @param config - Client settings passed to the Firestore constructor.
         */
        constructor(public readonly config: unknown) { }
      }
    );

    const db = FirestoreDatabase.fromConfig({
      driver: 'firestore',
      projectId: 'my-project'
    });

    await db.connect();
    const created = await db.createCollection('Shared API');
    const listed = await db.listCollections();

    expect(created.name).toBe('Shared API');
    expect(setMock).toHaveBeenCalledOnce();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('Shared API');

    await db.disconnect();
  });
});
