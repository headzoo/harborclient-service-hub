import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { mapApiTokenSqlRow, type ApiTokenSqlRow } from '#/db/apiTokenRows.js';
import { BOOTSTRAP_USER_NAME } from '#/db/bootstrapUsers.js';
import {
  mapCollectionSqlRow,
  mapEnvironmentSqlRow,
  mapFolderSqlRow,
  mapRequestSqlRow,
  type CollectionSqlRow,
  type EnvironmentSqlRow,
  type FolderSqlRow,
  type RequestSqlRow
} from '#/db/entityRows.js';
import type { IDatabase } from '#/db/IDatabase.js';
import { POSTGRES_MIGRATIONS } from '#/db/postgres/migrations.js';
import { postgresConfigSchema } from '#/db/postgres/schemas.js';
import type { PostgresDatabaseConfig } from '#/db/postgres/types.js';
import { trimRequiredName } from '#/db/trimRequiredName.js';
import { mapUserSqlRow, serializeAccessList, type UserSqlRow } from '#/db/userRows.js';
import type {
  ApiTokenRecord,
  AuthConfig,
  CollectionRecord,
  CreateUserInput,
  EnvironmentRecord,
  FolderRecord,
  KeyValue,
  SaveRequestInput,
  SavedRequestRecord,
  UpdateUserInput,
  UserRecord,
  Variable
} from '#/db/types.js';
import { DEFAULT_AUTH_JSON } from '#/db/types.js';
import { formatZodError } from '#/db/validation.js';

const { Pool } = pg;

const COLLECTION_SELECT =
  'SELECT id, name, variables, headers, auth, pre_request_script, post_request_script, created_at FROM collections';
const ENVIRONMENT_SELECT = 'SELECT id, name, variables, created_at FROM environments';
const USER_SELECT =
  'SELECT id, name, role, collection_access, environment_access, created_at, updated_at FROM users';
const API_TOKEN_SELECT = `SELECT
  id,
  user_id,
  name,
  token_hash,
  token_prefix,
  created_at,
  last_used_at,
  revoked_at
FROM api_tokens`;

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

  /**
   * Creates required tables when they do not already exist.
   */
  async migrate(): Promise<void> {
    for (const sql of POSTGRES_MIGRATIONS) {
      await this.query(sql);
    }

    await this.migrateOrphanTokensToBootstrapUser();
  }

  /**
   * Creates a new user account with the given role and access lists.
   *
   * @param input - User fields to persist.
   */
  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const trimmedName = trimRequiredName(input.name, 'User name');
    const id = randomUUID();
    const now = new Date();

    const result = await this.query<UserSqlRow>(
      `INSERT INTO users (
        id,
        name,
        role,
        collection_access,
        environment_access,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, role, collection_access, environment_access, created_at, updated_at`,
      [
        id,
        trimmedName,
        input.role,
        serializeAccessList(input.collectionAccess),
        serializeAccessList(input.environmentAccess),
        now,
        now
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('User not found after insert');
    }

    return mapUserSqlRow(row);
  }

  /**
   * Finds a user by stable identifier.
   *
   * @param id - User identifier to look up.
   */
  async findUserById(id: string): Promise<UserRecord | null> {
    const result = await this.query<UserSqlRow>(`${USER_SELECT} WHERE id = $1 LIMIT 1`, [id]);
    const row = result.rows[0];
    return row ? mapUserSqlRow(row) : null;
  }

  /**
   * Finds a user by unique display name.
   *
   * @param name - User name to look up.
   */
  async findUserByName(name: string): Promise<UserRecord | null> {
    const result = await this.query<UserSqlRow>(`${USER_SELECT} WHERE name = $1 LIMIT 1`, [name]);
    const row = result.rows[0];
    return row ? mapUserSqlRow(row) : null;
  }

  /**
   * Lists all user accounts ordered by name.
   */
  async listUsers(): Promise<UserRecord[]> {
    const result = await this.query<UserSqlRow>(`${USER_SELECT} ORDER BY name ASC`);
    return result.rows.map(mapUserSqlRow);
  }

  /**
   * Updates an existing user account.
   *
   * @param id - User identifier to update.
   * @param input - Partial fields to apply.
   */
  async updateUser(id: string, input: UpdateUserInput): Promise<UserRecord> {
    const existing = await this.findUserById(id);
    if (!existing) {
      throw new Error('User not found');
    }

    const name =
      input.name !== undefined ? trimRequiredName(input.name, 'User name') : existing.name;
    const role = input.role ?? existing.role;
    const collectionAccess = input.collectionAccess ?? existing.collectionAccess;
    const environmentAccess = input.environmentAccess ?? existing.environmentAccess;
    const updatedAt = new Date();

    const result = await this.query(
      `UPDATE users
      SET name = $1,
        role = $2,
        collection_access = $3,
        environment_access = $4,
        updated_at = $5
      WHERE id = $6`,
      [
        name,
        role,
        serializeAccessList(collectionAccess),
        serializeAccessList(environmentAccess),
        updatedAt,
        id
      ]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new Error('User not found');
    }

    const updated = await this.findUserById(id);
    if (!updated) {
      throw new Error('User not found');
    }

    return updated;
  }

  /**
   * Deletes a user account and revokes all of their API tokens.
   *
   * @param id - User identifier to delete.
   */
  async deleteUser(id: string): Promise<void> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE api_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
        [id, new Date()]
      );
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Assigns legacy API tokens without an owner to the bootstrap user.
   */
  async migrateOrphanTokensToBootstrapUser(): Promise<void> {
    const orphanResult = await this.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM api_tokens WHERE user_id IS NULL'
    );
    const orphanCount = Number(orphanResult.rows[0]?.count ?? 0);
    if (orphanCount === 0) {
      return;
    }

    let bootstrapUser = await this.findUserByName(BOOTSTRAP_USER_NAME);
    if (!bootstrapUser) {
      bootstrapUser = await this.createUser({
        name: BOOTSTRAP_USER_NAME,
        role: 'user',
        collectionAccess: ['*'],
        environmentAccess: ['*']
      });
    }

    await this.query('UPDATE api_tokens SET user_id = $1 WHERE user_id IS NULL', [
      bootstrapUser.id
    ]);
  }

  /**
   * Inserts a new API token record.
   *
   * @param record - Token metadata to persist.
   */
  async createApiToken(record: ApiTokenRecord): Promise<void> {
    await this.query(
      `INSERT INTO api_tokens (
        id,
        user_id,
        name,
        token_hash,
        token_prefix,
        created_at,
        last_used_at,
        revoked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.userId,
        record.name,
        record.tokenHash,
        record.tokenPrefix,
        record.createdAt,
        record.lastUsedAt,
        record.revokedAt
      ]
    );
  }

  /**
   * Finds an active token by its stored hash.
   *
   * @param tokenHash - sha256 hex digest of the bearer token secret.
   */
  async findActiveApiTokenByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const result = await this.query<ApiTokenSqlRow>(
      `${API_TOKEN_SELECT}
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND user_id IS NOT NULL
      LIMIT 1`,
      [tokenHash]
    );

    const row = result.rows[0];
    return row ? mapApiTokenSqlRow(row) : null;
  }

  /**
   * Lists all API tokens ordered by creation time descending.
   */
  async listApiTokens(): Promise<ApiTokenRecord[]> {
    const result = await this.query<ApiTokenSqlRow>(
      `${API_TOKEN_SELECT}
      WHERE user_id IS NOT NULL
      ORDER BY created_at DESC`
    );

    return result.rows.map(mapApiTokenSqlRow);
  }

  /**
   * Returns API tokens owned by a specific user ordered newest-first.
   *
   * @param userId - Owning user identifier.
   */
  async listApiTokensByUserId(userId: string): Promise<ApiTokenRecord[]> {
    const result = await this.query<ApiTokenSqlRow>(
      `${API_TOKEN_SELECT}
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(mapApiTokenSqlRow);
  }

  /**
   * Soft-revokes an active token by id.
   *
   * @param id - Token identifier to revoke.
   */
  async revokeApiToken(id: string): Promise<boolean> {
    const result = await this.query(
      `UPDATE api_tokens
      SET revoked_at = $2
      WHERE id = $1
        AND revoked_at IS NULL`,
      [id, new Date()]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Updates the last-used timestamp for a token.
   *
   * @param id - Token identifier that authenticated a request.
   * @param when - Timestamp of the authenticated request.
   */
  async touchApiTokenLastUsed(id: string, when: Date): Promise<void> {
    await this.query(`UPDATE api_tokens SET last_used_at = $2 WHERE id = $1`, [id, when]);
  }

  /**
   * Lists all collections ordered by name.
   */
  async listCollections(): Promise<CollectionRecord[]> {
    const result = await this.query<CollectionSqlRow>(`${COLLECTION_SELECT} ORDER BY name ASC`);
    return result.rows.map(mapCollectionSqlRow);
  }

  /**
   * Creates a new collection with the given name.
   *
   * @param name - Display name for the collection.
   */
  async createCollection(name: string): Promise<CollectionRecord> {
    const trimmedName = trimRequiredName(name, 'Collection name');
    const id = randomUUID();
    const createdAt = new Date();

    const result = await this.query<CollectionSqlRow>(
      `INSERT INTO collections (
        id,
        name,
        variables,
        headers,
        auth,
        pre_request_script,
        post_request_script,
        created_at
      ) VALUES ($1, $2, '[]', '[]', $3, '', '', $4)
      RETURNING id, name, variables, headers, auth, pre_request_script, post_request_script, created_at`,
      [id, trimmedName, DEFAULT_AUTH_JSON, createdAt]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Collection not found after insert');
    }

    return mapCollectionSqlRow(row);
  }

  /**
   * Updates a collection's name, variables, headers, and scripts.
   */
  async updateCollection(
    id: string,
    name: string,
    variables: Variable[],
    headers: KeyValue[],
    preRequestScript: string,
    postRequestScript: string,
    auth: AuthConfig
  ): Promise<CollectionRecord> {
    const trimmedName = trimRequiredName(name, 'Collection name');
    const result = await this.query(
      `UPDATE collections
      SET name = $1,
        variables = $2,
        headers = $3,
        auth = $4,
        pre_request_script = $5,
        post_request_script = $6
      WHERE id = $7`,
      [
        trimmedName,
        JSON.stringify(variables),
        JSON.stringify(headers),
        JSON.stringify(auth),
        preRequestScript,
        postRequestScript,
        id
      ]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new Error('Collection not found');
    }

    const selectResult = await this.query<CollectionSqlRow>(`${COLLECTION_SELECT} WHERE id = $1`, [
      id
    ]);
    const row = selectResult.rows[0];
    if (!row) {
      throw new Error('Collection not found');
    }

    return mapCollectionSqlRow(row);
  }

  /**
   * Deletes a collection and all of its requests and folders.
   *
   * @param id - Collection ID to delete.
   */
  async deleteCollection(id: string): Promise<void> {
    await this.query('DELETE FROM collections WHERE id = $1', [id]);
  }

  /**
   * Lists all environments ordered by name.
   */
  async listEnvironments(): Promise<EnvironmentRecord[]> {
    const result = await this.query<EnvironmentSqlRow>(`${ENVIRONMENT_SELECT} ORDER BY name ASC`);
    return result.rows.map(mapEnvironmentSqlRow);
  }

  /**
   * Creates a new environment with the given name.
   *
   * @param name - Display name for the environment.
   */
  async createEnvironment(name: string): Promise<EnvironmentRecord> {
    const trimmedName = trimRequiredName(name, 'Environment name');
    const id = randomUUID();
    const createdAt = new Date();

    const result = await this.query<EnvironmentSqlRow>(
      `INSERT INTO environments (id, name, variables, created_at)
      VALUES ($1, $2, '[]', $3)
      RETURNING id, name, variables, created_at`,
      [id, trimmedName, createdAt]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Environment not found after insert');
    }

    return mapEnvironmentSqlRow(row);
  }

  /**
   * Updates an environment's name and variables.
   */
  async updateEnvironment(
    id: string,
    name: string,
    variables: Variable[]
  ): Promise<EnvironmentRecord> {
    const trimmedName = trimRequiredName(name, 'Environment name');
    const result = await this.query(
      'UPDATE environments SET name = $1, variables = $2 WHERE id = $3',
      [trimmedName, JSON.stringify(variables), id]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new Error('Environment not found');
    }

    const selectResult = await this.query<EnvironmentSqlRow>(
      `${ENVIRONMENT_SELECT} WHERE id = $1`,
      [id]
    );
    const row = selectResult.rows[0];
    if (!row) {
      throw new Error('Environment not found');
    }

    return mapEnvironmentSqlRow(row);
  }

  /**
   * Deletes an environment.
   *
   * @param id - Environment ID to delete.
   */
  async deleteEnvironment(id: string): Promise<void> {
    await this.query('DELETE FROM environments WHERE id = $1', [id]);
  }

  /**
   * Lists all saved requests in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listRequests(collectionId: string): Promise<SavedRequestRecord[]> {
    const result = await this.query<RequestSqlRow>(
      'SELECT * FROM requests WHERE collection_id = $1 ORDER BY sort_order ASC, name ASC',
      [collectionId]
    );
    return result.rows.map(mapRequestSqlRow);
  }

  /**
   * Finds a saved request by id.
   *
   * @param id - Request identifier to look up.
   */
  async findRequestById(id: string): Promise<SavedRequestRecord | null> {
    const result = await this.query<RequestSqlRow>('SELECT * FROM requests WHERE id = $1 LIMIT 1', [
      id
    ]);
    const row = result.rows[0];
    return row ? mapRequestSqlRow(row) : null;
  }

  /**
   * Inserts a new request or updates an existing one.
   *
   * @param input - Request fields to persist.
   */
  async saveRequest(input: SaveRequestInput): Promise<SavedRequestRecord> {
    const trimmedName = trimRequiredName(input.name, 'Request name');
    const headers = JSON.stringify(input.headers);
    const params = JSON.stringify(input.params);
    const auth = JSON.stringify(input.auth);
    const folderId = input.folderId ?? null;
    const now = new Date();

    if (folderId != null) {
      const folderResult = await this.query<{ collection_id: string }>(
        'SELECT collection_id FROM folders WHERE id = $1',
        [folderId]
      );
      const folderRow = folderResult.rows[0];
      if (!folderRow || folderRow.collection_id !== input.collectionId) {
        throw new Error('Folder not found');
      }
    }

    if (input.id) {
      const result = await this.query(
        `UPDATE requests SET
          collection_id = $1,
          folder_id = $2,
          name = $3,
          method = $4,
          url = $5,
          headers = $6,
          params = $7,
          auth = $8,
          body = $9,
          body_type = $10,
          pre_request_script = $11,
          post_request_script = $12,
          comment = $13,
          updated_at = $14
        WHERE id = $15`,
        [
          input.collectionId,
          folderId,
          trimmedName,
          input.method,
          input.url,
          headers,
          params,
          auth,
          input.body,
          input.bodyType,
          input.preRequestScript,
          input.postRequestScript,
          input.comment,
          now,
          input.id
        ]
      );

      if ((result.rowCount ?? 0) > 0) {
        const selectResult = await this.query<RequestSqlRow>(
          'SELECT * FROM requests WHERE id = $1',
          [input.id]
        );
        const row = selectResult.rows[0];
        if (row) {
          return mapRequestSqlRow(row);
        }
      }
    }

    const maxResult = await this.query<{ max_order: number | null }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM requests
       WHERE collection_id = $1
         AND (($2::text IS NULL AND folder_id IS NULL) OR folder_id = $2)`,
      [input.collectionId, folderId]
    );
    const maxOrder = maxResult.rows[0]?.max_order ?? -1;
    const id = randomUUID();

    const result = await this.query<RequestSqlRow>(
      `INSERT INTO requests (
        id,
        collection_id,
        folder_id,
        name,
        method,
        url,
        headers,
        params,
        auth,
        body,
        body_type,
        pre_request_script,
        post_request_script,
        comment,
        sort_order,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id,
        input.collectionId,
        folderId,
        trimmedName,
        input.method,
        input.url,
        headers,
        params,
        auth,
        input.body,
        input.bodyType,
        input.preRequestScript,
        input.postRequestScript,
        input.comment,
        maxOrder + 1,
        now,
        now
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Request not found after insert');
    }

    return mapRequestSqlRow(row);
  }

  /**
   * Deletes a saved request by ID.
   *
   * @param id - Request ID to delete.
   */
  async deleteRequest(id: string): Promise<void> {
    await this.query('DELETE FROM requests WHERE id = $1', [id]);
  }

  /**
   * Lists all folders in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listFolders(collectionId: string): Promise<FolderRecord[]> {
    const result = await this.query<FolderSqlRow>(
      'SELECT * FROM folders WHERE collection_id = $1 ORDER BY sort_order ASC, name ASC',
      [collectionId]
    );
    return result.rows.map(mapFolderSqlRow);
  }

  /**
   * Finds a folder by id.
   *
   * @param id - Folder identifier to look up.
   */
  async findFolderById(id: string): Promise<FolderRecord | null> {
    const result = await this.query<FolderSqlRow>('SELECT * FROM folders WHERE id = $1 LIMIT 1', [
      id
    ]);
    const row = result.rows[0];
    return row ? mapFolderSqlRow(row) : null;
  }

  /**
   * Creates a new folder in a collection.
   *
   * @param collectionId - Collection to add the folder to.
   * @param name - Display name for the folder.
   */
  async createFolder(collectionId: string, name: string): Promise<FolderRecord> {
    const trimmedName = trimRequiredName(name, 'Folder name');
    const id = randomUUID();
    const createdAt = new Date();
    const maxResult = await this.query<{ max_order: number | null }>(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM folders WHERE collection_id = $1',
      [collectionId]
    );
    const maxOrder = maxResult.rows[0]?.max_order ?? -1;

    const result = await this.query<FolderSqlRow>(
      `INSERT INTO folders (id, collection_id, name, sort_order, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [id, collectionId, trimmedName, maxOrder + 1, createdAt]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Folder not found after insert');
    }

    return mapFolderSqlRow(row);
  }

  /**
   * Renames a folder.
   *
   * @param id - Folder ID to rename.
   * @param name - New display name.
   */
  async renameFolder(id: string, name: string): Promise<FolderRecord> {
    const trimmedName = trimRequiredName(name, 'Folder name');
    const result = await this.query<FolderSqlRow>(
      'UPDATE folders SET name = $1 WHERE id = $2 RETURNING *',
      [trimmedName, id]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Folder not found');
    }

    return mapFolderSqlRow(row);
  }

  /**
   * Deletes a folder and all requests inside it.
   *
   * @param id - Folder ID to delete.
   */
  async deleteFolder(id: string): Promise<void> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM requests WHERE folder_id = $1', [id]);
      await client.query('DELETE FROM folders WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reorders folders within a collection.
   *
   * @param collectionId - Collection containing the folders.
   * @param orderedFolderIds - Folder IDs in desired order.
   */
  async reorderFolders(collectionId: string, orderedFolderIds: string[]): Promise<void> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < orderedFolderIds.length; index++) {
        await client.query(
          'UPDATE folders SET sort_order = $1 WHERE id = $2 AND collection_id = $3',
          [index, orderedFolderIds[index], collectionId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reorders requests within a folder or at collection root.
   */
  async reorderRequests(
    collectionId: string,
    folderId: string | null,
    orderedRequestIds: string[]
  ): Promise<void> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < orderedRequestIds.length; index++) {
        await client.query(
          'UPDATE requests SET sort_order = $1, folder_id = $2 WHERE id = $3 AND collection_id = $4',
          [index, folderId, orderedRequestIds[index], collectionId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Moves a request to another folder or collection root at a given index.
   */
  async moveRequest(requestId: string, folderId: string | null, index: number): Promise<void> {
    const client = await this.requirePool().connect();

    /**
     * Lists request ids in a container ordered for reindexing.
     *
     * @param collectionId - Collection to query.
     * @param targetFolderId - Folder id or null for collection root.
     */
    const listInContainer = async (
      collectionId: string,
      targetFolderId: string | null
    ): Promise<string[]> => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM requests WHERE collection_id = $1
         AND (($2::text IS NULL AND folder_id IS NULL) OR folder_id = $2)
         ORDER BY sort_order ASC, name ASC`,
        [collectionId, targetFolderId]
      );
      return result.rows.map((row) => row.id);
    };

    /**
     * Rewrites sort_order and folder_id for a container's request list.
     *
     * @param targetFolderId - Folder id or null for collection root.
     * @param orderedIds - Request ids in desired order.
     */
    const reindexContainer = async (
      targetFolderId: string | null,
      orderedIds: string[]
    ): Promise<void> => {
      for (let sortIndex = 0; sortIndex < orderedIds.length; sortIndex++) {
        await client.query('UPDATE requests SET sort_order = $1, folder_id = $2 WHERE id = $3', [
          sortIndex,
          targetFolderId,
          orderedIds[sortIndex]
        ]);
      }
    };

    try {
      await client.query('BEGIN');

      const requestResult = await client.query<RequestSqlRow>(
        'SELECT * FROM requests WHERE id = $1',
        [requestId]
      );
      const requestRow = requestResult.rows[0];
      if (!requestRow) {
        throw new Error('Request not found');
      }

      const request = mapRequestSqlRow(requestRow);
      const collectionId = request.collectionId;
      const oldFolderId = request.folderId;

      if (folderId != null) {
        const folderResult = await client.query<{ collection_id: string }>(
          'SELECT collection_id FROM folders WHERE id = $1',
          [folderId]
        );
        const folderRow = folderResult.rows[0];
        if (!folderRow || folderRow.collection_id !== collectionId) {
          throw new Error('Folder not found');
        }
      }

      if (oldFolderId === folderId) {
        const siblings = (await listInContainer(collectionId, folderId)).filter(
          (id) => id !== requestId
        );
        siblings.splice(index, 0, requestId);
        await reindexContainer(folderId, siblings);
      } else {
        const oldIds = (await listInContainer(collectionId, oldFolderId)).filter(
          (id) => id !== requestId
        );
        await reindexContainer(oldFolderId, oldIds);

        const newIds = (await listInContainer(collectionId, folderId)).filter(
          (id) => id !== requestId
        );
        newIds.splice(index, 0, requestId);
        await reindexContainer(folderId, newIds);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Returns the active pool or throws when connect has not been called.
   *
   * @returns Connected Postgres pool.
   * @throws {Error} When the database is not connected.
   */
  private requirePool(): pg.Pool {
    if (!this.pool) {
      throw new Error('Postgres database is not connected.');
    }

    return this.pool;
  }

  /**
   * Executes a parameterized SQL statement against the active pool.
   *
   * @param sql - SQL statement with $1-style placeholders.
   * @param params - Bound parameter values.
   * @returns Query result from pg.
   */
  private async query<T extends pg.QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<pg.QueryResult<T>> {
    return this.requirePool().query<T>(sql, params);
  }
}
