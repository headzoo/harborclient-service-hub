import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createPoolMock } = vi.hoisted(() => ({
  createPoolMock: vi.fn()
}));

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: createPoolMock
  }
}));

import { MysqlDatabase } from '#/db/mysql/MysqlDatabase.js';

const validConfig = {
  driver: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  user: 'harbor',
  password: 'harbor',
  database: 'harbor'
};

/**
 * Builds a mock MySQL pool for lifecycle tests.
 *
 * @returns Mock pool with spied getConnection and end methods.
 */
function createMockPool() {
  const connection = {
    ping: vi.fn().mockResolvedValue(undefined),
    release: vi.fn()
  };

  return {
    getConnection: vi.fn().mockResolvedValue(connection),
    execute: vi.fn().mockResolvedValue([[], { affectedRows: 0 }]),
    end: vi.fn().mockResolvedValue(undefined),
    connection
  };
}

beforeEach(() => {
  createPoolMock.mockReset();
});

describe('MysqlDatabase.fromConfig', () => {
  it('accepts valid config', () => {
    const db = MysqlDatabase.fromConfig(validConfig);

    expect(db).toBeInstanceOf(MysqlDatabase);
  });

  it('accepts port as a string', () => {
    const db = MysqlDatabase.fromConfig({
      ...validConfig,
      port: '3306'
    });

    expect(db).toBeInstanceOf(MysqlDatabase);
  });

  it('throws when host is missing', () => {
    expect(() =>
      MysqlDatabase.fromConfig({
        driver: 'mysql',
        port: 3306,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      })
    ).toThrow();
  });

  it('throws when driver does not match', () => {
    expect(() =>
      MysqlDatabase.fromConfig({
        ...validConfig,
        driver: 'postgres'
      })
    ).toThrow();
  });
});

describe('MysqlDatabase lifecycle', () => {
  it('creates a pool, verifies connectivity, and closes on disconnect', async () => {
    const pool = createMockPool();
    createPoolMock.mockReturnValue(pool);
    const db = MysqlDatabase.fromConfig(validConfig);

    await db.connect();

    expect(createPoolMock).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 3306,
      user: 'harbor',
      password: 'harbor',
      database: 'harbor'
    });
    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(pool.connection.ping).toHaveBeenCalledOnce();
    expect(pool.connection.release).toHaveBeenCalledOnce();

    await db.disconnect();

    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('is idempotent when connect is called more than once', async () => {
    const pool = createMockPool();
    createPoolMock.mockReturnValue(pool);
    const db = MysqlDatabase.fromConfig(validConfig);

    await db.connect();
    await db.connect();

    expect(createPoolMock).toHaveBeenCalledOnce();
    expect(pool.getConnection).toHaveBeenCalledOnce();
  });

  it('is safe to call disconnect when not connected', async () => {
    const db = MysqlDatabase.fromConfig(validConfig);

    await expect(db.disconnect()).resolves.toBeUndefined();
  });
});

describe('MysqlDatabase api tokens', () => {
  it('runs all migrate SQL statements against the pool', async () => {
    const pool = createMockPool();
    createPoolMock.mockReturnValue(pool);
    const db = MysqlDatabase.fromConfig(validConfig);

    await db.connect();
    await db.migrate();

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS api_tokens'),
      []
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS collections'),
      []
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS environments'),
      []
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS folders'),
      []
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS requests'),
      []
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS users'),
      []
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS user_id'),
      []
    );

    await db.disconnect();
  });

  it('throws when api token methods are called before connect', async () => {
    const db = MysqlDatabase.fromConfig(validConfig);

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
    ).rejects.toThrow('MySQL database is not connected.');
  });
});

describe('MysqlDatabase collections', () => {
  it('inserts a new collection with generated id', async () => {
    const pool = createMockPool();
    createPoolMock.mockReturnValue(pool);
    const db = MysqlDatabase.fromConfig(validConfig);
    await db.connect();

    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, undefined]).mockResolvedValueOnce([
      [
        {
          id: 'collection-1',
          name: 'Shared API',
          variables: '[]',
          headers: '[]',
          auth: '{"type":"none","basic":{"username":"","password":""},"bearer":{"token":""}}',
          pre_request_script: '',
          post_request_script: '',
          created_at: createdAt
        }
      ],
      undefined
    ]);

    const collection = await db.createCollection('Shared API');

    expect(collection.name).toBe('Shared API');
    expect(collection.id).toBe('collection-1');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO collections'),
      expect.arrayContaining(['Shared API'])
    );

    await db.disconnect();
  });
});
