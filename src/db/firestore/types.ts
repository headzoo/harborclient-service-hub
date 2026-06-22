import type { AuthConfig, KeyValue, UserRole, Variable } from '#/db/types.js';

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

/**
 * Firestore document shape for persisted user accounts.
 */
export interface FirestoreUserDocument {
  /**
   * Unique display name for the account.
   */
  name: string;

  /**
   * Role assigned to the account.
   */
  role: UserRole;

  /**
   * Collection ids the user may access, or `['*']` for all collections.
   */
  collectionAccess: string[];

  /**
   * Environment ids the user may access, or `['*']` for all environments.
   */
  environmentAccess: string[];

  /**
   * When the user account was created.
   */
  createdAt: Date;

  /**
   * When the user account was last updated.
   */
  updatedAt: Date;
}

/**
 * Firestore document shape for persisted API tokens.
 */
export interface FirestoreApiTokenDocument {
  /**
   * Owning user identifier.
   */
  userId: string;

  /**
   * Human-readable token label.
   */
  name: string;

  /**
   * sha256 hex digest of the bearer token secret.
   */
  tokenHash: string;

  /**
   * Non-secret prefix shown in listings.
   */
  tokenPrefix: string;

  /**
   * When the token was created.
   */
  createdAt: Date;

  /**
   * When the token was last used to authenticate a request, if ever.
   */
  lastUsedAt: Date | null;

  /**
   * When the token was revoked; null means the token is still active.
   */
  revokedAt: Date | null;
}

/**
 * Firestore document shape for persisted collections.
 */
export interface FirestoreCollectionDocument {
  /**
   * Display name for the collection.
   */
  name: string;

  /**
   * Collection-scoped variables.
   */
  variables: Variable[];

  /**
   * Default headers for requests in the collection.
   */
  headers: KeyValue[];

  /**
   * Default auth settings for requests in the collection.
   */
  auth: AuthConfig;

  /**
   * Pre-request script shared by all requests in the collection.
   */
  preRequestScript: string;

  /**
   * Post-request script shared by all requests in the collection.
   */
  postRequestScript: string;

  /**
   * When the collection was created.
   */
  createdAt: Date;
}

/**
 * Firestore document shape for persisted environments.
 */
export interface FirestoreEnvironmentDocument {
  /**
   * Display name for the environment.
   */
  name: string;

  /**
   * Environment-scoped variables.
   */
  variables: Variable[];

  /**
   * When the environment was created.
   */
  createdAt: Date;
}

/**
 * Firestore document shape for persisted folders.
 */
export interface FirestoreFolderDocument {
  /**
   * Parent collection identifier.
   */
  collectionId: string;

  /**
   * Display name for the folder.
   */
  name: string;

  /**
   * Position among sibling folders.
   */
  sortOrder: number;

  /**
   * When the folder was created.
   */
  createdAt: Date;
}

/**
 * Firestore document shape for persisted saved requests.
 */
export interface FirestoreRequestDocument {
  /**
   * Parent collection identifier.
   */
  collectionId: string;

  /**
   * Optional parent folder identifier.
   */
  folderId: string | null;

  /**
   * Display name for the request.
   */
  name: string;

  /**
   * HTTP method for the request.
   */
  method: string;

  /**
   * Request URL without query parameters.
   */
  url: string;

  /**
   * Request headers.
   */
  headers: KeyValue[];

  /**
   * Query parameters.
   */
  params: KeyValue[];

  /**
   * Authorization settings.
   */
  auth: AuthConfig;

  /**
   * Request body content.
   */
  body: string;

  /**
   * Request body content type.
   */
  bodyType: string;

  /**
   * Pre-request script.
   */
  preRequestScript: string;

  /**
   * Post-request script.
   */
  postRequestScript: string;

  /**
   * Free-form notes.
   */
  comment: string;

  /**
   * Position within the collection or folder.
   */
  sortOrder: number;

  /**
   * When the request was created.
   */
  createdAt: Date;

  /**
   * When the request was last saved.
   */
  updatedAt: Date;
}
