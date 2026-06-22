import { Command } from 'commander';
import { mergeGlobalOptions } from '#/cli/globalOptions.js';
import { loadServerConfig } from '#/config/serverConfig.js';
import { createDatabase } from '#/db/index.js';
import type { LlmUsageLogRecord } from '#/db/types.js';

export interface LlmCommandOptions {
  /**
   * Path to the server YAML config file (from global `-c` / `--config`).
   */
  config: string;
}

/**
 * Formats a stored user id for CLI attribution output.
 *
 * @param userId - User id from a usage log row.
 * @param usersById - Lookup map from user id to display name.
 * @returns Display name with id, raw id, or a dash placeholder.
 */
function formatUserLabel(userId: string, usersById: Map<string, string>): string {
  const name = usersById.get(userId);
  if (!name) {
    return userId;
  }

  return `${name} (${userId})`;
}

/**
 * Formats an API token id for CLI output.
 *
 * @param apiTokenId - Token id from a usage log row, or null when unset.
 * @param tokensById - Lookup map from token id to display name.
 * @returns Token name with id, raw id, or a dash placeholder.
 */
function formatApiTokenLabel(apiTokenId: string | null, tokensById: Map<string, string>): string {
  if (!apiTokenId) {
    return '-';
  }

  const name = tokensById.get(apiTokenId);
  if (!name) {
    return apiTokenId;
  }

  return `${name} (${apiTokenId})`;
}

/**
 * Prints one per-request LLM usage log entry.
 *
 * @param entry - Usage log record to display.
 * @param usersById - Lookup map from user id to display name.
 * @param tokensById - Lookup map from token id to display name.
 */
function printLlmUsageLog(
  entry: LlmUsageLogRecord,
  usersById: Map<string, string>,
  tokensById: Map<string, string>
): void {
  console.log(`- id: ${entry.id}`);
  console.log(`  user: ${formatUserLabel(entry.userId, usersById)}`);
  console.log(`  api token: ${formatApiTokenLabel(entry.apiTokenId, tokensById)}`);
  console.log(`  period: ${entry.period}`);
  console.log(`  model: ${entry.model}`);
  console.log(`  provider: ${entry.provider}`);
  console.log(`  prompt tokens: ${entry.promptTokens}`);
  console.log(`  completion tokens: ${entry.completionTokens}`);
  console.log(`  total tokens: ${entry.totalTokens}`);
  console.log(`  new turn: ${entry.isNewTurn ? 'yes' : 'no'}`);
  console.log(`  tool calls: ${entry.hadToolCalls ? 'yes' : 'no'}`);
  console.log(`  messages: ${entry.messageCount}`);
  console.log(`  created: ${entry.createdAt.toISOString()}`);
}

/**
 * Lists all per-request LLM usage log entries.
 *
 * @param options - Parsed LLM list options including config path.
 */
export async function llmListCommand(options: LlmCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const entries = await db.listLlmUsageLogs();
  const users = await db.listUsers();
  const tokens = await db.listApiTokens();
  await db.disconnect();

  if (entries.length === 0) {
    console.log('No LLM usage records found.');
    return;
  }

  const usersById = new Map(users.map((user) => [user.id, user.name]));
  const tokensById = new Map(tokens.map((token) => [token.id, token.name]));

  for (const entry of entries) {
    printLlmUsageLog(entry, usersById, tokensById);
  }
}

/**
 * Registers the `llm` command group on a Commander program.
 *
 * @param program - Root or parent Commander instance.
 * @param handlers - Injectable handlers for testing.
 */
export function registerLlmCommand(
  program: Command,
  handlers: {
    list?: (options: LlmCommandOptions) => Promise<void>;
  } = {}
): void {
  const llm = program.command('llm').description('Inspect LLM usage records');

  llm
    .command('list')
    .description('List all per-request LLM usage log entries')
    .action(
      /**
       * Runs the LLM list subcommand after merging global CLI options.
       */
      async function llmListAction(this: Command, options: LlmCommandOptions) {
        await (handlers.list ?? llmListCommand)(mergeGlobalOptions(this, options));
      }
    );
}
