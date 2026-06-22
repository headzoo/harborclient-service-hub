/**
 * Removes the `--` separator that package managers insert between the script
 * name and user-provided arguments (for example `pnpm dev -- user create`).
 *
 * Commander treats everything after `--` as positional operands, so subcommand
 * flags such as `--name` would otherwise be ignored.
 *
 * @param argv - Raw process arguments including the node binary and script path.
 * @returns Copy of argv with a script-following `--` removed when present.
 */
export function normalizeCliArgv(argv: readonly string[]): string[] {
  const scriptIndex = argv.findIndex(
    (arg) => arg.endsWith('cli.ts') || arg.endsWith('cli.js')
  );
  if (scriptIndex === -1) {
    return [...argv];
  }

  const normalized = [...argv];
  if (normalized[scriptIndex + 1] === '--') {
    normalized.splice(scriptIndex + 1, 1);
  }

  return normalized;
}
