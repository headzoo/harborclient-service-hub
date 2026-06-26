import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger } from '#/server/logging/logger.js';

describe('createLogger', () => {
  it('creates a console logger with the configured level', () => {
    const logger = createLogger({ level: 'debug', file: null, console: true });

    expect(logger.level).toBe('debug');
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]?.constructor.name).toBe('Console');
  });

  it('creates a file logger when file path is set', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'team-hub-logger-'));
    const filePath = path.join(dir, 'team-hub.log');
    const logger = createLogger({ level: 'info', file: filePath, console: false });

    expect(logger.level).toBe('info');
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]?.constructor.name).toBe('File');
  });

  it('uses a silent console transport when both outputs are disabled', () => {
    const logger = createLogger({ level: 'warn', file: null, console: false });

    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]?.constructor.name).toBe('Console');
    expect(logger.transports[0]?.silent).toBe(true);
  });
});
