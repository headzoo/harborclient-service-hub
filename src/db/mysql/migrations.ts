import { DEFAULT_AUTH_JSON } from '#/db/types.js';

/**
 * DDL for creating the api_tokens table when absent.
 */
export const API_TOKENS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS api_tokens (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_prefix VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL
)
`.trim();

/**
 * DDL for creating the collections table when absent.
 */
export const COLLECTIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS collections (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  variables LONGTEXT NOT NULL,
  headers LONGTEXT NOT NULL,
  auth LONGTEXT NOT NULL,
  pre_request_script LONGTEXT NOT NULL,
  post_request_script LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL
)
`.trim();

/**
 * DDL for creating the environments table when absent.
 */
export const ENVIRONMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS environments (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  variables LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL
)
`.trim();

/**
 * DDL for creating the folders table when absent.
 */
export const FOLDERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id VARCHAR(36) PRIMARY KEY,
  collection_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
)
`.trim();

/**
 * DDL for creating the requests table when absent.
 */
export const REQUESTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS requests (
  id VARCHAR(36) PRIMARY KEY,
  collection_id VARCHAR(36) NOT NULL,
  folder_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  method VARCHAR(16) NOT NULL DEFAULT 'GET',
  url LONGTEXT NOT NULL,
  headers LONGTEXT NOT NULL,
  params LONGTEXT NOT NULL,
  auth LONGTEXT NOT NULL,
  body LONGTEXT NOT NULL,
  body_type VARCHAR(32) NOT NULL DEFAULT 'none',
  pre_request_script LONGTEXT NOT NULL,
  post_request_script LONGTEXT NOT NULL,
  comment LONGTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
)
`.trim();

/**
 * DDL for creating the users table when absent.
 */
export const USERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(16) NOT NULL,
  collection_access LONGTEXT NOT NULL,
  environment_access LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
)
`.trim();

/**
 * Adds the owning user reference to api_tokens when upgrading existing databases.
 */
export const API_TOKENS_USER_ID_MIGRATION_SQL = `
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) NULL
`.trim();

/**
 * Default auth JSON for MySQL collection/request inserts.
 */
export const MYSQL_DEFAULT_AUTH_JSON = DEFAULT_AUTH_JSON;

/**
 * Ordered MySQL migrations applied by {@link MysqlDatabase.migrate}.
 */
export const MYSQL_MIGRATIONS = [
  API_TOKENS_MIGRATION_SQL,
  COLLECTIONS_MIGRATION_SQL,
  ENVIRONMENTS_MIGRATION_SQL,
  FOLDERS_MIGRATION_SQL,
  REQUESTS_MIGRATION_SQL,
  USERS_MIGRATION_SQL,
  API_TOKENS_USER_ID_MIGRATION_SQL
];
