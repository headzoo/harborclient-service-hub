import pg from 'pg';
import { z } from 'zod/v4';
import type { IDatabase } from '#/db/IDatabase.js';
import { formatZodError } from '#/db/validation.js';

const { Pool } = pg;

const portSchema = z.union([
  z
    .number()
    .int({ message: 'Postgres port must be an integer between 1 and 65535.' })
    .min(1, { message: 'Postgres port must be an integer between 1 and 65535.' })
    .max(65535, { message: 'Postgres port must be an integer between 1 and 65535.' }),
  z
    .string()
    .regex(/^\d+$/, { message: 'Postgres port must be an integer between 1 and 65535.' })
    .transform(Number)
    .pipe(
      z
        .number()
        .int({ message: 'Postgres port must be an integer between 1 and 65535.' })
        .min(1, { message: 'Postgres port must be an integer between 1 and 65535.' })
        .max(65535, { message: 'Postgres port must be an integer between 1 and 65535.' })
    )
]);

/**
 * Validated configuration for a Postgres database connection.
 */
export interface PostgresDatabaseConfig {
  /**
   * Postgres server hostname or IP address.
   */
  host: string;

  /**
   * TCP port for the Postgres server.
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
   * Default database name.
   */
  database: string;
}

const postgresConfigSchema = z.object({
  driver: z.literal('postgres'),
  host: z.string().trim().min(1, { message: 'Postgres host must not be empty.' }),
  port: portSchema,
  user: z.string().trim().min(1, { message: 'Postgres user must not be empty.' }),
  password: z.string(),
  database: z.string().trim().min(1, { message: 'Postgres database must not be empty.' })
});

/**
 * Postgres-backed database implementation.
 */
export class PostgresDatabase implements IDatabase {
  /**
   * Active Postgres connection pool, or null when disconnected.
   */
  private pool: pg.Pool | null = null;

  /**
   * Creates a Postgres database instance from validated config.
   *
   * @param config - Parsed Postgres connection settings.
   */
  constructor(private readonly config: PostgresDatabaseConfig) { }

  /**
   * Validates raw config and constructs a {@link PostgresDatabase}.
   *
   * @param config - Raw `db` section from server.yaml.
   * @returns Configured Postgres database instance.
   * @throws {Error} When config fails Postgres-specific validation.
   */
  static fromConfig(config: unknown): PostgresDatabase {
    const parsed = postgresConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(formatZodError(parsed.error));
    }

    return new PostgresDatabase({
      host: parsed.data.host,
      port: parsed.data.port,
      user: parsed.data.user,
      password: parsed.data.password,
      database: parsed.data.database
    });
  }

  /**
   * Opens a Postgres connection pool and verifies connectivity with a query.
   */
  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    const pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database
    });

    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    this.pool = pool;
  }

  /**
   * Closes the Postgres connection pool and releases resources.
   */
  async disconnect(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.end();
    this.pool = null;
  }
}
