import type { CollectionRecord, EnvironmentRecord, UserRecord } from '#/db/types.js';

/**
 * Returns true when the user may call collection/environment data API routes.
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
