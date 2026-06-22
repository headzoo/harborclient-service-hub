import type {
  ApiTokenRecord,
  CollectionRecord,
  EnvironmentRecord,
  FolderRecord,
  SavedRequestRecord,
  UserRecord
} from '#/db/types.js';
import type {
  FirestoreApiTokenDocument,
  FirestoreCollectionDocument,
  FirestoreEnvironmentDocument,
  FirestoreFolderDocument,
  FirestoreRequestDocument,
  FirestoreUserDocument
} from '#/db/firestore/types.js';

/**
 * Maps a Firestore document to the shared {@link ApiTokenRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored token fields.
 * @returns Normalized token record for application code.
 */
export function mapFirestoreApiToken(id: string, data: FirestoreApiTokenDocument): ApiTokenRecord {
  if (!data.userId) {
    throw new Error(`API token ${id} is missing a userId`);
  }

  return {
    id,
    userId: data.userId,
    name: data.name,
    tokenHash: data.tokenHash,
    tokenPrefix: data.tokenPrefix,
    createdAt: data.createdAt,
    lastUsedAt: data.lastUsedAt,
    revokedAt: data.revokedAt
  };
}

/**
 * Maps a Firestore document to the shared {@link UserRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored user fields.
 * @returns Normalized user record for application code.
 */
export function mapFirestoreUser(id: string, data: FirestoreUserDocument): UserRecord {
  return {
    id,
    name: data.name,
    role: data.role,
    collectionAccess: data.collectionAccess,
    environmentAccess: data.environmentAccess,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

/**
 * Maps a Firestore document to the shared {@link CollectionRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored collection fields.
 * @returns Normalized collection record for application code.
 */
export function mapFirestoreCollection(
  id: string,
  data: FirestoreCollectionDocument
): CollectionRecord {
  return {
    id,
    name: data.name,
    variables: data.variables,
    headers: data.headers,
    auth: data.auth,
    preRequestScript: data.preRequestScript,
    postRequestScript: data.postRequestScript,
    createdAt: data.createdAt
  };
}

/**
 * Maps a Firestore document to the shared {@link EnvironmentRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored environment fields.
 * @returns Normalized environment record for application code.
 */
export function mapFirestoreEnvironment(
  id: string,
  data: FirestoreEnvironmentDocument
): EnvironmentRecord {
  return {
    id,
    name: data.name,
    variables: data.variables,
    createdAt: data.createdAt
  };
}

/**
 * Maps a Firestore document to the shared {@link FolderRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored folder fields.
 * @returns Normalized folder record for application code.
 */
export function mapFirestoreFolder(id: string, data: FirestoreFolderDocument): FolderRecord {
  return {
    id,
    collectionId: data.collectionId,
    name: data.name,
    sortOrder: data.sortOrder,
    createdAt: data.createdAt
  };
}

/**
 * Maps a Firestore document to the shared {@link SavedRequestRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored request fields.
 * @returns Normalized saved request record for application code.
 */
export function mapFirestoreRequest(
  id: string,
  data: FirestoreRequestDocument
): SavedRequestRecord {
  return {
    id,
    collectionId: data.collectionId,
    folderId: data.folderId,
    name: data.name,
    method: data.method as SavedRequestRecord['method'],
    url: data.url,
    headers: data.headers,
    params: data.params,
    auth: data.auth,
    body: data.body,
    bodyType: data.bodyType as SavedRequestRecord['bodyType'],
    preRequestScript: data.preRequestScript,
    postRequestScript: data.postRequestScript,
    comment: data.comment,
    sortOrder: data.sortOrder,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}
