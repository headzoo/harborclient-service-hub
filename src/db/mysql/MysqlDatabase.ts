import { randomUUID } from 'node:crypto';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
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
import { MYSQL_DEFAULT_AUTH_JSON, MYSQL_MIGRATIONS } from '#/db/mysql/migrations.js';
import { mysqlConfigSchema } from '#/db/mysql/schemas.js';
import type { MysqlDatabaseConfig } from '#/db/mysql/types.js';
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
import { formatZodError } from '#/db/validation.js';

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

  /**
   * Creates required tables when they do not already exist.
   */
  async migrate(): Promise<void> {
    for (const sql of MYSQL_MIGRATIONS) {
      await this.executeStatement(sql);
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

    await this.executeStatement(
      `INSERT INTO users (
        id,
        name,
        role,
        collection_access,
        environment_access,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

    const created = await this.findUserById(id);
    if (!created) {
      throw new Error('User not found after insert');
    }

    return created;
  }

  /**
   * Finds a user by stable identifier.
   *
   * @param id - User identifier to look up.
   */
  async findUserById(id: string): Promise<UserRecord | null> {
    const rows = await this.queryRows<UserSqlRow & RowDataPacket>(
      `${USER_SELECT} WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows[0];
    return row ? mapUserSqlRow(row) : null;
  }

  /**
   * Finds a user by unique display name.
   *
   * @param name - User name to look up.
   */
  async findUserByName(name: string): Promise<UserRecord | null> {
    const rows = await this.queryRows<UserSqlRow & RowDataPacket>(
      `${USER_SELECT} WHERE name = ? LIMIT 1`,
      [name]
    );
    const row = rows[0];
    return row ? mapUserSqlRow(row) : null;
  }

  /**
   * Lists all user accounts ordered by name.
   */
  async listUsers(): Promise<UserRecord[]> {
    const rows = await this.queryRows<UserSqlRow & RowDataPacket>(
      `${USER_SELECT} ORDER BY name ASC`
    );
    return rows.map(mapUserSqlRow);
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

    const result = await this.executeStatement(
      `UPDATE users
      SET name = ?,
        role = ?,
        collection_access = ?,
        environment_access = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        name,
        role,
        serializeAccessList(collectionAccess),
        serializeAccessList(environmentAccess),
        updatedAt,
        id
      ]
    );

    if ((result.affectedRows ?? 0) === 0) {
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
    const connection = await this.requirePool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
        [new Date(), id]
      );
      await connection.execute('DELETE FROM users WHERE id = ?', [id]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Assigns legacy API tokens without an owner to the bootstrap user.
   */
  async migrateOrphanTokensToBootstrapUser(): Promise<void> {
    const rows = await this.queryRows<{ count: number } & RowDataPacket>(
      'SELECT COUNT(*) AS count FROM api_tokens WHERE user_id IS NULL'
    );
    const orphanCount = rows[0]?.count ?? 0;
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

    await this.executeStatement('UPDATE api_tokens SET user_id = ? WHERE user_id IS NULL', [
      bootstrapUser.id
    ]);
  }

  /**
   * Inserts a new API token record.
   *
   * @param record - Token metadata to persist.
   */
  async createApiToken(record: ApiTokenRecord): Promise<void> {
    await this.executeStatement(
      `INSERT INTO api_tokens (
        id,
        user_id,
        name,
        token_hash,
        token_prefix,
        created_at,
        last_used_at,
        revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const rows = await this.queryRows<ApiTokenSqlRow & RowDataPacket>(
      `${API_TOKEN_SELECT}
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND user_id IS NOT NULL
      LIMIT 1`,
      [tokenHash]
    );

    const row = rows[0];
    return row ? mapApiTokenSqlRow(row) : null;
  }

  /**
   * Lists all API tokens ordered by creation time descending.
   */
  async listApiTokens(): Promise<ApiTokenRecord[]> {
    const rows = await this.queryRows<ApiTokenSqlRow & RowDataPacket>(
      `${API_TOKEN_SELECT}
      WHERE user_id IS NOT NULL
      ORDER BY created_at DESC`
    );

    return rows.map(mapApiTokenSqlRow);
  }

  /**
   * Returns API tokens owned by a specific user ordered newest-first.
   *
   * @param userId - Owning user identifier.
   */
  async listApiTokensByUserId(userId: string): Promise<ApiTokenRecord[]> {
    const rows = await this.queryRows<ApiTokenSqlRow & RowDataPacket>(
      `${API_TOKEN_SELECT}
      WHERE user_id = ?
      ORDER BY created_at DESC`,
      [userId]
    );

    return rows.map(mapApiTokenSqlRow);
  }

  /**
   * Soft-revokes an active token by id.
   *
   * @param id - Token identifier to revoke.
   */
  async revokeApiToken(id: string): Promise<boolean> {
    const result = await this.executeStatement(
      `UPDATE api_tokens
      SET revoked_at = ?
      WHERE id = ?
        AND revoked_at IS NULL`,
      [new Date(), id]
    );

    return (result.affectedRows ?? 0) > 0;
  }

  /**
   * Updates the last-used timestamp for a token.
   *
   * @param id - Token identifier that authenticated a request.
   * @param when - Timestamp of the authenticated request.
   */
  async touchApiTokenLastUsed(id: string, when: Date): Promise<void> {
    await this.executeStatement(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`, [when, id]);
  }

  /**
   * Lists all collections ordered by name.
   */
  async listCollections(): Promise<CollectionRecord[]> {
    const rows = await this.queryRows<CollectionSqlRow & RowDataPacket>(
      `${COLLECTION_SELECT} ORDER BY name ASC`
    );
    return rows.map(mapCollectionSqlRow);
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

    await this.executeStatement(
      `INSERT INTO collections (
        id,
        name,
        variables,
        headers,
        auth,
        pre_request_script,
        post_request_script,
        created_at
      ) VALUES (?, ?, '[]', '[]', ?, '', '', ?)`,
      [id, trimmedName, MYSQL_DEFAULT_AUTH_JSON, createdAt]
    );

    const rows = await this.queryRows<CollectionSqlRow & RowDataPacket>(
      `${COLLECTION_SELECT} WHERE id = ?`,
      [id]
    );
    const row = rows[0];
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
    const result = await this.executeStatement(
      `UPDATE collections
      SET name = ?,
        variables = ?,
        headers = ?,
        auth = ?,
        pre_request_script = ?,
        post_request_script = ?
      WHERE id = ?`,
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

    if ((result.affectedRows ?? 0) === 0) {
      throw new Error('Collection not found');
    }

    const rows = await this.queryRows<CollectionSqlRow & RowDataPacket>(
      `${COLLECTION_SELECT} WHERE id = ?`,
      [id]
    );
    const row = rows[0];
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
    await this.executeStatement('DELETE FROM collections WHERE id = ?', [id]);
  }

  /**
   * Lists all environments ordered by name.
   */
  async listEnvironments(): Promise<EnvironmentRecord[]> {
    const rows = await this.queryRows<EnvironmentSqlRow & RowDataPacket>(
      `${ENVIRONMENT_SELECT} ORDER BY name ASC`
    );
    return rows.map(mapEnvironmentSqlRow);
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

    await this.executeStatement(
      `INSERT INTO environments (id, name, variables, created_at) VALUES (?, ?, '[]', ?)`,
      [id, trimmedName, createdAt]
    );

    const rows = await this.queryRows<EnvironmentSqlRow & RowDataPacket>(
      `${ENVIRONMENT_SELECT} WHERE id = ?`,
      [id]
    );
    const row = rows[0];
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
    const result = await this.executeStatement(
      'UPDATE environments SET name = ?, variables = ? WHERE id = ?',
      [trimmedName, JSON.stringify(variables), id]
    );

    if ((result.affectedRows ?? 0) === 0) {
      throw new Error('Environment not found');
    }

    const rows = await this.queryRows<EnvironmentSqlRow & RowDataPacket>(
      `${ENVIRONMENT_SELECT} WHERE id = ?`,
      [id]
    );
    const row = rows[0];
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
    await this.executeStatement('DELETE FROM environments WHERE id = ?', [id]);
  }

  /**
   * Lists all saved requests in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listRequests(collectionId: string): Promise<SavedRequestRecord[]> {
    const rows = await this.queryRows<RequestSqlRow & RowDataPacket>(
      'SELECT * FROM requests WHERE collection_id = ? ORDER BY sort_order ASC, name ASC',
      [collectionId]
    );
    return rows.map(mapRequestSqlRow);
  }

  /**
   * Finds a saved request by id.
   *
   * @param id - Request identifier to look up.
   */
  async findRequestById(id: string): Promise<SavedRequestRecord | null> {
    const rows = await this.queryRows<RequestSqlRow & RowDataPacket>(
      'SELECT * FROM requests WHERE id = ? LIMIT 1',
      [id]
    );
    const row = rows[0];
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
      const folderRows = await this.queryRows<{ collection_id: string } & RowDataPacket>(
        'SELECT collection_id FROM folders WHERE id = ?',
        [folderId]
      );
      const folderRow = folderRows[0];
      if (!folderRow || folderRow.collection_id !== input.collectionId) {
        throw new Error('Folder not found');
      }
    }

    if (input.id) {
      const result = await this.executeStatement(
        `UPDATE requests SET
          collection_id = ?,
          folder_id = ?,
          name = ?,
          method = ?,
          url = ?,
          headers = ?,
          params = ?,
          auth = ?,
          body = ?,
          body_type = ?,
          pre_request_script = ?,
          post_request_script = ?,
          comment = ?,
          updated_at = ?
        WHERE id = ?`,
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

      if ((result.affectedRows ?? 0) > 0) {
        const rows = await this.queryRows<RequestSqlRow & RowDataPacket>(
          'SELECT * FROM requests WHERE id = ?',
          [input.id]
        );
        const row = rows[0];
        if (row) {
          return mapRequestSqlRow(row);
        }
      }
    }

    const maxRows = await this.queryRows<{ max_order: number | null } & RowDataPacket>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM requests
       WHERE collection_id = ?
         AND ((? IS NULL AND folder_id IS NULL) OR folder_id = ?)`,
      [input.collectionId, folderId, folderId]
    );
    const maxOrder = maxRows[0]?.max_order ?? -1;
    const id = randomUUID();

    await this.executeStatement(
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    const rows = await this.queryRows<RequestSqlRow & RowDataPacket>(
      'SELECT * FROM requests WHERE id = ?',
      [id]
    );
    const row = rows[0];
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
    await this.executeStatement('DELETE FROM requests WHERE id = ?', [id]);
  }

  /**
   * Lists all folders in a collection.
   *
   * @param collectionId - Collection to query.
   */
  async listFolders(collectionId: string): Promise<FolderRecord[]> {
    const rows = await this.queryRows<FolderSqlRow & RowDataPacket>(
      'SELECT * FROM folders WHERE collection_id = ? ORDER BY sort_order ASC, name ASC',
      [collectionId]
    );
    return rows.map(mapFolderSqlRow);
  }

  /**
   * Finds a folder by id.
   *
   * @param id - Folder identifier to look up.
   */
  async findFolderById(id: string): Promise<FolderRecord | null> {
    const rows = await this.queryRows<FolderSqlRow & RowDataPacket>(
      'SELECT * FROM folders WHERE id = ? LIMIT 1',
      [id]
    );
    const row = rows[0];
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
    const maxRows = await this.queryRows<{ max_order: number | null } & RowDataPacket>(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM folders WHERE collection_id = ?',
      [collectionId]
    );
    const maxOrder = maxRows[0]?.max_order ?? -1;

    await this.executeStatement(
      `INSERT INTO folders (id, collection_id, name, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?)`,
      [id, collectionId, trimmedName, maxOrder + 1, createdAt]
    );

    const rows = await this.queryRows<FolderSqlRow & RowDataPacket>(
      'SELECT * FROM folders WHERE id = ?',
      [id]
    );
    const row = rows[0];
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
    const result = await this.executeStatement('UPDATE folders SET name = ? WHERE id = ?', [
      trimmedName,
      id
    ]);

    if ((result.affectedRows ?? 0) === 0) {
      throw new Error('Folder not found');
    }

    const rows = await this.queryRows<FolderSqlRow & RowDataPacket>(
      'SELECT * FROM folders WHERE id = ?',
      [id]
    );
    const row = rows[0];
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
    const connection = await this.requirePool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM requests WHERE folder_id = ?', [id]);
      await connection.execute('DELETE FROM folders WHERE id = ?', [id]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Reorders folders within a collection.
   *
   * @param collectionId - Collection containing the folders.
   * @param orderedFolderIds - Folder IDs in desired order.
   */
  async reorderFolders(collectionId: string, orderedFolderIds: string[]): Promise<void> {
    const connection = await this.requirePool().getConnection();
    try {
      await connection.beginTransaction();
      for (let index = 0; index < orderedFolderIds.length; index++) {
        await connection.execute(
          'UPDATE folders SET sort_order = ? WHERE id = ? AND collection_id = ?',
          [index, orderedFolderIds[index], collectionId]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
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
    const connection = await this.requirePool().getConnection();
    try {
      await connection.beginTransaction();
      for (let index = 0; index < orderedRequestIds.length; index++) {
        await connection.execute(
          'UPDATE requests SET sort_order = ?, folder_id = ? WHERE id = ? AND collection_id = ?',
          [index, folderId, orderedRequestIds[index], collectionId]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Moves a request to another folder or collection root at a given index.
   */
  async moveRequest(requestId: string, folderId: string | null, index: number): Promise<void> {
    const connection = await this.requirePool().getConnection();

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
      const [rows] = await connection.execute<(RowDataPacket & { id: string })[]>(
        `SELECT id FROM requests WHERE collection_id = ?
         AND ((? IS NULL AND folder_id IS NULL) OR folder_id = ?)
         ORDER BY sort_order ASC, name ASC`,
        [collectionId, targetFolderId, targetFolderId]
      );
      return rows.map((row) => row.id);
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
        await connection.execute('UPDATE requests SET sort_order = ?, folder_id = ? WHERE id = ?', [
          sortIndex,
          targetFolderId,
          orderedIds[sortIndex]
        ]);
      }
    };

    try {
      await connection.beginTransaction();

      const [requestRows] = await connection.execute<(RequestSqlRow & RowDataPacket)[]>(
        'SELECT * FROM requests WHERE id = ?',
        [requestId]
      );
      const requestRow = requestRows[0];
      if (!requestRow) {
        throw new Error('Request not found');
      }

      const request = mapRequestSqlRow(requestRow);
      const collectionId = request.collectionId;
      const oldFolderId = request.folderId;

      if (folderId != null) {
        const [folderRows] = await connection.execute<
          (RowDataPacket & { collection_id: string })[]
        >('SELECT collection_id FROM folders WHERE id = ?', [folderId]);
        const folderRow = folderRows[0];
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

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Returns the active pool or throws when connect has not been called.
   *
   * @returns Connected MySQL pool.
   * @throws {Error} When the database is not connected.
   */
  private requirePool(): Pool {
    if (!this.pool) {
      throw new Error('MySQL database is not connected.');
    }

    return this.pool;
  }

  /**
   * Executes a parameterized SELECT and returns matching rows.
   *
   * @param sql - SQL statement with ? placeholders.
   * @param params - Bound parameter values.
   * @returns Query rows from mysql2.
   */
  private async queryRows<T extends RowDataPacket>(
    sql: string,
    params: Array<string | number | Date | null> = []
  ): Promise<T[]> {
    const [rows] = await this.requirePool().execute<T[]>(sql, params);
    return rows;
  }

  /**
   * Executes a parameterized statement and returns result metadata.
   *
   * @param sql - SQL statement with ? placeholders.
   * @param params - Bound parameter values.
   * @returns Result metadata such as affected row counts.
   */
  private async executeStatement(
    sql: string,
    params: Array<string | number | Date | null> = []
  ): Promise<ResultSetHeader> {
    const [result] = await this.requirePool().execute(sql, params);
    return result as ResultSetHeader;
  }
}
