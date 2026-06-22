# Authentication

HarborClient Server protects API routes with database-backed bearer tokens tied to user accounts. Operators manage users and tokens via the CLI; HarborClient desktop clients authenticate with tokens issued to `user`-role accounts.

## Prerequisites

Configure your database in `server.yaml`, then apply schema migrations:

```bash
harborclient-server migrate
```

For Postgres and MySQL this creates the `users` and `api_tokens` tables (plus entity tables). Firestore uses schemaless `users` and `apiTokens` collections.

Migration also assigns any legacy tokens without an owner to a bootstrap user named `bootstrap` with full (`*`) collection and environment access. Create named users, issue new tokens, then revoke bootstrap tokens when you are ready.

## Roles and access

| Role | API access | Purpose |
| ---- | ---------- | ------- |
| `user` | Scoped by access lists; `*` means all | HarborClient desktop clients |
| `admin` | None (403 on all entity routes) | User management via CLI only |

Each `user`-role account has:

- `collectionAccess` — collection UUIDs, or `['*']` for all collections (including folders and requests)
- `environmentAccess` — environment UUIDs, or `['*']` for all environments

Admin accounts store empty access lists. Only `user`-role accounts may have API tokens.

## Manage users

```bash
# Create an admin (CLI-only account)
harborclient-server user create --name ops --role admin

# Create a user with full access
harborclient-server user create --name alice --role user \
  --collection-access '*' --environment-access '*'

# Create a user with access to specific collections/environments
harborclient-server user create --name bob --role user \
  --collection-access <collection-id> --environment-access <environment-id>

harborclient-server user list
harborclient-server user show <user-id>
harborclient-server user update <user-id> --role user --collection-access '*'
harborclient-server user delete <user-id>
```

## Manage tokens

Tokens always belong to a user. Admin users cannot receive tokens.

```bash
harborclient-server user token create --user <user-id> --name "Alice laptop"
harborclient-server user token list
harborclient-server user token list --user <user-id>
harborclient-server user token revoke <token-id>
```

The `user token create` command prints a one-time secret prefixed with `hbk_`. Store it immediately — the server only persists a sha256 hash.

Example output:

```text
Created API token "Alice laptop" (550e8400-e29b-41d4-a716-446655440000) for user "alice".
Token prefix: hbk_AbCd1234

Store this token now; it will not be shown again:
hbk_...
```

## Using tokens from HarborClient

In HarborClient, configure request or collection authorization as **Bearer Token** and paste the secret from `user token create`.

The server validates:

```http
Authorization: Bearer hbk_...
```

Protected routes return `401 Unauthorized` with `WWW-Authenticate: Bearer` when the header is missing, malformed, or the token is unknown or revoked.

Authenticated admin tokens receive `403 Forbidden` on all collection, environment, folder, and request routes.

`GET /health` remains public for load balancers and connectivity checks.

See [API Endpoints](./endpoints.md) for the full route reference.
