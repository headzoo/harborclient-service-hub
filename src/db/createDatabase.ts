import type { IDatabase } from '#/db/IDatabase.js';
import { FirestoreDatabase } from '#/db/FirestoreDatabase.js';
import { MysqlDatabase } from '#/db/MysqlDatabase.js';
import { PostgresDatabase } from '#/db/PostgresDatabase.js';

/**
 * Reads the `driver` field from a raw db config mapping.
 *
 * @param config - Raw `db` section from server.yaml.
 * @returns Driver name when present and a string.
 * @throws {Error} When config is not a mapping or driver is missing.
 */
function readDriver(config: unknown): string {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Database config must be a mapping.');
  }

  const driver = (config as Record<string, unknown>).driver;
  if (typeof driver !== 'string' || driver.trim().length === 0) {
    throw new Error('Database config must include a non-empty db.driver.');
  }

  return driver;
}

/**
 * Creates a database instance from the raw `db` section of server.yaml.
 *
 * Each driver validates its own required fields via {@link FirestoreDatabase.fromConfig},
 * {@link MysqlDatabase.fromConfig}, or {@link PostgresDatabase.fromConfig}.
 *
 * @param config - Raw `db` section from server.yaml.
 * @returns Configured database implementation for the requested driver.
 * @throws {Error} When the driver is unknown or driver-specific validation fails.
 */
export function createDatabase(config: unknown): IDatabase {
  const driver = readDriver(config);

  switch (driver) {
    case 'firestore':
      return FirestoreDatabase.fromConfig(config);
    case 'mysql':
      return MysqlDatabase.fromConfig(config);
    case 'postgres':
      return PostgresDatabase.fromConfig(config);
    default:
      throw new Error(
        `Unsupported database driver "${driver}". Expected "firestore", "mysql", or "postgres".`
      );
  }
}
