import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ApiTokenRecord } from '#/db/types.js';

/**
 * Prefix applied to generated bearer token secrets and display prefixes.
 */
const TOKEN_PREFIX = 'hbk_';

/**
 * Computes the sha256 hex digest used for database lookup of a bearer token.
 *
 * @param token - Raw bearer token secret from the Authorization header.
 * @returns Lowercase hex digest suitable for storage and lookup.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a new API token record and its one-time plaintext secret.
 *
 * @param userId - Owning user account identifier.
 * @param name - Human-readable label for operator listings.
 * @returns Persistable record (hash only) and the secret shown once at creation.
 */
export function generateApiToken(
  userId: string,
  name: string
): { record: ApiTokenRecord; secret: string } {
  const secretSuffix = randomBytes(32).toString('base64url');
  const secret = `${TOKEN_PREFIX}${secretSuffix}`;
  const tokenPrefix = `${TOKEN_PREFIX}${secretSuffix.slice(0, 8)}`;
  const createdAt = new Date();

  const record: ApiTokenRecord = {
    id: randomUUID(),
    userId,
    name,
    tokenHash: hashToken(secret),
    tokenPrefix,
    createdAt,
    lastUsedAt: null,
    revokedAt: null
  };

  return { record, secret };
}

/**
 * Extracts the bearer token value from an Authorization header.
 *
 * @param headerValue - Raw Authorization header value, if present.
 * @returns Token string after the `Bearer` scheme, or null when missing or malformed.
 */
export function extractBearer(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  return match?.[1] ?? null;
}
