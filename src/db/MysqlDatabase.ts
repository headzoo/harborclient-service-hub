import mysql, { type Pool } from 'mysql2/promise';
import { z } from 'zod/v4';
import type { IDatabase } from '#/db/IDatabase.js';
import { formatZodError } from '#/db/validation.js';

const portSchema = z.union([
  z
    .number()
    .int({ message: 'MySQL port must be an integer between 1 and 65535.' })
    .min(1, { message: 'MySQL port must be an integer between 1 and 65535.' })
    .max(65535, { message: 'MySQL port must be an integer between 1 and 65535.' }),
  z
    .string()
    .regex(/^\d+$/, { message: 'MySQL port must be an integer between 1 and 65535.' })
    .transform(Number)
    .pipe(
      z
        .number()
        .int({ message: 'MySQL port must be an integer between 1 and 65535.' })
        .min(1, { message: 'MySQL port must be an integer between 1 and 65535.' })
        .max(65535, { message: 'MySQL port must be an integer between 1 and 65535.' })
    )
]);

/**
 * Validated configuration for a MySQL database connection.
 */
export interface MysqlDatabaseConfig {
  /**
   * MySQL server hostname or IP address.
   */
  host: string;

  /**
   * TCP port for the MySQL server.
   */
  port: number;

  /**
   * Database user name.
   */
  user: string;

  /**
   * Database user password.
   */
  password: string;

  /**
   * Default database/schema name.
   */
  database: string;
}

const mysqlConfigSchema = z.object({
  driver: z.literal('mysql'),
  host: z.string().trim().min(1, { message: 'MySQL host must not be empty.' }),
  port: portSchema,
  user: z.string().trim().min(1, { message: 'MySQL user must not be empty.' }),
  password: z.string(),
  database: z.string().trim().min(1, { message: 'MySQL database must not be empty.' })
});

/**
 * MySQL-backed database implementation.
 */
export class MysqlDatabase implements IDatabase {
  /**
   * Active MySQL connection pool, or null when disconnected.
   */
  private pool: Pool | null = null;

  /**
   * Creates a MySQL database instance from validated config.
   *
   * @param config - Parsed MySQL connection settings.
   */
  constructor(private readonly config: MysqlDatabaseConfig) { }

  /**
   * Validates raw config and constructs a {@link MysqlDatabase}.
   *
   * @param config - Raw `db` section from server.yaml.
   * @returns Configured MySQL database instance.
   * @throws {Error} When config fails MySQL-specific validation.
   */
  static fromConfig(config: unknown): MysqlDatabase {
    const parsed = mysqlConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(formatZodError(parsed.error));
    }

    return new MysqlDatabase({
      host: parsed.data.host,
      port: parsed.data.port,
      user: parsed.data.user,
      password: parsed.data.password,
      database: parsed.data.database
    });
  }

  /**
   * Opens a MySQL connection pool and verifies connectivity with a ping.
   */
  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    const pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database
    });

    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    this.pool = pool;
  }

  /**
   * Closes the MySQL connection pool and releases resources.
   */
  async disconnect(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.end();
    this.pool = null;
  }
}
