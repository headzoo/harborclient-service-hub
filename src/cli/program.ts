import { Command } from 'commander';
import { DEFAULT_CONFIG_PATH } from '#/config/serverConfig.js';
import {
  registerCollectionCommand,
  type CollectionCommandOptions
} from '#/cli/collectionCommand.js';
import { registerLlmCommand, type LlmCommandOptions } from '#/cli/llmCommand.js';
import { registerMigrateCommand, type MigrateCommandOptions } from '#/cli/migrateCommand.js';
import {
  registerUserCommand,
  type UserCommandOptions,
  type UserCreateCommandOptions,
  type UserTokenCreateCommandOptions,
  type UserTokenListCommandOptions,
  type UserTokenRevokeCommandOptions,
  type UserUpdateCommandOptions
} from '#/cli/userCommand.js';
import { registerStartCommand, type StartCommandOptions } from '#/server.js';

export interface ProgramDependencies {
  /**
   * Optional override for the start subcommand handler (used in tests).
   */
  startCommand?: (options: StartCommandOptions) => Promise<void>;

  /**
   * Optional override for the migrate subcommand handler (used in tests).
   */
  migrateCommand?: (options: MigrateCommandOptions) => Promise<void>;

  /**
   * Optional overrides for collection subcommand handlers (used in tests).
   */
  collectionCommand?: {
    list?: (options: CollectionCommandOptions) => Promise<void>;
  };

  /**
   * Optional overrides for LLM subcommand handlers (used in tests).
   */
  llmCommand?: {
    list?: (options: LlmCommandOptions) => Promise<void>;
  };

  /**
   * Optional overrides for user subcommand handlers (used in tests).
   */
  userCommand?: {
    create?: (options: UserCreateCommandOptions) => Promise<void>;
    list?: (options: UserCommandOptions) => Promise<void>;
    show?: (options: UserUpdateCommandOptions) => Promise<void>;
    update?: (options: UserUpdateCommandOptions) => Promise<void>;
    delete?: (options: UserUpdateCommandOptions) => Promise<void>;
    tokenCreate?: (options: UserTokenCreateCommandOptions) => Promise<void>;
    tokenList?: (options: UserTokenListCommandOptions) => Promise<void>;
    tokenRevoke?: (options: UserTokenRevokeCommandOptions) => Promise<void>;
  };
}

/**
 * Creates the root Commander program with global options and subcommands.
 *
 * @param version - Package version shown by `--version`.
 * @param deps - Injectable handlers for testing.
 * @returns Configured Commander program ready to parse argv.
 */
export function createProgram(version: string, deps: ProgramDependencies = {}): Command {
  const program = new Command();

  program
    .name('team-hub')
    .description('Team Hub — central server for HarborClient')
    .version(version)
    .showHelpAfterError()
    .enablePositionalOptions()
    .option('-v, --verbose', 'Enable verbose logging')
    .option(
      '-c, --config <path>',
      `Path to config file (default: ${DEFAULT_CONFIG_PATH})`,
      DEFAULT_CONFIG_PATH
    );

  registerStartCommand(program, deps.startCommand);
  registerMigrateCommand(program, deps.migrateCommand);
  registerCollectionCommand(program, deps.collectionCommand);
  registerLlmCommand(program, deps.llmCommand);
  registerUserCommand(program, deps.userCommand);

  return program;
}
