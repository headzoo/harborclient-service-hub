import type { CollectionRecord, EnvironmentRecord, UserRecord } from '#/db/types.js';

/**
 * Returns true when the authenticated user has an admin role.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `admin`-role accounts.
 */
export function isAdmin(user: UserRecord): boolean {
  return user.role === 'admin';
}

/**
 * Returns true when the user may call entity data API routes for collections,
 * environments, folders, and requests.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True for `user`-role accounts; false for admins.
 */
export function canUseDataApi(user: UserRecord): boolean {
  return user.role === 'user';
}

/**
 * Returns true when an access list grants all resources via the wildcard entry.
 *
 * @param access - Collection or environment access ids.
 * @returns True when the list contains `*`.
 */
export function hasWildcardAccess(access: string[]): boolean {
  return access.includes('*');
}

/**
 * Returns true when the user may read or mutate a specific collection.
 *
 * @param user - Authenticated user attached to the request.
 * @param collectionId - Collection identifier being accessed.
 * @returns True when the user role and access list permit the collection.
 */
export function canAccessCollection(user: UserRecord, collectionId: string): boolean {
  if (user.role === 'admin') {
    return false;
  }

  if (hasWildcardAccess(user.collectionAccess)) {
    return true;
  }

  return user.collectionAccess.includes(collectionId);
}

/**
 * Returns true when the user may read or mutate a specific environment.
 *
 * @param user - Authenticated user attached to the request.
 * @param environmentId - Environment identifier being accessed.
 * @returns True when the user role and access list permit the environment.
 */
export function canAccessEnvironment(user: UserRecord, environmentId: string): boolean {
  if (user.role === 'admin') {
    return false;
  }

  if (hasWildcardAccess(user.environmentAccess)) {
    return true;
  }

  return user.environmentAccess.includes(environmentId);
}

/**
 * Returns true when the user may create new collections via the API.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when the user has wildcard collection access.
 */
export function canCreateCollection(user: UserRecord): boolean {
  return user.role === 'user' && hasWildcardAccess(user.collectionAccess);
}

/**
 * Returns true when the user may create new environments via the API.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when the user has wildcard environment access.
 */
export function canCreateEnvironment(user: UserRecord): boolean {
  return user.role === 'user' && hasWildcardAccess(user.environmentAccess);
}

/**
 * Filters a collection list to entries the user is allowed to see.
 *
 * @param user - Authenticated user attached to the request.
 * @param collections - Unfiltered collections from the database.
 * @returns Collections visible to the user.
 */
export function filterAccessibleCollections(
  user: UserRecord,
  collections: CollectionRecord[]
): CollectionRecord[] {
  if (user.role === 'admin') {
    return [];
  }

  if (hasWildcardAccess(user.collectionAccess)) {
    return collections;
  }

  const allowed = new Set(user.collectionAccess);
  return collections.filter((collection) => allowed.has(collection.id));
}

/**
 * Filters an environment list to entries the user is allowed to see.
 *
 * @param user - Authenticated user attached to the request.
 * @param environments - Unfiltered environments from the database.
 * @returns Environments visible to the user.
 */
export function filterAccessibleEnvironments(
  user: UserRecord,
  environments: EnvironmentRecord[]
): EnvironmentRecord[] {
  if (user.role === 'admin') {
    return [];
  }

  if (hasWildcardAccess(user.environmentAccess)) {
    return environments;
  }

  const allowed = new Set(user.environmentAccess);
  return environments.filter((environment) => allowed.has(environment.id));
}

/**
 * Returns true when the user may call hub-proxied LLM routes.
 *
 * @param user - Authenticated user attached to the request.
 * @returns True when LLM access is enabled for the account.
 */
export function canUseLlm(user: UserRecord): boolean {
  return user.llmAccess;
}

/**
 * Returns true when the user may request a specific hub-offered model.
 *
 * @param user - Authenticated user attached to the request.
 * @param modelId - Provider-specific model id.
 * @returns True when the user's model access list permits the model.
 */
export function isLlmModelAllowed(user: UserRecord, modelId: string): boolean {
  if (!user.llmAccess) {
    return false;
  }

  if (hasWildcardAccess(user.llmModels)) {
    return true;
  }

  return user.llmModels.includes(modelId);
}

/**
 * Returns true when usage has reached or exceeded the configured monthly limit.
 *
 * @param totalTokens - Tokens consumed in the current period.
 * @param limit - Configured monthly limit, or null for unlimited.
 */
export function isOverMonthlyLimit(totalTokens: number, limit: number | null): boolean {
  if (limit == null) {
    return false;
  }

  return totalTokens >= limit;
}
