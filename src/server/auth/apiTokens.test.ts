import { describe, expect, it } from 'vitest';
import { extractBearer, generateApiToken, hashToken } from '#/server/auth/apiTokens.js';

describe('hashToken', () => {
  it('returns a deterministic sha256 hex digest', () => {
    const digest = hashToken('hbk_example');

    expect(digest).toHaveLength(64);
    expect(digest).toBe(hashToken('hbk_example'));
  });
});

describe('generateApiToken', () => {
  it('creates a record with hbk prefix and stored hash', () => {
    const { record, secret } = generateApiToken('user-1', 'Alice laptop');

    expect(record.userId).toBe('user-1');
    expect(record.name).toBe('Alice laptop');
    expect(secret.startsWith('hbk_')).toBe(true);
    expect(record.tokenPrefix.startsWith('hbk_')).toBe(true);
    expect(record.tokenHash).toBe(hashToken(secret));
    expect(record.lastUsedAt).toBeNull();
    expect(record.revokedAt).toBeNull();
  });
});

describe('extractBearer', () => {
  it('returns the token after Bearer', () => {
    expect(extractBearer('Bearer hbk_example')).toBe('hbk_example');
  });

  it('is case-insensitive for the Bearer scheme', () => {
    expect(extractBearer('bearer hbk_example')).toBe('hbk_example');
  });

  it('returns null for missing or malformed headers', () => {
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer('Basic abc')).toBeNull();
    expect(extractBearer('Bearer')).toBeNull();
    expect(extractBearer('Bearer token extra')).toBeNull();
  });
});
