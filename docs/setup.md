# Setup

## Install and configure

Install dependencies and build the CLI:

```bash
pnpm install
pnpm build
```

Copy the example config and adjust it for your environment:

```bash
cp server.yaml.example server.yaml
```

`server.yaml` requires `server`, `db`, and `redis` sections. See [`server.yaml.example`](../server.yaml.example) for Postgres, MySQL, and Firestore options.

For local development, start Postgres and Redis with Docker Compose (Team Hub itself is not containerized in this repo):

```bash
docker compose up -d
```

Apply database migrations before starting the server or running admin commands:

```bash
team-hub migrate
```

See [Authentication](./auth.md) for creating and managing API bearer tokens.

## Start the server

### Production

Run the **built** CLI, not the development wrapper:

```bash
pnpm start
```

Equivalent invocations:

```bash
node dist/cli.js start
team-hub start
team-hub -c /etc/team-hub/server.yaml start
```

Most subcommands read `server.yaml` from the current working directory. Override the path with `-c` / `--config`. See [CLI — Global options](./cli.md#global-options).

The server listens on the host and port configured under `server` in `server.yaml`. It handles graceful shutdown on `SIGINT` and `SIGTERM`, but it does **not** restart itself after a crash or reboot. Use a process supervisor for that (see below).

### Development only

During development you can run the CLI without building:

```bash
pnpm dev start
```

This uses `tsx` and is intended for local work only. Do not use it for production or when you need automatic restarts. See [Development](./development.md).

## Keep the server running

For production, run Team Hub under a process manager so it restarts on crash and starts on boot.

### systemd (recommended on Linux)

Example unit at `/etc/systemd/system/team-hub.service`:

```ini
[Unit]
Description=Team Hub server
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=teamhub
WorkingDirectory=/opt/team-hub
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/team-hub/dist/cli.js start -c /etc/team-hub/server.yaml
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable team-hub
sudo systemctl start team-hub
sudo systemctl status team-hub
```

Adjust paths, user, and config location to match your install. `Restart=always` restarts the process after unexpected exits; `enable` starts it on boot.

### PM2 (alternative)

```bash
pm2 start dist/cli.js --name team-hub -- start -c /etc/team-hub/server.yaml
pm2 save
pm2 startup
```

PM2 restarts on crash and can survive reboots after `startup` and `save`.

### What not to use in production

| Command | Why |
| ------- | --- |
| `pnpm dev start` | Development transpiler (`tsx`), not a built artifact |
| Bare `pnpm start` in a terminal | Stops when the shell closes; no restart on crash |
| `nohup ... &` | Survives logout, but still no automatic restart |

## Typical workflow

After setup:

```bash
team-hub migrate
team-hub user create --name ops --role admin
team-hub start
```

See [CLI — Examples](./cli.md#examples) for user, token, and collection administration.
