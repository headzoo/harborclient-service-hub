import type { Command } from 'commander';

export interface GlobalCommandOptions {
  /**
   * When true, enables verbose server logging.
   */
  verbose?: boolean;

  /**
   * Path to the server YAML config file.
   */
  config?: string;
}

/**
 * Merges root-level CLI options into a subcommand's parsed options.
 *
 * Commander stores global flags on the root program. Nested subcommands such as
 * `user create` must read them via {@link Command.optsWithGlobals}.
 *
 * @param command - The subcommand instance handling the action.
 * @param options - Options parsed for the subcommand action.
 * @returns Options with global `verbose` and `config` values applied.
 */
export function mergeGlobalOptions<T extends GlobalCommandOptions>(
  command: Command,
  options: T
): T {
  const globalOpts = command.optsWithGlobals() as GlobalCommandOptions;

  return {
    ...options,
    verbose: globalOpts.verbose ?? options.verbose,
    config: globalOpts.config ?? options.config
  };
}
