# Mac Mini Guardian Integration

## Scope

Mission Control is a read-only consumer of the existing Mac Mini Guardian.
The Guardian producer, its 15-minute timer, recovery behavior, and status
server remain owned by `/home/oggie/projects/mac-mini-guardian` and are not
modified by this integration.

## Data flow

After each probe, Guardian sends an authenticated JSON payload to
`POST /api/guardian/status`. Mission Control validates the payload and stores
the latest accepted value under `mac-mini-guardian-status` in the existing
Prisma `DataStore` table. `GET /api/guardian/status` classifies that persisted
evidence for the Machines page.

The POST route uses the shared `INTERNAL_API_SECRET` behavior:

- Missing authorization returns HTTP 401.
- Missing server configuration or an incorrect Bearer value returns HTTP 403.
- Invalid, stale, or future-dated payloads return HTTP 400.
- DataStore read or write failures return HTTP 503 without exposing database
  details.

## Contract and freshness

Required payload fields are `hostname`, `status`, `lastProbed`, `summary`,
`tailscale`, and a structured `recovery` object. Status, Tailscale, and recovery
values are constrained to the producer's known states. Strings are non-empty
and bounded. Guardian's existing local ISO timestamp and timezone-qualified
ISO timestamps are accepted.

Evidence remains authoritative for 35 minutes. This permits two 15-minute
producer windows plus timer jitter and the bounded recovery attempt. Five
minutes of future clock skew is tolerated. Missing, invalid, stale, and
DataStore-error states are rendered explicitly. Stale last-known data may be
shown for context but is labeled non-authoritative.

## Verification

```bash
npm run test:guardian-integration
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

Production deployment is a separate operator action through the canonical
`./scripts/deploy.sh` workflow.
