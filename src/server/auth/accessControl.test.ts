import { describe, expect, it } from 'vitest';
import type { CollectionRecord, EnvironmentRecord, UserRecord } from '#/db/types.js';
import {
  canAccessCollection,
  canAccessEnvironment,
  canCreateCollection,
  canCreateEnvironment,
  canUseDataApi,
  filterAccessibleCollections,
  filterAccessibleEnvironments,
  hasWildcardAccess
} from '#/server/auth/accessControl.js';

const baseUser: UserRecord = {
  id: 'user-1',
  name: 'Alice',
  role: 'user',
  collectionAccess: ['collection-a'],
  environmentAccess: ['env-a'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z')
};

const adminUser: UserRecord = {
  ...baseUser,
  id: 'admin-1',
  name: 'Admin',
  role: 'admin',
  collectionAccess: [],
  environmentAccess: []
};

const wildcardUser: UserRecord = {
  ...baseUser,
  collectionAccess: ['*'],
  environmentAccess: ['*']
};

const sampleCollections: CollectionRecord[] = [
  {
    id: 'collection-a',
    name: 'A',
    variables: [],
    headers: [],
    auth: { type: 'none', basic: { username: '', password: '' }, bearer: { token: '' } },
    preRequestScript: '',
    postRequestScript: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  },
  {
    id: 'collection-b',
    name: 'B',
    variables: [],
    headers: [],
    auth: { type: 'none', basic: { username: '', password: '' }, bearer: { token: '' } },
    preRequestScript: '',
    postRequestScript: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  }
];

const sampleEnvironments: EnvironmentRecord[] = [
  {
    id: 'env-a',
    name: 'A',
    variables: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  },
  {
    id: 'env-b',
    name: 'B',
    variables: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  }
];

describe('accessControl', () => {
  it('detects wildcard access lists', () => {
    expect(hasWildcardAccess(['*'])).toBe(true);
    expect(hasWildcardAccess(['collection-a'])).toBe(false);
  });

  it('denies admins and scoped users correctly for collections', () => {
    expect(canAccessCollection(adminUser, 'collection-a')).toBe(false);
    expect(canAccessCollection(baseUser, 'collection-a')).toBe(true);
    expect(canAccessCollection(baseUser, 'collection-b')).toBe(false);
    expect(canAccessCollection(wildcardUser, 'collection-b')).toBe(true);
  });

  it('denies admins and scoped users correctly for environments', () => {
    expect(canAccessEnvironment(adminUser, 'env-a')).toBe(false);
    expect(canAccessEnvironment(baseUser, 'env-a')).toBe(true);
    expect(canAccessEnvironment(baseUser, 'env-b')).toBe(false);
    expect(canAccessEnvironment(wildcardUser, 'env-b')).toBe(true);
  });

  it('allows create only for wildcard users', () => {
    expect(canUseDataApi(adminUser)).toBe(false);
    expect(canUseDataApi(baseUser)).toBe(true);
    expect(canCreateCollection(adminUser)).toBe(false);
    expect(canCreateCollection(baseUser)).toBe(false);
    expect(canCreateCollection(wildcardUser)).toBe(true);
    expect(canCreateEnvironment(wildcardUser)).toBe(true);
  });

  it('filters list results by access', () => {
    expect(filterAccessibleCollections(adminUser, sampleCollections)).toEqual([]);
    expect(filterAccessibleCollections(baseUser, sampleCollections)).toEqual([
      sampleCollections[0]
    ]);
    expect(filterAccessibleCollections(wildcardUser, sampleCollections)).toEqual(sampleCollections);
    expect(filterAccessibleEnvironments(baseUser, sampleEnvironments)).toEqual([
      sampleEnvironments[0]
    ]);
  });
});
