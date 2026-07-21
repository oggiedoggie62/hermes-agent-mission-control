# Mission Control Server Launch

This file is startup instructions only. It does not assert that services are currently running.
Runtime verification results and timestamps live in `MISSION_CONTROL.md` and the AgentOS work log.

## Prerequisites

```bash
docker start mission-control-pg
cd /home/oggie/mission-control
```

## Start production dashboard

Use a completed production build (do not build over a running server):

```bash
# If a server is already running, stop it first (Ctrl+C or kill the next/npm process).
npm run build
npm run start -- -p 3000
```

Keep that terminal open. Open: <http://localhost:3000>

## Start deterministic dispatcher (separate process)

In another terminal, after the dashboard is healthy:

```bash
cd /home/oggie/mission-control
npm run dispatcher
```

The dispatcher polls AUTO HERMES missions every 45 seconds by default (30–60 allowed).
Leave the legacy `mission-worker` cron disabled while this dispatcher is active.

## Health checks

```bash
curl -sS http://localhost:3000/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/missions/state
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/missions
```

Healthy dashboard health body:

```json
{"ok":true,"db":"connected"}
```

## Stop

1. Stop the dispatcher terminal with `Ctrl+C`.
2. Stop the dashboard terminal with `Ctrl+C`.

PostgreSQL can remain running via Docker unless you intentionally stop it.
