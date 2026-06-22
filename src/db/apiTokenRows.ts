import type { ApiTokenRecord } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the api_tokens table.
 */
export interface ApiTokenSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Owning user identifier column.
   */
  user_id: string | null;

  /**
   * Human-readable token label.
   */
  name: string;

  /**
   * sha256 hex digest column.
   */
  token_hash: string;

  /**
   * Display prefix column.
   */
  token_prefix: string;

  /**
   * Creation timestamp column.
   */
  created_at: Date;

  /**
   * Last-used timestamp column, if any.
   */
  last_used_at: Date | null;

  /**
   * Revocation timestamp column, if any.
   */
  revoked_at: Date | null;
}

/**
 * Maps a snake_case SQL row to the shared {@link ApiTokenRecord} shape.
 *
 * @param row - Database row from api_tokens.
 * @returns Normalized token record for application code.
 */
export function mapApiTokenSqlRow(row: ApiTokenSqlRow): ApiTokenRecord {
  if (!row.user_id) {
    throw new Error(`API token ${row.id} is missing a user_id`);
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at
  };
}
