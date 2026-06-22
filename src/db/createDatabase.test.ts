import { describe, expect, it } from 'vitest';
import { createDatabase } from '#/db/createDatabase.js';
import { FirestoreDatabase } from '#/db/FirestoreDatabase.js';
import { MysqlDatabase } from '#/db/MysqlDatabase.js';
import { PostgresDatabase } from '#/db/PostgresDatabase.js';

describe('createDatabase', () => {
  it('creates a Firestore database for the firestore driver', () => {
    const db = createDatabase({
      driver: 'firestore',
      projectId: 'my-project'
    });

    expect(db).toBeInstanceOf(FirestoreDatabase);
  });

  it('creates a MySQL database for the mysql driver', () => {
    const db = createDatabase({
      driver: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'harbor',
      password: 'harbor',
      database: 'harbor'
    });

    expect(db).toBeInstanceOf(MysqlDatabase);
  });

  it('creates a Postgres database for the postgres driver', () => {
    const db = createDatabase({
      driver: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      user: 'harbor',
      password: 'harbor',
      database: 'harbor'
    });

    expect(db).toBeInstanceOf(PostgresDatabase);
  });

  it('throws when config is not a mapping', () => {
    expect(() => createDatabase(null)).toThrow('Database config must be a mapping.');
  });

  it('throws when driver is missing', () => {
    expect(() => createDatabase({})).toThrow('Database config must include a non-empty db.driver.');
  });

  it('throws for an unsupported driver', () => {
    expect(() => createDatabase({ driver: 'sqlite' })).toThrow(
      'Unsupported database driver "sqlite". Expected "firestore", "mysql", or "postgres".'
    );
  });
});
