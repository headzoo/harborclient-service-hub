import { describe, expect, it } from 'vitest';
import { normalizeCliArgv } from '#/cli/argv.js';

describe('normalizeCliArgv', () => {
  it('removes -- immediately after the cli entry script', () => {
    expect(
      normalizeCliArgv([
        '/usr/bin/node',
        '/project/node_modules/tsx/dist/cli.mjs',
        '/project/src/cli.ts',
        '--',
        'user',
        'create',
        '--name',
        'sean'
      ])
    ).toEqual([
      '/usr/bin/node',
      '/project/node_modules/tsx/dist/cli.mjs',
      '/project/src/cli.ts',
      'user',
      'create',
      '--name',
      'sean'
    ]);
  });

  it('leaves argv unchanged when no script-following separator is present', () => {
    const argv = ['/usr/bin/node', '/project/dist/cli.js', 'start'];
    expect(normalizeCliArgv(argv)).toEqual(argv);
  });
});
