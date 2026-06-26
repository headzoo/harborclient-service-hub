#!/bin/bash
set -euo pipefail

export PORT="${PORT:-8080}"
export NGINX_SERVER_NAME="${NGINX_SERVER_NAME:-_}"
export TEAM_HUB_PORT="${TEAM_HUB_PORT:-8787}"
export TEAM_HUB_HOST="${TEAM_HUB_HOST:-127.0.0.1}"
export TEAM_HUB_CONFIG="${TEAM_HUB_CONFIG:-/etc/team-hub/server.yaml}"
export TEAM_HUB_START_POSTGRES="${TEAM_HUB_START_POSTGRES:-true}"
export TEAM_HUB_START_REDIS="${TEAM_HUB_START_REDIS:-true}"
export TEAM_HUB_DB_DRIVER="${TEAM_HUB_DB_DRIVER:-postgres}"
export TEAM_HUB_DB_HOST="${TEAM_HUB_DB_HOST:-127.0.0.1}"
export TEAM_HUB_DB_PORT="${TEAM_HUB_DB_PORT:-5432}"
export TEAM_HUB_DB_USER="${TEAM_HUB_DB_USER:-harbor}"
export TEAM_HUB_DB_PASSWORD="${TEAM_HUB_DB_PASSWORD:-harbor}"
export TEAM_HUB_DB_DATABASE="${TEAM_HUB_DB_DATABASE:-harbor}"
export TEAM_HUB_REDIS_HOST="${TEAM_HUB_REDIS_HOST:-127.0.0.1}"
export TEAM_HUB_REDIS_PORT="${TEAM_HUB_REDIS_PORT:-6379}"
export TEAM_HUB_LOGGING_LEVEL="${TEAM_HUB_LOGGING_LEVEL:-info}"
export TEAM_HUB_LOGGING_FILE="${TEAM_HUB_LOGGING_FILE:-/var/log/team-hub/team-hub.log}"
export TEAM_HUB_LOGGING_CONSOLE="${TEAM_HUB_LOGGING_CONSOLE:-true}"

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
SUPERVISOR_CONF="/etc/team-hub/supervisord.generated.conf"
POSTGRES_BIN="$(ls /usr/lib/postgresql/*/bin/postgres 2>/dev/null | head -n1)"
POSTGRES_DIR="$(dirname "${POSTGRES_BIN}")"

if [ -z "${POSTGRES_BIN}" ]; then
  echo "entrypoint: Postgres binary not found under /usr/lib/postgresql" >&2
  exit 1
fi

# Initializes a local Postgres data directory and harbor role/database on first boot.
init_postgres() {
  if [ -s "${PGDATA}/PG_VERSION" ]; then
    return 0
  fi

  echo "entrypoint: initializing Postgres data directory at ${PGDATA}"
  mkdir -p "${PGDATA}"
  chown -R postgres:postgres "${PGDATA}"
  chmod 700 "${PGDATA}"

  su - postgres -s /bin/bash -c "'${POSTGRES_DIR}/initdb' -D '${PGDATA}' --auth-local=trust --auth-host=scram-sha-256"

  cat >> "${PGDATA}/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = ${TEAM_HUB_DB_PORT}
EOF

  cat >> "${PGDATA}/pg_hba.conf" <<EOF
host all all 127.0.0.1/32 scram-sha-256
host all all ::1/128 scram-sha-256
EOF

  su - postgres -s /bin/bash -c "'${POSTGRES_DIR}/pg_ctl' -D '${PGDATA}' -o \"-c listen_addresses='127.0.0.1' -c port=${TEAM_HUB_DB_PORT}\" -w start"

  su - postgres -s /bin/bash -c "'${POSTGRES_DIR}/psql' -v ON_ERROR_STOP=1 --username postgres" <<EOF
CREATE USER ${TEAM_HUB_DB_USER} WITH PASSWORD '${TEAM_HUB_DB_PASSWORD}';
CREATE DATABASE ${TEAM_HUB_DB_DATABASE} OWNER ${TEAM_HUB_DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${TEAM_HUB_DB_DATABASE} TO ${TEAM_HUB_DB_USER};
EOF

  su - postgres -s /bin/bash -c "'${POSTGRES_DIR}/pg_ctl' -D '${PGDATA}' -m fast -w stop"
}

if [ "${TEAM_HUB_START_POSTGRES}" = "true" ] && [ "${TEAM_HUB_DB_DRIVER}" = "postgres" ]; then
  init_postgres
fi

mkdir -p /etc/team-hub /var/log/team-hub /var/run/team-hub
chmod 755 /var/log/team-hub /var/run/team-hub

# Renders server.yaml from env vars on first boot only. Preserves manual edits and
# mounted configs across restarts unless TEAM_HUB_FORCE_CONFIG_GENERATE=true.
if [ "${TEAM_HUB_FORCE_CONFIG_GENERATE:-false}" = "true" ] || [ ! -s "${TEAM_HUB_CONFIG}" ]; then
  envsubst '${TEAM_HUB_PORT} ${TEAM_HUB_HOST} ${TEAM_HUB_DB_DRIVER} ${TEAM_HUB_DB_HOST} ${TEAM_HUB_DB_PORT} ${TEAM_HUB_DB_USER} ${TEAM_HUB_DB_PASSWORD} ${TEAM_HUB_DB_DATABASE} ${TEAM_HUB_REDIS_HOST} ${TEAM_HUB_REDIS_PORT} ${TEAM_HUB_LOGGING_LEVEL} ${TEAM_HUB_LOGGING_FILE} ${TEAM_HUB_LOGGING_CONSOLE}' \
    < /docker/server.yaml.template > "${TEAM_HUB_CONFIG}"
else
  echo "entrypoint: keeping existing config at ${TEAM_HUB_CONFIG}"
fi

envsubst '${PORT} ${TEAM_HUB_PORT} ${NGINX_SERVER_NAME}' \
  < /docker/nginx.conf.template > /etc/nginx/conf.d/team-hub.conf

cat > "${SUPERVISOR_CONF}" <<EOF
[supervisord]
nodaemon=true
user=root
logfile=/var/log/team-hub/supervisord.log
pidfile=/var/run/team-hub/supervisord.pid
childlogdir=/var/log/team-hub

[program:team-hub]
command=/docker/start-team-hub.sh
directory=/app
autostart=true
autorestart=true
priority=30
stdout_logfile=/var/log/team-hub/team-hub.log
stderr_logfile=/var/log/team-hub/team-hub.err.log
environment=TEAM_HUB_CONFIG="${TEAM_HUB_CONFIG}",TEAM_HUB_START_POSTGRES="${TEAM_HUB_START_POSTGRES}",TEAM_HUB_START_REDIS="${TEAM_HUB_START_REDIS}",TEAM_HUB_DB_DRIVER="${TEAM_HUB_DB_DRIVER}",TEAM_HUB_DB_HOST="${TEAM_HUB_DB_HOST}",TEAM_HUB_DB_PORT="${TEAM_HUB_DB_PORT}",TEAM_HUB_REDIS_HOST="${TEAM_HUB_REDIS_HOST}",TEAM_HUB_REDIS_PORT="${TEAM_HUB_REDIS_PORT}"

[program:nginx]
command=/usr/sbin/nginx -g "daemon off;"
autostart=true
autorestart=true
priority=40
stdout_logfile=/var/log/team-hub/nginx.log
stderr_logfile=/var/log/team-hub/nginx.err.log
EOF

if [ "${TEAM_HUB_START_POSTGRES}" = "true" ] && [ "${TEAM_HUB_DB_DRIVER}" = "postgres" ]; then
  cat >> "${SUPERVISOR_CONF}" <<EOF

[program:postgresql]
command=${POSTGRES_BIN} -D ${PGDATA} -c listen_addresses=127.0.0.1 -c port=${TEAM_HUB_DB_PORT}
user=postgres
autostart=true
autorestart=true
priority=10
stdout_logfile=/var/log/team-hub/postgresql.log
stderr_logfile=/var/log/team-hub/postgresql.err.log
EOF
fi

if [ "${TEAM_HUB_START_REDIS}" = "true" ]; then
  cat >> "${SUPERVISOR_CONF}" <<EOF

[program:redis]
command=/usr/bin/redis-server --bind 127.0.0.1 --port ${TEAM_HUB_REDIS_PORT} --daemonize no --protected-mode no
autostart=true
autorestart=true
priority=20
stdout_logfile=/var/log/team-hub/redis.log
stderr_logfile=/var/log/team-hub/redis.err.log
EOF
fi

exec /usr/bin/supervisord -c "${SUPERVISOR_CONF}"
