import type {
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
import type { ApiTokenRecord } from '#/db/types.js';

/**
 * Common contract for HarborClient server database backends.
 */
export interface IDatabase {
  /**
   * Opens a connection pool or client to the configured database.
   */
  connect(): Promise<void>;

  /**
   * Closes open connections and releases resources.
   */
  disconnect(): Promise<void>;

  /**
   * Creates required tables or indexes when absent.
   *
   * SQL backends run DDL; Firestore treats schema as implicit and performs no work.
   */
  migrate(): Promise<void>;

  /**
   * Creates a new user account.
   *
   * @param input - User fields to persist.
   * @returns The newly created user record.
   */
  createUser(input: CreateUserInput): Promise<UserRecord>;

  /**
   * Finds a user by stable identifier.
   *
   * @param id - User identifier to look up.
   * @returns Matching user record, or null when not found.
   */
  findUserById(id: string): Promise<UserRecord | null>;

  /**
   * Finds a user by unique display name.
   *
   * @param name - User name to look up.
   * @returns Matching user record, or null when not found.
   */
  findUserByName(name: string): Promise<UserRecord | null>;

  /**
   * Lists all user accounts ordered by name.
   */
  listUsers(): Promise<UserRecord[]>;

  /**
   * Updates an existing user account.
   *
   * @param id - User identifier to update.
   * @param input - Partial fields to apply.
   * @returns The updated user record.
   */
  updateUser(id: string, input: UpdateUserInput): Promise<UserRecord>;

  /**
   * Deletes a user account and revokes all of their API tokens.
   *
   * @param id - User identifier to delete.
   */
  deleteUser(id: string): Promise<void>;

  /**
   * Assigns legacy API tokens without an owner to the bootstrap user.
   *
   * Idempotent: no-op when no orphan tokens exist.
   */
  migrateOrphanTokensToBootstrapUser(): Promise<void>;

  /**
   * Persists a newly generated API token record.
   *
   * @param record - Token metadata including the stored hash (not the raw secret).
   */
  createApiToken(record: ApiTokenRecord): Promise<void>;

  /**
   * Looks up a non-revoked token by its sha256 hash for request authentication.
   *
   * @param tokenHash - sha256 hex digest of the bearer token secret.
   * @returns Matching active token record, or null when not found or revoked.
   */
  findActiveApiTokenByHash(tokenHash: string): Promise<ApiTokenRecord | null>;

  /**
   * Returns all API token records ordered newest-first for operator listing.
   */
  listApiTokens(): Promise<ApiTokenRecord[]>;

  /**
   * Returns API tokens owned by a specific user ordered newest-first.
   *
   * @param userId - Owning user identifier.
   */
  listApiTokensByUserId(userId: string): Promise<ApiTokenRecord[]>;

  /**
   * Soft-revokes a token by id.
   *
   * @param id - Token identifier to revoke.
   * @returns True when an active token was updated; false when already revoked or missing.
   */
  revokeApiToken(id: string): Promise<boolean>;

  /**
   * Updates the last-used timestamp for a token after successful authentication.
   *
   * @param id - Token identifier that authenticated the request.
   * @param when - Timestamp of the authenticated request.
   */
  touchApiTokenLastUsed(id: string, when: Date): Promise<void>;

  /**
   * Lists all collections ordered by name.
   *
   * @returns All collections in the database.
   */
  listCollections(): Promise<CollectionRecord[]>;

  /**
   * Creates a new collection with the given name.
   *
   * @param name - Display name for the collection.
   * @returns The newly created collection.
   */
  createCollection(name: string): Promise<CollectionRecord>;

  /**
   * Updates a collection's name, variables, headers, and scripts.
   *
   * @param id - Collection ID to update.
   * @param name - New display name.
   * @param variables - Collection-scoped variables.
   * @param headers - Headers sent with every request in the collection.
   * @param preRequestScript - Script run before each request in the collection.
   * @param postRequestScript - Script run after each request in the collection.
   * @param auth - Default Authorization settings for requests in the collection.
   * @returns The updated collection.
   */
  updateCollection(
    id: string,
    name: string,
    variables: Variable[],
    headers: KeyValue[],
    preRequestScript: string,
    postRequestScript: string,
    auth: AuthConfig
  ): Promise<CollectionRecord>;

  /**
   * Deletes a collection and all of its requests and folders.
   *
   * @param id - Collection ID to delete.
   */
  deleteCollection(id: string): Promise<void>;

  /**
   * Lists all environments ordered by name.
   *
   * @returns All environments in the database.
   */
  listEnvironments(): Promise<EnvironmentRecord[]>;

  /**
   * Creates a new environment with the given name.
   *
   * @param name - Display name for the environment.
   * @returns The newly created environment.
   */
  createEnvironment(name: string): Promise<EnvironmentRecord>;

  /**
   * Updates an environment's name and variables.
   *
   * @param id - Environment ID to update.
   * @param name - New display name.
   * @param variables - Environment-scoped variables.
   * @returns The updated environment.
   */
  updateEnvironment(id: string, name: string, variables: Variable[]): Promise<EnvironmentRecord>;

  /**
   * Deletes an environment.
   *
   * @param id - Environment ID to delete.
   */
  deleteEnvironment(id: string): Promise<void>;

  /**
   * Lists all saved requests in a collection.
   *
   * @param collectionId - Collection to query.
   * @returns Requests ordered by sort_order then name.
   */
  listRequests(collectionId: string): Promise<SavedRequestRecord[]>;

  /**
   * Finds a saved request by id.
   *
   * @param id - Request identifier to look up.
   * @returns Matching request record, or null when not found.
   */
  findRequestById(id: string): Promise<SavedRequestRecord | null>;

  /**
   * Inserts a new request or updates an existing one.
   *
   * @param input - Request fields to persist.
   * @returns The saved request with ID and timestamps.
   */
  saveRequest(input: SaveRequestInput): Promise<SavedRequestRecord>;

  /**
   * Deletes a saved request by ID.
   *
   * @param id - Request ID to delete.
   */
  deleteRequest(id: string): Promise<void>;

  /**
   * Lists all folders in a collection.
   *
   * @param collectionId - Collection to query.
   * @returns Folders ordered by sort_order then name.
   */
  listFolders(collectionId: string): Promise<FolderRecord[]>;

  /**
   * Finds a folder by id.
   *
   * @param id - Folder identifier to look up.
   * @returns Matching folder record, or null when not found.
   */
  findFolderById(id: string): Promise<FolderRecord | null>;

  /**
   * Creates a new folder in a collection.
   *
   * @param collectionId - Collection to add the folder to.
   * @param name - Display name for the folder.
   * @returns The newly created folder.
   */
  createFolder(collectionId: string, name: string): Promise<FolderRecord>;

  /**
   * Renames a folder.
   *
   * @param id - Folder ID to rename.
   * @param name - New display name.
   * @returns The updated folder.
   */
  renameFolder(id: string, name: string): Promise<FolderRecord>;

  /**
   * Deletes a folder and all requests inside it.
   *
   * @param id - Folder ID to delete.
   */
  deleteFolder(id: string): Promise<void>;

  /**
   * Reorders folders within a collection.
   *
   * @param collectionId - Collection containing the folders.
   * @param orderedFolderIds - Folder IDs in desired order.
   */
  reorderFolders(collectionId: string, orderedFolderIds: string[]): Promise<void>;

  /**
   * Reorders requests within a folder or at collection root.
   *
   * @param collectionId - Collection containing the requests.
   * @param folderId - Folder ID, or null for root-level requests.
   * @param orderedRequestIds - Request IDs in desired order.
   */
  reorderRequests(
    collectionId: string,
    folderId: string | null,
    orderedRequestIds: string[]
  ): Promise<void>;

  /**
   * Moves a request to another folder or collection root at a given index.
   *
   * @param requestId - Request ID to move.
   * @param folderId - Destination folder ID, or null for collection root.
   * @param index - Zero-based position within the destination container.
   */
  moveRequest(requestId: string, folderId: string | null, index: number): Promise<void>;
}
