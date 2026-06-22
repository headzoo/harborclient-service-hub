import { readFileSync } from 'node:fs';
import { CommanderError } from 'commander';
import { normalizeCliArgv } from '#/cli/argv.js';
import { createProgram } from '#/cli/program.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * CLI entry point: builds the Commander program and parses process arguments.
 */
async function main(): Promise<void> {
  const program = createProgram(pkg.version);
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
