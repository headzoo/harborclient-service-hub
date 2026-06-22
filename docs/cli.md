# CLI

Team Hub ships a single command-line program, `team-hub`, for starting the server, applying database migrations, and administering users and collections.

During development, run the CLI without building:

```bash
pnpm dev -- --help
pnpm dev -- start
```

See [Development](./development.md) for more. After [Build](./build.md), invoke the bundled binary from `dist/cli.js` or via `pnpm start`.

Most subcommands read database settings from `server.yaml` in the current working directory. Override the path with `-c` / `--config`. See [Setup](./setup.md) for initial configuration and [Authentication](./auth.md) for roles, access lists, and token semantics.

## Global options

These flags apply to every subcommand:

| Option | Description |
| ------ | ----------- |
| `-V, --version` | Print the package version and exit |
| `-v, --verbose` | Enable verbose logging (used by `start`) |
| `-c, --config <path>` | Path to the server config file (default: `server.yaml`) |
| `-h, --help` | Show help for the root program or a subcommand |

Place global flags before the subcommand:

```bash
team-hub --config /etc/team-hub/server.yaml migrate
team-hub -v start
```

## Commands overview

| Command | Description |
| ------- | ----------- |
| `start` | Start the HTTP server |
| `migrate` | Apply database schema migrations |
| `collection list` | List stored collections |
| `llm list` | List all per-request LLM usage log entries |
| `user create` | Create a user account |
| `user list` | List user accounts |
| `user show <id>` | Show one user account |
| `user update <id>` | Update a user account |
| `user delete <id>` | Delete a user account and revoke their tokens |
| `user token create` | Create an API bearer token for a user |
| `user token list` | List API bearer tokens |
| `user token revoke <id>` | Revoke an API bearer token |

## start

Start the Team Hub HTTP server using the configured host, port, database, and Redis settings.

```bash
team-hub start
team-hub -v start
team-hub -c server.yaml start
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| _(none)_ | — | Uses global options only |

The server listens on the address configured in `server.yaml` (see [Setup](./setup.md)).

## migrate

Apply database schema migrations for the configured backend (Postgres, MySQL, or Firestore).

```bash
team-hub migrate
team-hub -c /path/to/server.yaml migrate
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| _(none)_ | — | Uses global options only |

Run this before `start` or any command that reads from the database. See [Authentication — Prerequisites](./auth.md#prerequisites) for what migrations create.

On success, prints:

```text
Database migration completed successfully.
```

## collection list

List all collections stored in the database.

```bash
team-hub collection list
team-hub collection list -c server.yaml
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| _(none)_ | — | Uses global options only |

Example output:

```text
- id: 550e8400-e29b-41d4-a716-446655440000
  name: Shared API
  requests: 3
  created: 2026-01-01T00:00:00.000Z
  updated: 2026-01-02T12:00:00.000Z
  created by: Alice (user-id)
  updated by: Alice (user-id)
```

Each entry includes the collection id, display name, number of saved requests, timestamps, and attribution (`created by` / `updated by` as `Name (user-id)`, `-` when unset, or the raw id when the user no longer exists).

When no collections exist:

```text
No collections found.
```

## llm list

List all per-request LLM usage log entries stored in `llm_usage_log`, newest first.

```bash
team-hub llm list
team-hub llm list -c server.yaml
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| _(none)_ | — | Uses global options only |

Example output:

```text
- id: 550e8400-e29b-41d4-a716-446655440000
  user: Alice (user-id)
  api token: Alice laptop (token-id)
  period: 2026-06
  model: gpt-4o
  provider: openai
  prompt tokens: 10
  completion tokens: 20
  total tokens: 30
  new turn: yes
  tool calls: no
  messages: 1
  created: 2026-06-01T12:00:00.000Z
```

When no usage has been recorded:

```text
No LLM usage records found.
```

See [LLM Proxy — Usage logging](./llm.md#usage-logging) for how records are created.

## user

Manage user accounts. User accounts have a role of `user` or `admin` and, for `user` accounts, collection and environment access lists. See [Authentication — Roles and access](./auth.md#roles-and-access) for the full permission model.

### user create

Create a new user account. The command also creates an initial API bearer token and prints the one-time `hbk_…` secret.

```bash
team-hub user create --name alice --role user \
  --collection-access '*' --environment-access '*'

team-hub user create --name ops --role admin
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `--name <name>` | Yes | Unique display name |
| `--role <role>` | Yes | `admin` or `user` |
| `--collection-access <id>` | No | Collection id or `*`; repeatable |
| `--environment-access <id>` | No | Environment id or `*`; repeatable |

**Access list rules**

- Only `user`-role accounts use access lists. Passing `--collection-access` or `--environment-access` for an `admin` account is rejected.
- Use `*` to grant all resources of that type. The wildcard must be the only entry — the CLI rejects combinations like `*` plus a specific id.
- Repeat the flag to add multiple ids: `--collection-access <id1> --collection-access <id2>`.

On success, prints the created user, then the new token secret (store it immediately):

```text
Created user "alice" (<user-id>) with role user.
- id: <user-id>
  name: alice
  role: user
  collection access: *
  environment access: *
  created: 2026-01-01T00:00:00.000Z
  updated: 2026-01-01T00:00:00.000Z

Created API token "alice" (<token-id>) for user "alice".
Token prefix: hbk_AbCd1234

Store this token now; it will not be shown again:
hbk_...
```

### user list

List all user accounts.

```bash
team-hub user list
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| _(none)_ | — | Uses global options only |

Prints each user with id, name, role, access lists, LLM settings, current-month token usage (`llm tokens used (YYYY-MM)`), and timestamps. When no users exist, prints `No users found.`

### user show

Show a single user account by id.

```bash
team-hub user show <user-id>
```

| Argument / option | Required | Description |
| ----------------- | -------- | ----------- |
| `<id>` | Yes | User identifier |

Prints the same fields as `user list` for one account, including current-month LLM token usage (`llm tokens used (YYYY-MM)`). When the id is not found, prints `No user found with id <user-id>.`

### user update

Update an existing user account.

```bash
team-hub user update <user-id> --name "Alice Smith"
team-hub user update <user-id> --role user --collection-access '*'
```

| Argument / option | Required | Description |
| ----------------- | -------- | ----------- |
| `<id>` | Yes | User identifier |
| `--name <name>` | No | New display name |
| `--role <role>` | No | New role (`admin` or `user`) |
| `--collection-access <id>` | No | Replacement collection access list; repeatable |
| `--environment-access <id>` | No | Replacement environment access list; repeatable |

Omitted access flags keep the existing lists (unless changing role to `admin`, which clears them). Passing access flags replaces the entire list for that field. Same wildcard and admin-role rules as `user create` apply.

On success, prints `Updated user "<name>" (<user-id>).`

### user delete

Delete a user account and revoke all of their API tokens.

```bash
team-hub user delete <user-id>
```

| Argument / option | Required | Description |
| ----------------- | -------- | ----------- |
| `<id>` | Yes | User identifier |

On success, prints `Deleted user "<name>" (<user-id>).` When the id is not found, prints `No user found with id <user-id>.`

## user token

Manage API bearer tokens. Tokens belong to a user and inherit that user's access scope. See [Authentication — Token inheritance](./auth.md#access).

### user token create

Create a new API bearer token for an existing user.

```bash
team-hub user token create --user <user-id> --name "Alice laptop"
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `--user <userId>` | Yes | Owning user identifier |
| `--name <name>` | Yes | Human-readable token label |

Prints the one-time secret prefixed with `hbk_`. Store it immediately — the server only persists a sha256 hash.

Example output:

```text
Created API token "Alice laptop" (<token-id>) for user "alice".
Token prefix: hbk_AbCd1234

Store this token now; it will not be shown again:
hbk_...
```

### user token list

List stored API bearer tokens.

```bash
team-hub user token list
team-hub user token list --user <user-id>
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `--user <userId>` | No | Limit output to tokens owned by one user |

Each token entry includes id, owning user id, name, prefix, created time, last used time, and revoked time (`-` when unset). When no tokens match, prints `No API tokens found.`

### user token revoke

Revoke an API bearer token by id.

```bash
team-hub user token revoke <token-id>
```

| Argument / option | Required | Description |
| ----------------- | -------- | ----------- |
| `<id>` | Yes | Token identifier |

On success, prints `Revoked API token <token-id>.` When the token is not found or already revoked, prints `No active API token found with id <token-id>.`

## Examples

Typical workflow after [Setup](./setup.md):

```bash
# Apply schema
team-hub migrate

# Start the server
team-hub start

# Inspect collections (ids useful for access lists)
team-hub collection list

# Create users
team-hub user create --name ops --role admin
team-hub user create --name alice --role user \
  --collection-access '*' --environment-access '*'

# Manage tokens
team-hub user token list
team-hub user token create --user <user-id> --name "Alice laptop"
team-hub user token revoke <token-id>
```
