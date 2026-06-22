import { DEFAULT_AUTH_JSON } from '#/db/types.js';

/**
 * DDL for creating the api_tokens table when absent.
 */
export const API_TOKENS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
`.trim();

/**
 * DDL for creating the collections table when absent.
 */
export const COLLECTIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  headers TEXT NOT NULL DEFAULT '[]',
  auth TEXT NOT NULL DEFAULT '${DEFAULT_AUTH_JSON.replace(/'/g, "''")}',
  pre_request_script TEXT NOT NULL DEFAULT '',
  post_request_script TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);
`.trim();

/**
 * DDL for creating the environments table when absent.
 */
export const ENVIRONMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL
);
`.trim();

/**
 * DDL for creating the folders table when absent.
 */
export const FOLDERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);
`.trim();

/**
 * DDL for creating the requests table when absent.
 */
export const REQUESTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL DEFAULT '',
  headers TEXT NOT NULL DEFAULT '[]',
  params TEXT NOT NULL DEFAULT '[]',
  auth TEXT NOT NULL DEFAULT '${DEFAULT_AUTH_JSON.replace(/'/g, "''")}',
  body TEXT NOT NULL DEFAULT '',
  body_type TEXT NOT NULL DEFAULT 'none',
  pre_request_script TEXT NOT NULL DEFAULT '',
  post_request_script TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
`.trim();

/**
 * DDL for creating the users table when absent.
 */
export const USERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  collection_access TEXT NOT NULL DEFAULT '[]',
  environment_access TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
`.trim();

/**
 * Adds the owning user reference to api_tokens when upgrading existing databases.
 */
export const API_TOKENS_USER_ID_MIGRATION_SQL = `
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
`.trim();

/**
 * Ordered Postgres migrations applied by {@link PostgresDatabase.migrate}.
 */
export const POSTGRES_MIGRATIONS = [
  API_TOKENS_MIGRATION_SQL,
  COLLECTIONS_MIGRATION_SQL,
  ENVIRONMENTS_MIGRATION_SQL,
  FOLDERS_MIGRATION_SQL,
  REQUESTS_MIGRATION_SQL,
  USERS_MIGRATION_SQL,
  API_TOKENS_USER_ID_MIGRATION_SQL
];
