#!/usr/bin/env bash
# agent: hermes | model: grok-4.5 | date: 2026-07-20
# Deterministic preflight: ensure mission-control-pg is up and Postgres accepts TCP.
set -euo pipefail

CONTAINER="${MISSION_CONTROL_PG_CONTAINER:-mission-control-pg}"
HOST="${MISSION_CONTROL_PG_HOST:-127.0.0.1}"
PORT="${MISSION_CONTROL_PG_PORT:-5432}"
TIMEOUT_SEC="${MISSION_CONTROL_PG_WAIT_SECONDS:-30}"

if command -v docker >/dev/null 2>&1; then
  # Ignore failure if Docker is unavailable in this context; TCP check is authoritative.
  /usr/bin/docker start "$CONTAINER" >/dev/null 2>&1 || true
fi

deadline=$((SECONDS + TIMEOUT_SEC))
while (( SECONDS < deadline )); do
  if /usr/bin/node -e '
const net = require("net");
const host = process.argv[1];
const port = Number(process.argv[2]);
const socket = net.connect({ host, port }, () => {
  socket.end();
  process.exit(0);
});
socket.setTimeout(1500, () => {
  socket.destroy();
  process.exit(1);
});
socket.on("error", () => process.exit(1));
' "$HOST" "$PORT"; then
    echo "PostgreSQL reachable at ${HOST}:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL not reachable at ${HOST}:${PORT} within ${TIMEOUT_SEC}s" >&2
exit 1
