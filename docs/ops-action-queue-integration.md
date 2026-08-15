# Ops Action Queue Integration

Mission Control reads `/home/oggie/projects/ops-action-queue/reports/latest.json`
directly. Set `OPS_ACTION_QUEUE_PATH` to override that location. The reader
validates timestamps, summary counts, priorities, and action fields. Missing or
malformed data is shown as an operational error instead of zero healthy actions.

The dashboard displays open totals, priority counts, and acknowledgements.
Unacknowledged open P0 and P1 actions also appear in the main attention list.
P2/P3 items remain visible in counts without crowding the exception list.

Mission Control never edits the queue, restarts a service, or contacts a remote
host. Mac Mini actions retain their `hands_off` flag and require explicit user
permission outside this view.

## Verification

```bash
npm run test:operations-summary
npm run build
```

Production deployment remains a separate operator action through
`./scripts/deploy.sh` or `npm run deploy`.
