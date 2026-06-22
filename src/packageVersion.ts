import { readFileSync } from 'node:fs';

/**
 * Reads the package version from the project root `package.json`.
 *
 * The module lives under `src/`, so `../package.json` resolves correctly when
 * running via tsx and when bundled to `dist/cli.js`.
 *
 * @returns Semantic version string from package.json.
 */
export function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}
