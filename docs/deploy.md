# Deploy

Team Hub ships as an all-in-one Docker image: **Nginx** (public entrypoint), the **Team Hub API**, **Postgres** (default database), and **Redis** (authentication throttling). The image listens on `$PORT` (default `8080`) so it works on platforms such as **GCP Cloud Run** that inject a port at runtime.

For local development without the full image, you can still run Postgres and Redis via [`docker compose up -d`](../docker-compose.yml) and start Team Hub on the host — see [Setup](./setup.md).

## What is in the container

| Process | Default bind | Purpose |
| ------- | ------------ | ------- |
| Nginx | `$PORT` (`8080`) | Reverse proxy to Team Hub |
| Team Hub | `127.0.0.1:8787` | Fastify API |
| Postgres | `127.0.0.1:5432` | Database (bundled by default) |
| Redis | `127.0.0.1:6379` | Auth throttling store |

On startup the entrypoint:

1. Initializes bundled Postgres on first boot (creates the `harbor` user and database).
2. Renders `/etc/team-hub/server.yaml` from environment variables.
3. Runs `team-hub migrate`, then `team-hub start`.
4. Starts Nginx on `$PORT`.

Health checks should use `GET /health` (proxied through Nginx).

### Bundled vs managed services

The default image starts Postgres and Redis inside the container. That is convenient for demos, smoke tests, and self-hosted Docker.

**Cloud Run storage is ephemeral.** Bundled Postgres data is lost when the revision is redeployed or the instance is recycled. For production on Cloud Run, disable bundled services and use **Cloud SQL** (Postgres) and **Memorystore** (Redis) instead. See [Production on Cloud Run](#production-on-cloud-run) below.

## Prerequisites

- Docker installed locally
- A GCP project with billing enabled (for Cloud Run)
- [`gcloud`](https://cloud.google.com/sdk/docs/install) CLI authenticated to your project
- An Artifact Registry repository (or legacy Container Registry)

Enable required APIs:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

Create an Artifact Registry repo (once per project/region):

```bash
gcloud artifacts repositories create team-hub \
  --repository-format=docker \
  --location=REGION
```

## Build and push the image

From the repository root:

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/team-hub/team-hub:latest"

docker build -t "${IMAGE}" .
docker push "${IMAGE}"
```

Configure Docker to authenticate with Artifact Registry if needed:

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
```

## Local smoke test

Run the image locally before pushing:

```bash
docker build -t team-hub:local .

docker run --rm -p 8080:8080 \
  -e TEAM_HUB_DB_PASSWORD=harbor \
  team-hub:local
```

In another terminal:

```bash
curl -s http://127.0.0.1:8080/health
```

Expect JSON like `{"status":"ok","version":"..."}`.

Note: each fresh container gets a new Postgres data directory unless you mount a volume:

```bash
docker run --rm -p 8080:8080 \
  -v team-hub-pgdata:/var/lib/postgresql/data \
  team-hub:local
```

After the container is running, use the CLI to create an admin user — see [Using the CLI in the container](#using-the-cli-in-the-container).

## Quick start on Cloud Run (evaluation)

Deploy with bundled Postgres and Redis for a quick trial. **Do not rely on this for production data** — use managed services instead.

```bash
gcloud run deploy team-hub \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --allow-unauthenticated
```

- `--min-instances 1` keeps one warm instance so bundled Postgres is less likely to restart mid-session. Data is still not durable across redeploys.
- Omit `--allow-unauthenticated` if the service should require authentication at the Cloud Run / IAP layer.

After deploy, open the service URL and verify health:

```bash
curl -s "$(gcloud run services describe team-hub --region "${REGION}" --format='value(status.url)')/health"
```

## Production on Cloud Run

For production, point Team Hub at managed Postgres and Redis and disable the bundled processes.

### Environment variables

| Variable | Production value | Notes |
| -------- | ---------------- | ----- |
| `TEAM_HUB_START_POSTGRES` | `false` | Use Cloud SQL |
| `TEAM_HUB_START_REDIS` | `false` | Use Memorystore |
| `TEAM_HUB_DB_HOST` | Cloud SQL host or socket path | See Cloud SQL section |
| `TEAM_HUB_DB_PORT` | `5432` | |
| `TEAM_HUB_DB_USER` | your DB user | |
| `TEAM_HUB_DB_PASSWORD` | from Secret Manager | |
| `TEAM_HUB_DB_DATABASE` | your database name | |
| `TEAM_HUB_REDIS_HOST` | Memorystore IP | Requires VPC connector |
| `TEAM_HUB_REDIS_PORT` | `6379` | |

Store secrets in [Secret Manager](https://cloud.google.com/secret-manager) and mount them on the Cloud Run service rather than passing passwords on the command line.

Example deploy with external services (adjust hostnames and secret references):

```bash
gcloud run deploy team-hub \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --set-env-vars "TEAM_HUB_START_POSTGRES=false,TEAM_HUB_START_REDIS=false,TEAM_HUB_DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE,TEAM_HUB_DB_USER=teamhub,TEAM_HUB_DB_DATABASE=teamhub,TEAM_HUB_REDIS_HOST=10.0.0.5" \
  --set-secrets "TEAM_HUB_DB_PASSWORD=teamhub-db-password:latest" \
  --add-cloudsql-instances "PROJECT:REGION:INSTANCE" \
  --vpc-connector "projects/PROJECT/locations/REGION/connectors/CONNECTOR"
```

### Cloud SQL (Postgres)

1. Create a Cloud SQL Postgres instance.
2. Create a database and user for Team Hub.
3. Attach the instance to Cloud Run with `--add-cloudsql-instances`.
4. Set `TEAM_HUB_DB_HOST` to the Unix socket path `/cloudsql/PROJECT:REGION:INSTANCE` (Cloud Run mounts this automatically when the instance is attached).

Run migrations before serving traffic. Options:

- Deploy once with a [Cloud Run Job](https://cloud.google.com/run/docs/create-jobs) that runs `node dist/cli.js -c /etc/team-hub/server.yaml migrate` with the same env and Cloud SQL attachment.
- Run migrate from a one-off `docker run` on a machine that can reach the database.

### Memorystore (Redis)

Team Hub requires Redis for [authentication throttling](./auth.md). Protected routes return **503** when Redis is unreachable.

1. Create a Memorystore for Redis instance in the same VPC region.
2. Configure a [Serverless VPC Access connector](https://cloud.google.com/vpc/docs/configure-serverless-vpc-access).
3. Attach the connector to the Cloud Run service and set `TEAM_HUB_REDIS_HOST` to the instance IP.

### Firestore (alternative database)

To use Firestore instead of Postgres, set `TEAM_HUB_DB_DRIVER=firestore` and mount a service account key (or use workload identity). You still need Redis. See `server.yaml.example` at the repository root for the Firestore config shape; map fields to env vars or mount a custom `server.yaml` at `/etc/team-hub/server.yaml` via a volume (advanced).

### LLM provider keys

Optional LLM proxy settings are not generated from env vars in the default template. For hub-proxied LLM access, mount a config file with an `llm` section or extend deployment tooling. See [LLM](./llm.md) and `server.yaml.example` at the repository root.

## Using the CLI in the container

Administration commands (`user`, `migrate`, `collection`, and so on) run through the same CLI as a host install. In the Docker image, a few details differ from [Setup](./setup.md).

### Where the config file lives

At startup the entrypoint **generates** the config at `/etc/team-hub/server.yaml`. There is no `server.yaml` in `/app` (the app working directory). The running server is started with that path explicitly.

The CLI does **not** read the `TEAM_HUB_CONFIG` environment variable. You must pass the config path with `-c` / `--config`, or the CLI looks for `server.yaml` in the current directory and fails with “config file not found”.

Verify the generated config inside a running container:

```bash
docker exec CONTAINER cat /etc/team-hub/server.yaml
```

### How to invoke the CLI

The `team-hub` binary is not on `PATH` in the image. Run the built CLI with Node from `/app`:

```bash
node /app/dist/cli.js -c /etc/team-hub/server.yaml <subcommand> [options]
```

**Put global flags before the subcommand.** `-c` is a root-level option, not a subcommand option:

```bash
# Correct
node /app/dist/cli.js -c /etc/team-hub/server.yaml user list

# Wrong — "unknown option '-c'"
node /app/dist/cli.js user list -c /etc/team-hub/server.yaml
```

### Running commands from your host

Prefer one-shot `docker exec` from your machine (no interactive shell required):

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

Replace `CONTAINER` with the container name or id from `docker ps`.

### Running commands inside the container

If you open a shell with `docker exec -it CONTAINER bash`, change to `/app` first:

```bash
cd /app
node dist/cli.js -c /etc/team-hub/server.yaml user list
```

Optional alias for an interactive session:

```bash
alias team-hub='node /app/dist/cli.js -c /etc/team-hub/server.yaml'
team-hub user list
```

See [CLI](./cli.md) for all subcommands and options.

### Reload config without restarting

Team Hub can reload `server.yaml` while the `start` process is running. Reloadable sections are applied on a **best-effort** basis: each section is evaluated independently, and failures in one section do not roll back changes already applied to other sections.

| Section | Live reload? | Notes |
| ------- | ------------ | ----- |
| `db` | Yes | Reconnects when the raw `db` mapping changes |
| `redis` | Yes | Reconnects when the raw `redis` mapping changes |
| `llm` | Yes | Applied immediately |
| `plugins` | Yes | Applied immediately |
| `logging` | No | Applied at process startup; restart after changes |
| `server.host` / `server.port` | No | Reported as `restart-required`; restart the process to rebind |

**Triggers:**

```bash
# Signal the running start process (inside the container or on the host)
kill -HUP "$(pgrep -f 'dist/cli.js.* start')"

# Admin API (requires an admin-role bearer token)
curl -s -X POST http://127.0.0.1:8788/admin/config/reload \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

Both triggers re-read the same config path passed to `team-hub -c … start`. When the file is missing or invalid YAML, nothing is changed and the reload returns a fatal error.

Example reload response:

```json
{
  "sections": [
    { "section": "db", "status": "unchanged" },
    { "section": "redis", "status": "unchanged" },
    { "section": "llm", "status": "reloaded" },
    { "section": "plugins", "status": "reloaded" },
    { "section": "server", "status": "unchanged" }
  ]
}
```

Possible `status` values per section: `reloaded`, `unchanged`, `failed`, `restart-required`. When the config file itself cannot be loaded, the response includes `fatalError` and an empty `sections` array.

### Restart the server after config changes

Use a full process restart when you change `server.host` or `server.port`, or when you prefer a clean boot after large infrastructure changes.

| Scenario | Action |
| -------- | ------ |
| Edited `/etc/team-hub/server.yaml` (e.g. added `llm:`) | Prefer `kill -HUP …` or `POST /admin/config/reload`; restart only if bind settings changed |
| Changed Docker env vars (`TEAM_HUB_DB_*`, etc.) | `docker restart CONTAINER` from the host — entrypoint **regenerates** yaml from env |
| Full stack restart (Postgres, Redis, Nginx, Team Hub) | `docker restart CONTAINER` |

The image includes a restart helper (no `pkill` required — the slim image does not ship `procps`):

```bash
# Inside the container
/docker/restart-team-hub.sh
# or:
restart-team-hub

# From your host
docker exec CONTAINER /docker/restart-team-hub.sh
```

The script sends `SIGTERM` to the running Team Hub `start` process. Supervisord respawns it, runs `migrate`, then `start` with the current config. Nginx, Postgres, and Redis are **not** restarted.

Verify after restart:

```bash
curl -s http://127.0.0.1:8080/health
```

### Create an admin user

After the container is healthy (`GET /health` returns `{"status":"ok",...}`), create the first admin account:

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user create --name ops --role admin
```

List users to confirm and copy the user id:

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

Create an API token for HarborClient (replace `USER_ID` with the id from `user list`):

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user token create USER_ID --name desktop
```

See [Authentication](./auth.md) for token usage and [CLI — Examples](./cli.md#examples) for other admin tasks.

### Cloud Run

On Cloud Run there is no long-lived shell to `exec` into. Run admin commands with a [Cloud Run Job](https://cloud.google.com/run/docs/create-jobs) or a one-off task using the same image, environment variables, and secrets as the service — for example `node /app/dist/cli.js -c /etc/team-hub/server.yaml migrate` or `user create`.

## Post-deploy administration

Most day-two tasks use the CLI patterns above: always pass `-c /etc/team-hub/server.yaml` before the subcommand, and invoke `node /app/dist/cli.js` from `/app`. After editing config, [restart Team Hub](#restart-the-server-after-config-changes) before expecting new settings to apply. Common follow-ups after creating a user:

- `user token create` — issue bearer tokens for HarborClient
- `user token list` / `user token revoke` — manage tokens
- `collection list` — inspect synced collections

See [CLI](./cli.md) and [Authentication](./auth.md) for full reference.

## Health checks

Cloud Run sends traffic to `$PORT`. Nginx proxies to Team Hub’s `GET /health` endpoint.

Use `/health` for manual checks and uptime monitoring. The response includes `status: "ok"` and the application version.

## Environment variable reference

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `8080` | Nginx listen port (set by Cloud Run) |
| `TEAM_HUB_PORT` | `8787` | Internal Team Hub port |
| `TEAM_HUB_HOST` | `127.0.0.1` | Team Hub bind address |
| `TEAM_HUB_CONFIG` | `/etc/team-hub/server.yaml` | Generated config path |
| `TEAM_HUB_START_POSTGRES` | `true` | Start bundled Postgres |
| `TEAM_HUB_START_REDIS` | `true` | Start bundled Redis |
| `TEAM_HUB_DB_DRIVER` | `postgres` | `postgres`, `mysql`, or `firestore` |
| `TEAM_HUB_DB_HOST` | `127.0.0.1` | Database host |
| `TEAM_HUB_DB_PORT` | `5432` | Database port |
| `TEAM_HUB_DB_USER` | `harbor` | Database user |
| `TEAM_HUB_DB_PASSWORD` | `harbor` | Database password |
| `TEAM_HUB_DB_DATABASE` | `harbor` | Database name |
| `TEAM_HUB_REDIS_HOST` | `127.0.0.1` | Redis host |
| `TEAM_HUB_REDIS_PORT` | `6379` | Redis port |

## Troubleshooting

### Container exits during startup

Check Cloud Run logs or `docker logs`. Common causes:

- **Insufficient memory** — bundled Postgres + Redis + Node need at least **2 GiB** for evaluation deploys.
- **Postgres init failure** — ensure `PGDATA` (`/var/lib/postgresql/data`) is writable; on Cloud Run without a volume, first boot should still succeed but data is ephemeral.

### `GET /health` fails or connection refused

- Confirm the service listens on `$PORT` (8080).
- Wait for startup: migrations and Postgres init can take 30–60 seconds on cold start.

### Protected API routes return 503

Redis is required for auth throttling. Verify Redis is running (bundled) or reachable (Memorystore + VPC connector). See [Authentication](./auth.md).

### Config file not found

The CLI defaults to `server.yaml` in the current directory. In the container the generated config is at `/etc/team-hub/server.yaml`. Pass it explicitly **before** the subcommand:

```bash
node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

If `/etc/team-hub/server.yaml` itself is missing, the container likely failed during startup — check `docker logs CONTAINER`.

### Migration errors

- Ensure the database user can create tables.
- Run `team-hub migrate` manually with the same config the server uses.
- For Cloud SQL, confirm the Cloud SQL Auth proxy / Unix socket attachment is configured.

### Stale data after redeploy on Cloud Run

Expected when using bundled Postgres. Switch to Cloud SQL for durable storage.

## Related docs

- [Setup](./setup.md) — install and run on the host
- [Authentication](./auth.md) — bearer tokens and Redis throttling
- [CLI](./cli.md) — users, tokens, collections
- `server.yaml.example` at the repository root — example config file
- [Configuration](./configuration.md) — full `server.yaml` reference
