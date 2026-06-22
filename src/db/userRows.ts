import type { UserRecord, UserRole } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the users table.
 */
export interface UserSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Unique display name column.
   */
  name: string;

  /**
   * Role column (`admin` or `user`).
   */
  role: string;

  /**
   * JSON-encoded collection access list column.
   */
  collection_access: string;

  /**
   * JSON-encoded environment access list column.
   */
  environment_access: string;

  /**
   * Creation timestamp column.
   */
  created_at: Date;

  /**
   * Last update timestamp column.
   */
  updated_at: Date;
}

/**
 * Parses a stored role string into a {@link UserRole}.
 *
 * @param role - Role value read from the database.
 * @returns Validated user role.
 * @throws {Error} When the stored role is not recognized.
 */
function parseUserRole(role: string): UserRole {
  if (role === 'admin' || role === 'user') {
    return role;
  }

  throw new Error(`Invalid user role: ${role}`);
}

/**
 * Parses a JSON-encoded access list column from SQL storage.
 *
 * @param value - JSON array string from the database.
 * @returns Parsed access id list.
 */
function parseAccessList(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new Error('Invalid access list JSON in users table');
  }

  return parsed;
}

/**
 * Maps a snake_case SQL row to the shared {@link UserRecord} shape.
 *
 * @param row - Database row from users.
 * @returns Normalized user record for application code.
 */
export function mapUserSqlRow(row: UserSqlRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    role: parseUserRole(row.role),
    collectionAccess: parseAccessList(row.collection_access),
    environmentAccess: parseAccessList(row.environment_access),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Serializes an access list for SQL storage.
 *
 * @param access - Collection or environment access ids.
 * @returns JSON string suitable for a TEXT column.
 */
export function serializeAccessList(access: string[]): string {
  return JSON.stringify(access);
}
