import { Command, InvalidArgumentError } from 'commander';
import { mergeGlobalOptions } from '#/cli/globalOptions.js';
import { loadServerConfig } from '#/config/serverConfig.js';
import { createDatabase } from '#/db/index.js';
import type { CreateUserInput, UpdateUserInput, UserRole } from '#/db/types.js';
import { generateApiToken } from '#/server/auth/apiTokens.js';

export interface UserCommandOptions {
  /**
   * Path to the server YAML config file (from global `-c` / `--config`).
   */
  config: string;
}

export interface UserCreateCommandOptions extends UserCommandOptions {
  /**
   * Unique display name for the new user account.
   */
  name: string;

  /**
   * Role assigned to the new account.
   */
  role: UserRole;

  /**
   * Collection ids or `*` granting collection access.
   */
  collectionAccess: string[];

  /**
   * Environment ids or `*` granting environment access.
   */
  environmentAccess: string[];
}

export interface UserUpdateCommandOptions extends UserCommandOptions {
  /**
   * Identifier of the user to update.
   */
  id: string;

  /**
   * New display name, when changing the account label.
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

export interface UserTokenCreateCommandOptions extends UserCommandOptions {
  /**
   * Owning user identifier.
   */
  user: string;

  /**
   * Human-readable label for the new token.
   */
  name: string;
}

export interface UserTokenListCommandOptions extends UserCommandOptions {
  /**
   * Optional user identifier limiting token output.
   */
  user?: string;
}

export interface UserTokenRevokeCommandOptions extends UserCommandOptions {
  /**
   * Identifier of the token to revoke.
   */
  id: string;
}

/**
 * Formats a nullable date for CLI output.
 *
 * @param value - Date to format, or null when unset.
 * @returns ISO string or a dash placeholder.
 */
function formatOptionalDate(value: Date | null): string {
  return value ? value.toISOString() : '-';
}

/**
 * Formats an access list for CLI output.
 *
 * @param access - Collection or environment access ids.
 * @returns Comma-separated list or a dash when empty.
 */
function formatAccessList(access: string[]): string {
  return access.length > 0 ? access.join(', ') : '-';
}

/**
 * Parses and validates a user or token name from CLI input.
 *
 * @param value - Name string from a Commander option or argument.
 * @returns Trimmed non-empty name.
 * @throws {InvalidArgumentError} When the name is empty after trimming.
 */
function parseRequiredName(value: string): string {
  const name = value.trim();
  if (!name) {
    throw new InvalidArgumentError('Name must not be empty.');
  }

  return name;
}

/**
 * Parses a user role from CLI input.
 *
 * @param value - Role string from a Commander option.
 * @returns Validated user role.
 * @throws {InvalidArgumentError} When the role is not supported.
 */
function parseUserRole(value: string): UserRole {
  const role = value.trim();
  if (role === 'admin' || role === 'user') {
    return role;
  }

  throw new InvalidArgumentError('Role must be "admin" or "user".');
}

/**
 * Parses repeated access flags into a normalized access list.
 *
 * @param _value - Current flag value (unused; Commander passes prior values).
 * @param previous - Accumulated values from earlier `--flag` occurrences.
 * @returns Updated access list including the latest parsed entry.
 * @throws {InvalidArgumentError} When wildcard access is combined with ids.
 */
function parseAccessFlag(_value: string, previous: string[]): string[] {
  const entry = _value.trim();
  if (!entry) {
    throw new InvalidArgumentError('Access entries must not be empty.');
  }

  const next = [...previous, entry];
  if (next.includes('*') && next.length > 1) {
    throw new InvalidArgumentError('Wildcard access "*" must be the only entry.');
  }

  return next;
}

/**
 * Normalizes access lists for admin accounts and validates wildcard usage.
 *
 * @param role - Target user role.
 * @param collectionAccess - Parsed collection access flags.
 * @param environmentAccess - Parsed environment access flags.
 * @returns Access lists suitable for persistence.
 * @throws {InvalidArgumentError} When admins receive access flags.
 */
function normalizeAccessForRole(
  role: UserRole,
  collectionAccess: string[],
  environmentAccess: string[]
): Pick<CreateUserInput, 'collectionAccess' | 'environmentAccess'> {
  if (role === 'admin') {
    if (collectionAccess.length > 0 || environmentAccess.length > 0) {
      throw new InvalidArgumentError('Admin users cannot have collection or environment access.');
    }

    return {
      collectionAccess: [],
      environmentAccess: []
    };
  }

  return {
    collectionAccess,
    environmentAccess
  };
}

/**
 * Prints a user record for CLI listings.
 *
 * @param user - User record to display.
 */
function printUser(user: {
  id: string;
  name: string;
  role: UserRole;
  collectionAccess: string[];
  environmentAccess: string[];
  createdAt: Date;
  updatedAt: Date;
}): void {
  console.log(`- id: ${user.id}`);
  console.log(`  name: ${user.name}`);
  console.log(`  role: ${user.role}`);
  console.log(`  collection access: ${formatAccessList(user.collectionAccess)}`);
  console.log(`  environment access: ${formatAccessList(user.environmentAccess)}`);
  console.log(`  created: ${user.createdAt.toISOString()}`);
  console.log(`  updated: ${user.updatedAt.toISOString()}`);
}

/**
 * Creates a new user account.
 *
 * @param options - Parsed user create options.
 */
export async function userCreateCommand(options: UserCreateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);
  const access = normalizeAccessForRole(
    options.role,
    options.collectionAccess,
    options.environmentAccess
  );

  await db.connect();
  const user = await db.createUser({
    name: options.name,
    role: options.role,
    collectionAccess: access.collectionAccess,
    environmentAccess: access.environmentAccess
  });
  await db.disconnect();

  console.log(`Created user "${user.name}" (${user.id}) with role ${user.role}.`);
}

/**
 * Lists stored user accounts.
 *
 * @param options - Parsed user list options including config path.
 */
export async function userListCommand(options: UserCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const users = await db.listUsers();
  await db.disconnect();

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  for (const user of users) {
    printUser(user);
  }
}

/**
 * Shows a single user account by id.
 *
 * @param options - Parsed user show options including user id.
 */
export async function userShowCommand(options: UserUpdateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const user = await db.findUserById(options.id);
  await db.disconnect();

  if (!user) {
    console.log(`No user found with id ${options.id}.`);
    return;
  }

  printUser(user);
}

/**
 * Updates an existing user account.
 *
 * @param options - Parsed user update options.
 */
export async function userUpdateCommand(options: UserUpdateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const existing = await db.findUserById(options.id);
  if (!existing) {
    await db.disconnect();
    console.log(`No user found with id ${options.id}.`);
    return;
  }

  const role = options.role ?? existing.role;
  const collectionAccess =
    options.collectionAccess ?? (options.role === 'admin' ? [] : existing.collectionAccess);
  const environmentAccess =
    options.environmentAccess ?? (options.role === 'admin' ? [] : existing.environmentAccess);
  const access = normalizeAccessForRole(role, collectionAccess, environmentAccess);

  const input: UpdateUserInput = {
    name: options.name,
    role: options.role,
    collectionAccess: access.collectionAccess,
    environmentAccess: access.environmentAccess
  };

  const user = await db.updateUser(options.id, input);
  await db.disconnect();

  console.log(`Updated user "${user.name}" (${user.id}).`);
}

/**
 * Deletes a user account and revokes their tokens.
 *
 * @param options - Parsed user delete options including user id.
 */
export async function userDeleteCommand(options: UserUpdateCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const existing = await db.findUserById(options.id);
  if (!existing) {
    await db.disconnect();
    console.log(`No user found with id ${options.id}.`);
    return;
  }

  await db.deleteUser(options.id);
  await db.disconnect();

  console.log(`Deleted user "${existing.name}" (${existing.id}).`);
}

/**
 * Creates a new API token for a user-role account.
 *
 * @param options - Parsed token create options.
 */
export async function userTokenCreateCommand(
  options: UserTokenCreateCommandOptions
): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const user = await db.findUserById(options.user);
  if (!user) {
    await db.disconnect();
    throw new Error(`No user found with id ${options.user}.`);
  }

  if (user.role === 'admin') {
    await db.disconnect();
    throw new Error('Admin users cannot have API tokens.');
  }

  const { record, secret } = generateApiToken(user.id, options.name);
  await db.createApiToken(record);
  await db.disconnect();

  console.log(`Created API token "${record.name}" (${record.id}) for user "${user.name}".`);
  console.log(`Token prefix: ${record.tokenPrefix}`);
  console.log('');
  console.log('Store this token now; it will not be shown again:');
  console.log(secret);
}

/**
 * Lists stored API tokens, optionally filtered by user.
 *
 * @param options - Parsed token list options.
 */
export async function userTokenListCommand(options: UserTokenListCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const tokens = options.user
    ? await db.listApiTokensByUserId(options.user)
    : await db.listApiTokens();
  await db.disconnect();

  if (tokens.length === 0) {
    console.log('No API tokens found.');
    return;
  }

  for (const token of tokens) {
    console.log(`- id: ${token.id}`);
    console.log(`  user id: ${token.userId}`);
    console.log(`  name: ${token.name}`);
    console.log(`  prefix: ${token.tokenPrefix}`);
    console.log(`  created: ${formatOptionalDate(token.createdAt)}`);
    console.log(`  last used: ${formatOptionalDate(token.lastUsedAt)}`);
    console.log(`  revoked: ${formatOptionalDate(token.revokedAt)}`);
  }
}

/**
 * Soft-revokes an API token by id.
 *
 * @param options - Parsed token revoke options including token id.
 */
export async function userTokenRevokeCommand(
  options: UserTokenRevokeCommandOptions
): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);

  await db.connect();
  const revoked = await db.revokeApiToken(options.id);
  await db.disconnect();

  if (revoked) {
    console.log(`Revoked API token ${options.id}.`);
    return;
  }

  console.log(`No active API token found with id ${options.id}.`);
}

/**
 * Registers the `user` command group on a Commander program.
 *
 * @param program - Root or parent Commander instance.
 * @param handlers - Injectable handlers for testing.
 */
export function registerUserCommand(
  program: Command,
  handlers: {
    create?: (options: UserCreateCommandOptions) => Promise<void>;
    list?: (options: UserCommandOptions) => Promise<void>;
    show?: (options: UserUpdateCommandOptions) => Promise<void>;
    update?: (options: UserUpdateCommandOptions) => Promise<void>;
    delete?: (options: UserUpdateCommandOptions) => Promise<void>;
    tokenCreate?: (options: UserTokenCreateCommandOptions) => Promise<void>;
    tokenList?: (options: UserTokenListCommandOptions) => Promise<void>;
    tokenRevoke?: (options: UserTokenRevokeCommandOptions) => Promise<void>;
  } = {}
): void {
  const user = program.command('user').description('Manage user accounts and their API tokens');

  user
    .command('create')
    .description('Create a new user account')
    .requiredOption('--name <name>', 'Unique display name', parseRequiredName)
    .requiredOption('--role <role>', 'Account role (admin or user)', parseUserRole)
    .option(
      '--collection-access <id>',
      'Collection id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--environment-access <id>',
      'Environment id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .action(
      /**
       * Runs the user create subcommand after merging global CLI options.
       */
      async function userCreateAction(this: Command, options: UserCreateCommandOptions) {
        await (handlers.create ?? userCreateCommand)(mergeGlobalOptions(this, options));
      }
    );

  user
    .command('list')
    .description('List stored user accounts')
    .action(
      /**
       * Runs the user list subcommand after merging global CLI options.
       */
      async function userListAction(this: Command, options: UserCommandOptions) {
        await (handlers.list ?? userListCommand)(mergeGlobalOptions(this, options));
      }
    );

  user
    .command('show')
    .description('Show a user account by id')
    .argument('<id>', 'User identifier')
    .action(
      /**
       * Runs the user show subcommand after merging global CLI options.
       */
      async function userShowAction(this: Command, id: string, options: UserCommandOptions) {
        await (handlers.show ?? userShowCommand)(mergeGlobalOptions(this, { ...options, id }));
      }
    );

  user
    .command('update')
    .description('Update a user account')
    .argument('<id>', 'User identifier')
    .option('--name <name>', 'New display name', parseRequiredName)
    .option('--role <role>', 'New role (admin or user)', parseUserRole)
    .option(
      '--collection-access <id>',
      'Replacement collection id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .option(
      '--environment-access <id>',
      'Replacement environment id or * (repeatable)',
      parseAccessFlag,
      [] as string[]
    )
    .action(
      /**
       * Runs the user update subcommand after merging global CLI options.
       */
      async function userUpdateAction(
        this: Command,
        id: string,
        options: UserUpdateCommandOptions
      ) {
        const merged = mergeGlobalOptions(this, { ...options, id });
        const input: UserUpdateCommandOptions = {
          ...merged,
          collectionAccess:
            (options.collectionAccess ?? []).length > 0 ? options.collectionAccess : undefined,
          environmentAccess:
            (options.environmentAccess ?? []).length > 0 ? options.environmentAccess : undefined
        };
        await (handlers.update ?? userUpdateCommand)(input);
      }
    );

  user
    .command('delete')
    .description('Delete a user account and revoke their tokens')
    .argument('<id>', 'User identifier')
    .action(
      /**
       * Runs the user delete subcommand after merging global CLI options.
       */
      async function userDeleteAction(this: Command, id: string, options: UserCommandOptions) {
        await (handlers.delete ?? userDeleteCommand)(mergeGlobalOptions(this, { ...options, id }));
      }
    );

  const token = user.command('token').description('Manage API bearer tokens for user accounts');

  token
    .command('create')
    .description('Create a new API bearer token for a user')
    .requiredOption('--user <userId>', 'Owning user identifier')
    .requiredOption('--name <name>', 'Human-readable token label', parseRequiredName)
    .action(
      /**
       * Runs the user token create subcommand after merging global CLI options.
       */
      async function userTokenCreateAction(this: Command, options: UserTokenCreateCommandOptions) {
        await (handlers.tokenCreate ?? userTokenCreateCommand)(mergeGlobalOptions(this, options));
      }
    );

  token
    .command('list')
    .description('List stored API bearer tokens')
    .option('--user <userId>', 'Limit output to a single user')
    .action(
      /**
       * Runs the user token list subcommand after merging global CLI options.
       */
      async function userTokenListAction(this: Command, options: UserTokenListCommandOptions) {
        await (handlers.tokenList ?? userTokenListCommand)(mergeGlobalOptions(this, options));
      }
    );

  token
    .command('revoke')
    .description('Revoke an API bearer token by id')
    .argument('<id>', 'Token identifier to revoke')
    .action(
      /**
       * Runs the user token revoke subcommand after merging global CLI options.
       */
      async function userTokenRevokeAction(this: Command, id: string, options: UserCommandOptions) {
        await (handlers.tokenRevoke ?? userTokenRevokeCommand)(
          mergeGlobalOptions(this, { ...options, id })
        );
      }
    );
}
