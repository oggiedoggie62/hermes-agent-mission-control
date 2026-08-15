# UFO Readiness Integration

## Plan

- [x] Run the Mint-side gather in gather-only mode.
- [x] Refresh the combined readiness contract.
- [x] Read the contract directly from Mission Control without a new daemon or database table.
- [x] Fail visibly when the contract is missing or malformed.
- [x] Add BLOCK and WARN items to the existing attention queue.
- [x] Render publication status and the recommended action.
- [ ] Add a dedicated evidence-detail page after the card has been reviewed in daily use.

## Data flow

Mission Control reads `/home/oggie/projects/ufo-readiness-gate/reports/latest.json`
on each dynamic dashboard render. Set `UFO_READINESS_PATH` to override the path.
The artifact is authoritative for 36 hours after `generated_at`, matching the
daily producer cadence and the gate's own freshness boundary. Timestamps must
be valid ISO 8601 values with an explicit timezone. Five minutes of future
clock skew is tolerated.
The adapter never writes to the UFO project, builds either site, deploys content,
or contacts the Mac Mini.

## Safety behavior

- Missing, malformed, schema-invalid, future-dated, or stale contracts appear
  as non-authoritative and create a critical attention item.
- `BLOCK` creates a critical attention item with the first publication blocker.
- `WARN` creates a warning item.
- The dashboard displays the gate decision, publication permission, generation
  time, and recommended action.
