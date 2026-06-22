/**
 * Server account role controlling API and CLI capabilities.
 */
export type UserRole = 'admin' | 'user';

/**
 * Stored metadata for a HarborClient server user account.
 */
export interface UserRecord {
  /**
   * Stable identifier used for token ownership and CLI operations.
   */
  id: string;

  /**
   * Unique display name chosen when the user was created.
   */
  name: string;

  /**
   * Role determining whether the account may access shared data via the API.
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
 * Fields required to create a new user account.
 */
export interface CreateUserInput {
  /**
   * Unique display name for the new account.
   */
  name: string;

  /**
   * Role assigned to the new account.
   */
  role: UserRole;

  /**
   * Collection access list; admins store an empty array.
   */
  collectionAccess: string[];

  /**
   * Environment access list; admins store an empty array.
   */
  environmentAccess: string[];
}

/**
 * Partial fields accepted when updating an existing user account.
 */
export interface UpdateUserInput {
  /**
   * New unique display name, when changing the account label.
   */
  name?: string;

  /**
   * New role, when changing account capabilities.
   */
  role?: UserRole;

  /**
   * Replacement collection access list.
   */
  collectionAccess?: string[];

  /**
   * Replacement environment access list.
   */
  environmentAccess?: string[];
}

/**
 * Stored metadata for a database-backed API bearer token.
 *
 * The raw secret is never persisted; only its sha256 hash is stored for lookup.
 */
export interface ApiTokenRecord {
  /**
   * Stable identifier used for revoke and audit operations.
   */
  id: string;

  /**
   * Owning user account that receives the token's access permissions.
   */
  userId: string;

  /**
   * Human-readable label chosen when the token was created.
   */
  name: string;

  /**
   * sha256 hex digest of the bearer token secret.
   */
  tokenHash: string;

  /**
   * Non-secret prefix shown in listings (for example `hbk_AbCd1234`).
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
 * Supported HTTP request methods.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Request body content type.
 */
export type BodyType = 'none' | 'json' | 'text' | 'multipart' | 'urlencoded';

/**
 * Authorization type for saved requests and collections.
 */
export type AuthType = 'none' | 'basic' | 'bearer';

/**
 * Basic and bearer credential fields stored together so switching type preserves values.
 */
export interface AuthConfig {
  /**
   * Selected auth mode; none means no request-level override.
   */
  type: AuthType;

  /**
   * Username and password for Basic Auth.
   */
  basic: {
    username: string;
    password: string;
  };

  /**
   * Token value for Bearer Token auth.
   */
  bearer: {
    token: string;
  };
}

/**
 * A key-value pair with an enable toggle for headers and query params.
 */
export interface KeyValue {
  /**
   * Header or query parameter name.
   */
  key: string;

  /**
   * Header or query parameter value.
   */
  value: string;

  /**
   * When false, the pair is ignored when building the request.
   */
  enabled: boolean;
}

/**
 * A collection-scoped or environment-scoped variable for {{key}} substitution.
 */
export interface Variable {
  /**
   * Variable name referenced in {{key}} placeholders.
   */
  key: string;

  /**
   * Value substituted when the variable is resolved.
   */
  value: string;

  /**
   * Fallback value used when value is empty.
   */
  defaultValue: string;

  /**
   * When true, value is included in collection exports.
   */
  share: boolean;
}

/**
 * Persisted collection metadata and defaults shared by all requests in the collection.
 */
export interface CollectionRecord {
  /**
   * Stable collection identifier.
   */
  id: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * Collection-scoped variables for {{key}} substitution in requests.
   */
  variables: Variable[];

  /**
   * Headers sent with every request in this collection.
   */
  headers: KeyValue[];

  /**
   * Default Authorization settings inherited by requests unless overridden.
   */
  auth: AuthConfig;

  /**
   * JavaScript run before every request in this collection.
   */
  preRequestScript: string;

  /**
   * JavaScript run after every request in this collection.
   */
  postRequestScript: string;

  /**
   * When the collection was created.
   */
  createdAt: Date;
}

/**
 * Persisted environment with scoped variables.
 */
export interface EnvironmentRecord {
  /**
   * Stable environment identifier.
   */
  id: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * Environment-scoped variables for {{key}} substitution in requests.
   */
  variables: Variable[];

  /**
   * When the environment was created.
   */
  createdAt: Date;
}

/**
 * A folder for organizing requests within a collection.
 */
export interface FolderRecord {
  /**
   * Stable folder identifier.
   */
  id: string;

  /**
   * ID of the collection this folder belongs to.
   */
  collectionId: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * Position among sibling folders for sidebar ordering.
   */
  sortOrder: number;

  /**
   * When the folder was created.
   */
  createdAt: Date;
}

/**
 * A saved HTTP request belonging to a collection.
 */
export interface SavedRequestRecord {
  /**
   * Stable request identifier.
   */
  id: string;

  /**
   * ID of the collection this request belongs to.
   */
  collectionId: string;

  /**
   * Display name shown in the sidebar.
   */
  name: string;

  /**
   * HTTP method used for the request.
   */
  method: HttpMethod;

  /**
   * Request URL without query parameters.
   */
  url: string;

  /**
   * Request headers as editable key-value pairs.
   */
  headers: KeyValue[];

  /**
   * Query parameters as editable key-value pairs.
   */
  params: KeyValue[];

  /**
   * Authorization settings; none inherits collection auth at send time.
   */
  auth: AuthConfig;

  /**
   * Raw request body content.
   */
  body: string;

  /**
   * Content type of the request body.
   */
  bodyType: BodyType;

  /**
   * JavaScript run before the request is sent.
   */
  preRequestScript: string;

  /**
   * JavaScript run after the response is received.
   */
  postRequestScript: string;

  /**
   * Free-form notes for this request.
   */
  comment: string;

  /**
   * ID of the folder containing this request, or null when at collection root.
   */
  folderId: string | null;

  /**
   * Position within the collection for sidebar ordering.
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

/**
 * Input for creating or updating a saved request.
 */
export interface SaveRequestInput {
  /**
   * Existing request ID; omit to insert a new request.
   */
  id?: string;

  /**
   * ID of the collection to save the request in.
   */
  collectionId: string;

  /**
   * Display name for the saved request.
   */
  name: string;

  /**
   * HTTP method used for the request.
   */
  method: HttpMethod;

  /**
   * Request URL without query parameters.
   */
  url: string;

  /**
   * Request headers as editable key-value pairs.
   */
  headers: KeyValue[];

  /**
   * Query parameters as editable key-value pairs.
   */
  params: KeyValue[];

  /**
   * Authorization settings; none inherits collection auth at send time.
   */
  auth: AuthConfig;

  /**
   * Raw request body content.
   */
  body: string;

  /**
   * Content type of the request body.
   */
  bodyType: BodyType;

  /**
   * JavaScript run before the request is sent.
   */
  preRequestScript: string;

  /**
   * JavaScript run after the response is received.
   */
  postRequestScript: string;

  /**
   * Free-form notes for this request.
   */
  comment: string;

  /**
   * ID of the folder containing this request, or null when at collection root.
   */
  folderId?: string | null;
}

/**
 * Returns a default auth config with type none and empty credentials.
 *
 * @returns Empty AuthConfig safe for new requests and collections.
 */
export function defaultAuth(): AuthConfig {
  return {
    type: 'none',
    basic: { username: '', password: '' },
    bearer: { token: '' }
  };
}

/**
 * JSON string of {@link defaultAuth} for database column defaults.
 */
export const DEFAULT_AUTH_JSON = JSON.stringify(defaultAuth());

/**
 * Normalizes a partial or legacy auth value from storage into a full AuthConfig.
 *
 * @param value - Parsed JSON or unknown field from the database.
 * @returns Valid AuthConfig with defaults for missing fields.
 */
export function normalizeAuth(value: unknown): AuthConfig {
  const fallback = defaultAuth();
  if (value == null || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const type =
    record.type === 'basic' || record.type === 'bearer' || record.type === 'none'
      ? record.type
      : fallback.type;

  const basicRecord =
    record.basic != null && typeof record.basic === 'object'
      ? (record.basic as Record<string, unknown>)
      : {};
  const bearerRecord =
    record.bearer != null && typeof record.bearer === 'object'
      ? (record.bearer as Record<string, unknown>)
      : {};

  return {
    type,
    basic: {
      username: typeof basicRecord.username === 'string' ? basicRecord.username : '',
      password: typeof basicRecord.password === 'string' ? basicRecord.password : ''
    },
    bearer: {
      token: typeof bearerRecord.token === 'string' ? bearerRecord.token : ''
    }
  };
}

/**
 * Normalizes a variable row from storage.
 *
 * @param value - Partial variable from JSON.
 * @returns Variable with defaults for missing fields.
 */
export function normalizeVariable(value: Partial<Variable>): Variable {
  return {
    key: typeof value.key === 'string' ? value.key : '',
    value: typeof value.value === 'string' ? value.value : '',
    defaultValue: typeof value.defaultValue === 'string' ? value.defaultValue : '',
    share: typeof value.share === 'boolean' ? value.share : false
  };
}
