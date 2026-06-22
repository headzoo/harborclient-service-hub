import { describe, expect, it } from 'vitest';
import type { CollectionRecord, EnvironmentRecord, UserRecord } from '#/db/types.js';
import {
  canAccessCollection,
  canAccessEnvironment,
  canCreateCollection,
  canCreateEnvironment,
  canUseDataApi,
  isAdmin,
  canUseLlm,
  isLlmModelAllowed,
  isOverMonthlyLimit,
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
  llmAccess: false,
  llmModels: [],
  llmMonthlyTokenLimit: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdByUserId: null,
  updatedByUserId: null
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null
  },
  {
    id: 'collection-b',
    name: 'B',
    variables: [],
    headers: [],
    auth: { type: 'none', basic: { username: '', password: '' }, bearer: { token: '' } },
    preRequestScript: '',
    postRequestScript: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null
  }
];

const sampleEnvironments: EnvironmentRecord[] = [
  {
    id: 'env-a',
    name: 'A',
    variables: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null
  },
  {
    id: 'env-b',
    name: 'B',
    variables: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: null,
    updatedByUserId: null
  }
];

describe('accessControl', () => {
  it('detects wildcard access lists', () => {
    expect(hasWildcardAccess(['*'])).toBe(true);
    expect(hasWildcardAccess(['collection-a'])).toBe(false);
  });

  it('identifies admin accounts', () => {
    expect(isAdmin(adminUser)).toBe(true);
    expect(isAdmin(baseUser)).toBe(false);
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

  it('evaluates LLM access and model permissions', () => {
    const llmUser: UserRecord = {
      ...baseUser,
      llmAccess: true,
      llmModels: ['gpt-4o']
    };

    expect(canUseLlm(baseUser)).toBe(false);
    expect(canUseLlm(llmUser)).toBe(true);
    expect(isLlmModelAllowed(llmUser, 'gpt-4o')).toBe(true);
    expect(isLlmModelAllowed(llmUser, 'gpt-4o-mini')).toBe(false);
    expect(isLlmModelAllowed({ ...llmUser, llmModels: ['*'] }, 'gpt-4o-mini')).toBe(true);
  });

  it('detects monthly token limit exhaustion', () => {
    expect(isOverMonthlyLimit(999, 1000)).toBe(false);
    expect(isOverMonthlyLimit(1000, 1000)).toBe(true);
    expect(isOverMonthlyLimit(1000, null)).toBe(false);
  });
});
