import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGGING_CONFIG, normalizeLoggingConfig } from '#/config/loggingConfig.js';

describe('normalizeLoggingConfig', () => {
  it('returns defaults when the section is omitted', () => {
    expect(normalizeLoggingConfig()).toEqual(DEFAULT_LOGGING_CONFIG);
  });

  it('applies overrides from a partial logging section', () => {
    expect(
      normalizeLoggingConfig({
        level: 'debug',
        file: '/tmp/team-hub.log',
        console: false
      })
    ).toEqual({
      level: 'debug',
      file: '/tmp/team-hub.log',
      console: false
    });
  });

  it('fills omitted fields with defaults', () => {
    expect(normalizeLoggingConfig({ level: 'warn' })).toEqual({
      level: 'warn',
      file: null,
      console: true
    });
  });
});
