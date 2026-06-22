import { Firestore } from '@google-cloud/firestore';
import { z } from 'zod/v4';
import type { IDatabase } from '#/db/IDatabase.js';
import { formatZodError } from '#/db/validation.js';

/**
 * Validated configuration for a Firestore database connection.
 */
export interface FirestoreDatabaseConfig {
  /**
   * Google Cloud project ID that owns the Firestore database.
   */
  projectId: string;

  /**
   * Optional path to a service account key JSON file.
   */
  keyFilename?: string;
}

const firestoreConfigSchema = z.object({
  driver: z.literal('firestore'),
  projectId: z.string().trim().min(1, { message: 'Firestore projectId must not be empty.' }),
  keyFilename: z.string().trim().min(1).optional()
});

/**
 * Firestore-backed database implementation.
 */
export class FirestoreDatabase implements IDatabase {
  /**
   * Active Firestore client, or null when disconnected.
   */
  private client: Firestore | null = null;

  /**
   * Creates a Firestore database instance from validated config.
   *
   * @param config - Parsed Firestore connection settings.
   */
  constructor(private readonly config: FirestoreDatabaseConfig) { }

  /**
   * Validates raw config and constructs a {@link FirestoreDatabase}.
   *
   * @param config - Raw `db` section from server.yaml.
   * @returns Configured Firestore database instance.
   * @throws {Error} When config fails Firestore-specific validation.
   */
  static fromConfig(config: unknown): FirestoreDatabase {
    const parsed = firestoreConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(formatZodError(parsed.error));
    }

    return new FirestoreDatabase({
      projectId: parsed.data.projectId,
      keyFilename: parsed.data.keyFilename
    });
  }

  /**
   * Opens a Firestore client and verifies connectivity by listing collections.
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const client = new Firestore({
      projectId: this.config.projectId,
      keyFilename: this.config.keyFilename
    });

    await client.listCollections();

    this.client = client;
  }

  /**
   * Terminates the Firestore client and releases resources.
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.terminate();
    this.client = null;
  }
}
