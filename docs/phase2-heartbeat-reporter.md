# Mission Control Phase 2 — Agent Heartbeat Reporter

## What was built

A Python heartbeat reporter that bridges the gap between AgentOS (filesystem-based agent registry) and Mission Control (Next.js/Postgres dashboard). It runs as a Hermes cron job every 10 minutes.

## Architecture

```
┌─────────────────────┐     GET /api/agents/state (reads Postgres)     ┌────────────────────┐
│  Mission Control     │◄──────────────────────────────────────────────│  Dashboard (Next.js)│
│  Dashboard (Browser) │                                               │  Port 3000          │
└─────────────────────┘                                               └────────┬───────────┘
                                                                               │ reads from
                                                                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Postgres (AgentState + HostHealth)                    │
└──────────┬──────────────────────────────────────────────────┬────────────────┘
           │ POST /api/agents/state                           │ POST /api/host/health
           │ (via INTERNAL_API_SECRET auth)                    │ (via INTERNAL_API_SECRET auth)
           ▼                                                  ▼
┌──────────────────────┐                           ┌──────────────────────────┐
│  mc-heartbeat-       │                           │  mc-heartbeat-reporter   │
│  reporter.py         │  reads AgentOS            │  (system health)         │
└──────────────────────┘  registry.json            └──────────────────────────┘
         │                          │
         │                          ▼
         │               ~/AI/AgentOS/Agents/registry.json
         │               ~/AI/AgentOS/Memory/project-ledger.md
         │               ~/.hermes/cron/jobs.json
         │
         ▼
   nvidia-smi, /proc/loadavg, /proc/meminfo, df, mount -t cifs
```

## Files Created/Modified

| File | Type | Description |
|------|------|-------------|
| `scripts/mc-heartbeat-reporter.py` | New | Python reporter: collects system health + agent states, POSTs to MC API |
| `src/app/api/host/health/route.ts` | New | HostHealth POST/GET endpoint (gated behind INTERNAL_API_SECRET) |

## Cron Job

- **Job ID:** `7ee92ce21d02`
- **Schedule:** Every 10 minutes
- **Mode:** Script-only (`--no-agent`)
- **Command:** `cd ~/mission-control && python3 scripts/mc-heartbeat-reporter.py`

## API Endpoints

### GET/POST `/api/host/health`
Reports workstation health metrics. Auth required (Bearer INTERNAL_API_SECRET).

Payload:
```json
{
  "hostname": "Mint-Hub",
  "cpuUsage": 7.4,
  "ramUsage": 47.8,
  "diskUsage": 46.0,
  "gpuTemp": 46,
  "nasConnected": true,
  "nasAvailable": 15.4
}
```

### GET/POST `/api/agents/state`
Existing endpoint (Phase 0). Now receiving live data from 5 agents.

## Dashboard Impact (Before → After)

| Metric | Before | After |
|--------|--------|-------|
| Agents online | 0 / 0 | 2 / 5 |
| Host health | Static hardcoded values | Live from Mint (CPU, GPU, RAM, NAS) |
| Agent cards (Collective) | Empty | 5 agent cards with status dots |
| Mint Health card | -- | Real CPU, GPU temp, NAS status |

## Future Expansion

- [ ] Add agent-specific metrics (tasksCompleted tracking)
- [ ] Add missions auto-population from Kanban
- [ ] Add agent activity log / recentActivity
- [ ] Add more host health checks (Docker containers, services)
- [ ] Ubuntu Server and Mac Mini heartbeat reporters (lightweight)
- [ ] Trend charts for host health over time