import { InvalidArgumentError } from 'commander';
import { describe, expect, it } from 'vitest';
import { defaultDataDir, expandHome, parseDataDir, parseHost, parsePort } from '#/cli/options.js';

describe('parsePort', () => {
  it('accepts valid ports', () => {
    expect(parsePort('8787')).toBe(8787);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
  });

  it('rejects invalid ports', () => {
    expect(() => parsePort('0')).toThrow(InvalidArgumentError);
    expect(() => parsePort('65536')).toThrow(InvalidArgumentError);
    expect(() => parsePort('abc')).toThrow(InvalidArgumentError);
    expect(() => parsePort('8787.5')).toThrow(InvalidArgumentError);
  });
});

describe('parseHost', () => {
  it('accepts non-empty hosts', () => {
    expect(parseHost('127.0.0.1')).toBe('127.0.0.1');
    expect(parseHost('0.0.0.0')).toBe('0.0.0.0');
  });

  it('rejects empty hosts', () => {
    expect(() => parseHost('')).toThrow(InvalidArgumentError);
    expect(() => parseHost('   ')).toThrow(InvalidArgumentError);
  });
});

describe('expandHome', () => {
  it('expands home directory paths', () => {
    expect(expandHome('~/.service-hub')).toContain('.service-hub');
    expect(expandHome('~')).not.toBe('~');
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/var/lib/service-hub')).toBe('/var/lib/service-hub');
  });
});

describe('parseDataDir', () => {
  it('accepts existing directories', () => {
    expect(parseDataDir('/tmp')).toBe('/tmp');
  });

  it('accepts creatable paths under existing parents', () => {
    const dir = parseDataDir('/tmp/service-hub-test-dir');
    expect(dir).toBe('/tmp/service-hub-test-dir');
  });

  it('rejects paths whose parent does not exist', () => {
    expect(() => parseDataDir('/nonexistent-parent-xyz/subdir')).toThrow(InvalidArgumentError);
  });
});

describe('defaultDataDir', () => {
  it('returns an expanded home path', () => {
    expect(defaultDataDir()).toContain('.service-hub');
  });
});
