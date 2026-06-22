import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CommanderError } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerMock, createDatabaseMock, createThrottleStoreMock } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
  createDatabaseMock: vi.fn(),
  createThrottleStoreMock: vi.fn()
}));

vi.mock('#/index.js', () => ({
  createServer: createServerMock
}));

vi.mock('#/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/db/index.js')>();
  return {
    ...actual,
    createDatabase: createDatabaseMock
  };
});

vi.mock('#/server/auth/throttle/createThrottleStore.js', () => ({
  createThrottleStore: createThrottleStoreMock
}));

import { createProgram } from '#/cli/program.js';
import { migrateCommand } from '#/cli/migrateCommand.js';
import {
  userCreateCommand,
  userListCommand,
  userTokenCreateCommand,
  userTokenListCommand,
  userTokenRevokeCommand
} from '#/cli/userCommand.js';
import { ConfigError, loadServerConfig } from '#/config/serverConfig.js';
import type { IDatabase } from '#/db/index.js';
import { createStubDatabase } from '#/db/stubDatabase.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';
import { startCommand, runServer } from '#/server.js';

/**
 * Builds a minimal database mock for runServer tests.
 *
 * @returns Mock database with spied connect and disconnect methods.
 */
function createMockDatabase(): IDatabase {
  const db = createStubDatabase();
  db.connect.mockResolvedValue(undefined);
  db.disconnect.mockResolvedValue(undefined);
  db.migrate.mockResolvedValue(undefined);
  db.createUser.mockResolvedValue({
    id: 'user-1',
    name: 'Alice',
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  db.findUserById.mockResolvedValue({
    id: 'user-1',
    name: 'Alice',
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  db.listUsers.mockResolvedValue([]);
  db.updateUser.mockResolvedValue({
    id: 'user-1',
    name: 'Alice',
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  db.deleteUser.mockResolvedValue(undefined);
  db.migrateOrphanTokensToBootstrapUser.mockResolvedValue(undefined);
  db.createApiToken.mockResolvedValue(undefined);
  db.findActiveApiTokenByHash.mockResolvedValue(null);
  db.listApiTokensByUserId.mockResolvedValue([]);
  db.listApiTokens.mockResolvedValue([]);
  db.revokeApiToken.mockResolvedValue(false);
  db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  return db;
}

/**
 * Builds a minimal throttle store mock for runServer tests.
 *
 * @returns Mock throttle store with spied connect and disconnect methods.
 */
function createMockThrottleStore(): IThrottleStore {
  const throttleStore = createStubThrottleStore();
  throttleStore.connect.mockResolvedValue(undefined);
  throttleStore.disconnect.mockResolvedValue(undefined);
  return throttleStore;
}

/**
 * Builds a minimal Fastify-like mock for runServer tests.
 *
 * @param listenAddress - Value returned by `server.address()` after listen.
 * @returns Mock app with spied listen, close, and log methods.
 */
function createMockApp(
  listenAddress: { address: string; port: number } = {
    address: '127.0.0.1',
    port: 8787
  }
) {
  return {
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    log: { info: vi.fn() },
    server: {
      address: () => listenAddress
    }
  };
}

/**
 * Creates a Commander program configured for tests (exitOverride on root and subcommands).
 *
 * @param options - Injectable dependencies passed to {@link createProgram}.
 * @returns Program ready to parse argv without exiting the process.
 */
function createTestProgram(options: Parameters<typeof createProgram>[1] = {}) {
  const program = createProgram('0.1.0', options);
  program.exitOverride();
  for (const command of program.commands) {
    command.exitOverride();
  }
  return program;
}

/**
 * Writes a temporary server.yaml file for CLI integration tests.
 *
 * @param contents - Raw YAML written to the temp config file.
 * @returns Absolute path to the written config file.
 */
function writeConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'service-hub-cli-'));
  const configPath = path.join(dir, 'server.yaml');
  writeFileSync(configPath, contents, 'utf8');
  return configPath;
}

const sampleDbSection = `db:
  driver: postgres
  host: 127.0.0.1
  port: 5432
  user: harbor
  password: harbor
  database: harbor
`;

const sampleRedisSection = `redis:
  host: 127.0.0.1
  port: 6380
`;

const sampleRedisConfig = {
  host: '127.0.0.1',
  port: 6380
};

beforeEach(() => {
  createServerMock.mockReset();
  createDatabaseMock.mockReturnValue(createMockDatabase());
  createThrottleStoreMock.mockReturnValue(createMockThrottleStore());
});

describe('createProgram', () => {
  it('shows help output', async () => {
    const program = createTestProgram();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(program.parseAsync(['--help'], { from: 'user' })).rejects.toBeInstanceOf(
      CommanderError
    );

    const output = write.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('service-hub');
    expect(output).toContain('start');
    expect(output).toContain('migrate');
    expect(output).toContain('user');
    expect(output).toContain('--verbose');
    expect(output).toContain('--config');

    write.mockRestore();
  });

  it('shows version output', async () => {
    const program = createTestProgram();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(program.parseAsync(['--version'], { from: 'user' })).rejects.toBeInstanceOf(
      CommanderError
    );

    const output = write.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toMatch(/\d+\.\d+\.\d+/);

    write.mockRestore();
  });

  it('rejects unknown subcommands', async () => {
    const program = createTestProgram();

    await expect(program.parseAsync(['unknown'], { from: 'user' })).rejects.toMatchObject({
      exitCode: 1
    });
  });

  it('passes parsed start options to the handler', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 0.0.0.0
${sampleDbSection}${sampleRedisSection}`);
    const startHandler = vi.fn().mockResolvedValue(undefined);
    const program = createTestProgram({ startCommand: startHandler });

    await program.parseAsync(['--verbose', '--config', configPath, 'start'], {
      from: 'user'
    });

    expect(startHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        config: configPath,
        verbose: true
      })
    );
  });

  it('loads server config when starting', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 0.0.0.0
${sampleDbSection}${sampleRedisSection}`);
    createServerMock.mockResolvedValue(createMockApp({ address: '0.0.0.0', port: 8787 }));
    const db = createMockDatabase();
    const throttleStore = createMockThrottleStore();
    createDatabaseMock.mockReturnValue(db);
    createThrottleStoreMock.mockReturnValue(throttleStore);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await startCommand({ config: configPath, verbose: true });

    expect(loadServerConfig(configPath)).toEqual({
      port: 8787,
      host: '0.0.0.0',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: sampleRedisConfig
    });
    expect(createServerMock).toHaveBeenCalledWith(
      {
        port: 8787,
        host: '0.0.0.0',
        db: {
          driver: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          user: 'harbor',
          password: 'harbor',
          database: 'harbor'
        },
        redis: sampleRedisConfig
      },
      { verbose: true, db, throttleStore }
    );
    expect(log).toHaveBeenCalledWith('Starting server with config:', {
      port: 8787,
      host: '0.0.0.0',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: sampleRedisConfig
    });

    log.mockRestore();
  });

  it('fails start when config file is missing', async () => {
    await expect(startCommand({ config: '/nonexistent/server.yaml' })).rejects.toThrow(ConfigError);
  });
});

describe('runServer', () => {
  it('connects to the database and logs the listening address', async () => {
    const app = createMockApp();
    const db = createMockDatabase();
    const throttleStore = createMockThrottleStore();
    createServerMock.mockResolvedValue(app);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runServer(
      {
        host: '127.0.0.1',
        port: 8787,
        db: {
          driver: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          user: 'harbor',
          password: 'harbor',
          database: 'harbor'
        },
        redis: sampleRedisConfig
      },
      { db, throttleStore }
    );

    expect(createServerMock).toHaveBeenCalledWith(
      {
        host: '127.0.0.1',
        port: 8787,
        db: {
          driver: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          user: 'harbor',
          password: 'harbor',
          database: 'harbor'
        },
        redis: sampleRedisConfig
      },
      { verbose: undefined, db, throttleStore }
    );
    expect(db.connect).toHaveBeenCalledOnce();
    expect(throttleStore.connect).toHaveBeenCalledOnce();
    expect(app.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8787 });
    expect(log).toHaveBeenCalledWith('Service Hub listening on http://127.0.0.1:8787');

    log.mockRestore();
  });
});

describe('migrateCommand', () => {
  it('connects, migrates, and disconnects from the database', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await migrateCommand({ config: configPath });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.migrate).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('Database migration completed successfully.');

    log.mockRestore();
  });
});

describe('user commands', () => {
  it('creates a user account', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userCreateCommand({
      config: configPath,
      name: 'Alice',
      role: 'user',
      collectionAccess: ['*'],
      environmentAccess: ['*']
    });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.createUser).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Created user "Alice"'));

    log.mockRestore();
  });

  it('creates a token for a user and prints the one-time secret', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userTokenCreateCommand({ config: configPath, user: 'user-1', name: 'Alice laptop' });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.findUserById).toHaveBeenCalledWith('user-1');
    expect(db.createApiToken).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log.mock.calls.some((call) => String(call[0]).startsWith('hbk_'))).toBe(true);

    log.mockRestore();
  });

  it('lists stored users', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.listUsers = vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        role: 'user',
        collectionAccess: ['*'],
        environmentAccess: ['*'],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      }
    ]);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userListCommand({ config: configPath });

    expect(db.listUsers).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('- id: user-1');

    log.mockRestore();
  });

  it('lists stored tokens', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.listApiTokens = vi.fn().mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        name: 'Alice laptop',
        tokenHash: 'hash',
        tokenPrefix: 'hbk_AbCd1234',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null
      }
    ]);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userTokenListCommand({ config: configPath });

    expect(db.listApiTokens).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('- id: token-1');

    log.mockRestore();
  });

  it('reports when a token is revoked', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.revokeApiToken = vi.fn().mockResolvedValue(true);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userTokenRevokeCommand({ config: configPath, id: 'token-1' });

    expect(db.revokeApiToken).toHaveBeenCalledWith('token-1');
    expect(log).toHaveBeenCalledWith('Revoked API token token-1.');

    log.mockRestore();
  });
});
