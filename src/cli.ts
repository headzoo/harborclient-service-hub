import { CommanderError } from 'commander';
import { normalizeCliArgv } from '#/cli/argv.js';
import { createProgram } from '#/cli/program.js';
import { readPackageVersion } from '#/packageVersion.js';

const version = readPackageVersion();

/**
 * CLI entry point: builds the Commander program and parses process arguments.
 */
async function main(): Promise<void> {
  const program = createProgram(version);
  program.exitOverride();

  try {
    await program.parseAsync(normalizeCliArgv(process.argv));
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
