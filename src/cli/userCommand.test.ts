import { describe, expect, it, vi } from 'vitest';
import { userCreateCommand } from '#/cli/userCommand.js';
import type { IDatabase } from '#/db/IDatabase.js';

vi.mock('#/config/serverConfig.js', () => ({
  loadServerConfig: vi.fn(() => ({ db: { driver: 'postgres' } }))
}));

vi.mock('#/db/index.js', () => ({
  createDatabase: vi.fn()
}));

/**
 * Builds a minimal database mock for user create command tests.
 */
function createDatabaseMock(): IDatabase {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    migrate: vi.fn(),
    getSystemUserId: vi.fn(() => 'system-user-id'),
    createUser: vi.fn(async (input) => ({
      id: 'user-id',
      name: input.name,
      role: input.role,
      collectionAccess: input.collectionAccess ?? [],
      environmentAccess: input.environmentAccess ?? [],
      llmAccess: input.llmAccess ?? false,
      llmModels: input.llmModels ?? [],
      llmMonthlyTokenLimit: input.llmMonthlyTokenLimit ?? null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdByUserId: 'system-user-id',
      updatedByUserId: 'system-user-id'
    })),
    createApiToken: vi.fn()
  } as unknown as IDatabase;
}

describe('userCreateCommand llm model flags', () => {
  it('stores wildcard llm model access from Commander llmModel option', async () => {
    const db = createDatabaseMock();
    const { createDatabase } = await import('#/db/index.js');
    vi.mocked(createDatabase).mockReturnValue(db);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userCreateCommand({
      config: 'server.yaml',
      name: 'tester',
      role: 'user',
      collectionAccess: ['*'],
      environmentAccess: ['*'],
      llmAccess: true,
      llmModel: ['*']
    } as Parameters<typeof userCreateCommand>[0]);

    expect(db.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        llmAccess: true,
        llmModels: ['*']
      }),
      'system-user-id'
    );

    log.mockRestore();
  });
});
