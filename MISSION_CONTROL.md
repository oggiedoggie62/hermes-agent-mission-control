# Mission Control Architecture

## Purpose and Current Status

Mission Control is a local-first operations dashboard for Hermes agents and AgentOS. It combines live operational data stored in PostgreSQL with durable registries, knowledge, decisions, mission debriefs, and service metadata stored in the AgentOS filesystem.

The original AgentOS integration roadmap through Phase 5 is complete. Mission Control v2 foundation work and the Phase 2.1.1 mission lifecycle enhancement are complete, including archive search and filtering. Phase 2.2 is proceeding one operational component at a time. The command palette has been deferred until the core operational workflows are defined and stable.

## Technology Stack

- Next.js 16 App Router and React 19
- TypeScript
- Tailwind CSS v4
- Prisma 6 with PostgreSQL
- Lucide React icons
- React Markdown for AgentOS document and debrief rendering
- Python and TypeScript reporter/indexing scripts for external data ingestion

The application is currently intended for a trusted local environment. It does not have user authentication, and not every mutation endpoint currently enforces `INTERNAL_API_SECRET`.

## High-Level Architecture

```text
Hermes agents and reporters
        |
        | heartbeats, mission updates, host health
        v
Next.js route handlers  <---->  PostgreSQL through Prisma
        |
        | guarded reads
        v
AgentOS filesystem
  Agents, Projects, Memory, Knowledge, Logs, Registry
        |
        v
Next.js server-rendered pages and client interactions
```

Mission Control deliberately uses two data sources:

1. PostgreSQL holds mutable operational state that benefits from queries and updates: agent heartbeats, missions, ideas, host health, generated-file indexes, and generic key/value data.
2. AgentOS remains the source of truth for durable human-readable system knowledge: agent and project registries, queues, decisions, documentation, knowledge trees, service/device registries, graph metadata, and mission debrief Markdown files.

## Application Structure

### Shared Shell

- `src/app/layout.tsx` provides the global application shell.
- `src/components/sidebar.tsx` provides desktop navigation and a responsive mobile header/drawer.
- `src/app/globals.css` contains the dark command-center palette, semantic colors, typography defaults, and shared panel styling.

The shell uses a fixed-width desktop sidebar and `min-w-0` content containment to prevent wide dashboard content from destabilizing the layout. Mobile viewports use a fixed header and dismissible slide-in navigation drawer. Navigation uses exact route matching so Missions and Mission Archives do not appear active simultaneously.

### Pages

- `/` aggregates an **Operations summary** (what needs attention, mission status counts, system health, workflow entry points) plus agent activity, Mint health, AgentOS summaries, decisions, knowledge, and graph information.
- `/agents` combines the AgentOS agent registry with live heartbeat data.
- `/projects` displays the AgentOS project index and shared project ledger.
- `/missions` provides mission creation, a client-side Kanban board, text search, agent/priority/status filters, compact result counts, queued duration, Awaiting Review labeling, mission-worker timing, and automatic state refresh.
- `/missions/archive` lists completed, explicitly archived missions and provides client-side text search and agent filtering without changing archive persistence.
- `/ideas` provides one-field Quick Capture for explicitly typed Ideas and To-Dos, a shared chronological review list, and deliberate Idea-to-To-Do and To-Do-to-Mission promotion actions.
- `/library` combines indexed generated files with AgentOS documents, decisions, and knowledge.
- `/library/doc` renders guarded AgentOS Markdown files, including mission debriefs.
- `/machines` displays registered devices, services, and host-health information.
- `/calendar` reads live Hermes cron job definitions and recent execution status.

Most data-heavy pages are React Server Components. Client Components are used where browser state and direct interaction are required, including the responsive sidebar, mission creation, Kanban/archive actions, active-board review filters, and archive search/filter state. The Missions server page supplies the initial non-archived mission list; `KanbanClient` refreshes its canonical browser-side list from `/api/missions/state` every 20 seconds and whenever the tab becomes visible or the window regains focus. `MissionBoardFilters` controls derived search and filter state. The archive server page fetches the canonical archived mission list once and passes it to `ArchiveClient`.

### API Routes

- `/api/agents/state`: receives and returns live agent heartbeat state.
- `/api/health`: checks PostgreSQL connectivity.
- `/api/host/health`: receives and returns machine health reports.
- `/api/missions`: creates missions and exposes agent choices.
- `/api/missions/state`: returns current non-archived missions, their latest durable execution attempt, deterministic dispatcher service health, and read-only legacy `mission-worker` last-run, next-run, enabled, and result metadata from the Hermes cron registry.
- `/api/missions/[id]`: updates mission status, result, debrief path, and archive state.
- `/api/missions/archive`: returns completed missions whose `isArchived` flag is true.
- `/api/ideas`: lists and creates Ideas and To-Dos through the existing capture store; POST validates the explicit `idea` or `todo` type.
- `/api/ideas/[id]`: edits active capture text in place and applies guarded promotion transitions to the existing capture record; it changes an Idea to a To-Do or marks a To-Do promoted after Mission creation succeeds.
- `/api/content/index`: supports generated-content indexing.
- `/api/registry`: returns AgentOS device and service registry data.
- `/api/files`: serves guarded Markdown and HTML files for raw viewing.

Dynamic route parameters are awaited in Next.js 16 route handlers. This is required for routes such as `/api/missions/[id]`; treating `params` synchronously previously broke mission archival.

## Persistence Model

Prisma defines these PostgreSQL models:

- `AgentState`: current agent status, task, activity, cost, and heartbeat timestamp.
- `Mission`: assigned work, priority, compatibility lifecycle status, result, debrief path, completion time, archive state, and explicit execution provider/mode.
- `MissionExecution`: durable execution attempts with queued, claimed, running, completed, or failed state; claim/start/activity/completion timestamps; execution and worker identifiers; attempt number; and error details.
- `Idea`: manually or automatically captured Ideas and To-Dos, distinguished by the required `CaptureType` enum (`idea` or `todo`), plus review state, immutable creation timestamp, and automatic modification timestamp. Existing records were safely backfilled as `idea` through the field default.
- `HostHealth`: CPU, memory, disk, GPU temperature, and NAS status by hostname.
- `GeneratedFile`: indexed metadata and optional content for generated files.
- `DataStore`: generic JSON-backed extension storage.

Mission archival is an explicit state transition, not a deletion. A mission remains in PostgreSQL, must be completed, and appears in the archive only when `isArchived` is true. Debriefs are stored as relative AgentOS paths on the mission record; the actual Markdown remains in AgentOS and is opened through `/library/doc`.

## AgentOS Integration

`src/lib/agentos.ts` is the central server-side integration layer. It resolves configured paths, reads AgentOS JSON and Markdown, parses registries and ledgers, and returns safe defaults when optional files are absent.

Important filesystem decisions:

- `AGENTOS_ROOT` defaults to `/home/oggie/AI/AgentOS` and can be overridden by environment configuration.
- Relative document reads are resolved under `AGENTOS_ROOT` and blocked if they escape that root.
- The raw-file API permits only Markdown and HTML under the configured home path.
- AgentOS remains readable without importing its contents into PostgreSQL unless queryable mutable state is useful.

External scripts under `scripts/` report heartbeats and host health, index generated content, update agents, seed data, and help start the dashboard. These scripts call the same application APIs used by other integrations.

## Major Design Decisions

### Local-first, hybrid storage

Operational state belongs in PostgreSQL, while durable knowledge stays as transparent files in AgentOS. This avoids duplicating the complete AgentOS knowledge base in the database and keeps debriefs and decisions directly readable outside Mission Control.

### Server rendering by default

Pages read PostgreSQL and AgentOS on the server. Browser-side state is limited to interactions that require it. This keeps filesystem access and database credentials out of the client bundle.

### Path-guarded file access

All AgentOS document reads are constrained to configured roots and expected file types. The browser receives rendered content or guarded raw-file responses rather than unrestricted filesystem access.

### Mission debrief lifecycle

Agents complete missions by writing a result and an AgentOS-relative `debriefPath`. Mission cards and archived missions link that path to the shared Markdown viewer. Archiving changes only `isArchived`; it does not move or delete the debrief file.

### Mission execution freshness

The active Missions board treats PostgreSQL as the source of truth and refreshes read-only state every 20 seconds plus on browser visibility/focus. Current persisted statuses remain unchanged: `pending` is presented as Queued, `active` as Active, `completed` as Awaiting Review, and `failed` as Failed.

Pending cards show elapsed time since `createdAt`. A warning appears when a pending or active mission is at least 45 minutes old. Because the current schema has no claim or start timestamp, an active warning measures total mission age rather than exact running duration. This limitation remains until the separately planned database-backed execution-state component.

Worker visibility is read directly from Hermes' `mission-worker` cron entry and reports its last run, expected next run, enabled state, last status, and last error. This component does not modify the 15-minute schedule, two-tick worker, global temporary handoff, dispatch behavior, or mission records.

### Database-backed execution state and atomic claims

`MissionExecution` is the durable execution-attempt record. It separates execution state from the legacy `Mission.status` compatibility field and supports `queued`, `claimed`, `running`, `completed`, and `failed`. Each attempt can record `claimedAt`, `startedAt`, `heartbeatAt`, `completedAt`, `executionId`, `workerId`, `attempt`, and `error`. A unique `(missionId, attempt)` constraint prevents duplicate attempt numbers, and a unique execution identifier supports reliable callbacks.

Missions and attempts carry explicit execution policy metadata: provider is currently `HERMES`, while mode is `MANUAL` or `AUTO`. Migrated and newly created missions default to `MANUAL`. The New Mission dialog provides an explicit Manual or Automatic choice and exposes Automatic only for the supported `hermes` agent. The API independently defaults omitted modes to MANUAL and forces agents without a configured automatic dispatcher to MANUAL. The dispatcher claim operation selects only matching HERMES/AUTO missions and executions, so manual, unsupported, or migrated work cannot be claimed accidentally.

### Mission dispatch UX

The New Mission dialog has an explicit Execution Mode selector with Manual selected by default. **Manual** means the mission waits for explicit launch. **Automatic** means the deterministic dispatcher may claim and launch it. The selected mode is persisted on both the Mission and its first MissionExecution. Any agent without a supported dispatcher is restricted to Manual in the UI, and the API independently enforces the same policy even if a caller submits `AUTO`.

Pending Mission cards use execution policy rather than compatibility status alone. AUTO cards say **Queued for automatic dispatch** and may show the 45-minute warning. MANUAL cards say **Waiting for manual launch** and are not presented as stalled automatic work.

The Operations Dashboard uses the same execution-mode truth for pending attention: only pending AUTO missions can produce `Queued mission exceeds 45m`. Pending MANUAL missions remain counted as pending work but never appear as stalled automatic-queue failures. Active mission age warnings and completed, failed, and unavailable semantics are unchanged.

This consistency correction was verified in production at 2026-07-21 22:58:09 MDT after stopping `mission-control`, building from current source, and restarting it. `/`, `/missions`, and `/api/missions/state` returned HTTP 200; both user services remained enabled and active; the state endpoint reported dispatcher health `up` and legacy worker disabled. The live dashboard did not contain `Queued mission exceeds 45m: Audit and Repair Hermes Scheduled Jobs`, while that mission remained pending MANUAL.

The Missions status banner identifies the systemd-owned **Deterministic dispatcher** as the active processor using live service health from `/api/missions/state`. Cron metadata is labeled **Legacy worker**. When that preserved cron entry is disabled, the banner says **Disabled intentionally** and renders its next run as **Disabled**, never as a stale scheduled timestamp.

Eligible pending HERMES/MANUAL cards expose **Make Automatic**. The action conditionally updates the existing pending Mission and its one existing queued MANUAL MissionExecution to AUTO in one transaction. It creates neither a Mission nor an execution attempt. Repeated, stale, active, archived, non-Hermes, non-MANUAL, or execution-state-incompatible requests are rejected. Once committed, the unchanged atomic dispatcher claim path can select the pair on its next poll.

The promotion endpoint applies the same authoritative `supportsAutomaticDispatch` agent rule as Mission creation. It reads and validates the candidate agent inside the same database transaction before either mode update, then includes that observed agent ID in the conditional Mission update. An unsupported agent returns HTTP 409 with both the Mission and its queued execution still MANUAL; the dispatcher therefore cannot claim the rejected pair.

Execution-mode controls were verified in production on 2026-07-22 22:13 MDT. The required stop → build → start sequence passed, and `/api/health`, `/api/missions/state`, and `/missions` returned HTTP 200. A controlled omitted-mode Hermes mission remained pending MANUAL and unclaimed across a dispatcher poll. A controlled explicit AUTO mission and a separately promoted existing MANUAL mission were each claimed through the live atomic dispatcher path. The promoted row retained its original Mission ID and one execution record, and a repeated promotion returned HTTP 409. Both live Hermes children omitted the required debrief, so preserved debrief validation correctly failed them; the isolated deterministic dispatcher harness separately passed valid-debrief completion to `completed`/Awaiting Review. All controlled production rows were deleted by exact ID, leaving zero markers and zero active AUTO executions. Both systemd services remained enabled and active, dispatcher health was up, global concurrency remained 1, and the legacy worker remained disabled.

The shared-agent-policy P1 correction was verified in production on 2026-07-22 22:19 MDT after a fresh stop → build → start. A controlled normal Mission creation request for `writer-bot` with requested AUTO persisted the Mission and its one queued execution as MANUAL. The subsequent Make Automatic request returned HTTP 409, and a direct read confirmed both rows remained MANUAL and pending/queued. The exact controlled row was deleted. Targeted execution-mode tests proved the rejected mission is never claimed, and the full deterministic dispatcher suite, TypeScript, diff integrity, and production build passed.

The execution-mode test harness is isolated from normal Mission Control. It requires an explicit database whose name ends in `_test`, rejects the normal `DATABASE_URL` before importing Prisma, synchronizes that isolated schema, and refuses to run unless both Mission and MissionExecution are empty. It records every fixture Mission ID, deletes only those exact IDs in `finally`, relies on relation cascading for their executions, verifies both tables return to zero, and always disconnects. It never uses title matching for cleanup and never creates a temporary database. Two consecutive targeted runs plus the deterministic dispatcher suite left the established isolated database at zero missions and zero executions on 2026-07-22 22:27 MDT.

Make Automatic requires the established internal API credential before any Mission lookup or transaction. The shared `requireInternalApiSecret` helper returns HTTP 401 when the Authorization header is missing and HTTP 403 when its Bearer value does not match `INTERNAL_API_SECRET`. Existing and nonexistent mission IDs produce the same authorization response, preventing existence disclosure. The Missions UI asks the operator for that existing secret at action time, sends it through the same Bearer header used by other privileged integrations, and does not persist it. Only a valid credential reaches the existing agent-eligibility and atomic Mission/execution update. Other mutations in the same route affect result, lifecycle status, debrief path, or archival state; none can change execution mode or create a queued execution, so this bounded correction did not alter their existing authorization behavior.

The authorization correction was verified in production on 2026-07-22 22:41 MDT after the required stop → build → start sequence. Missing and invalid credentials returned HTTP 401 and 403 against an exact disposable pending Manual Hermes mission, and direct reads confirmed its Mission and one queued execution remained MANUAL. The UI-equivalent authenticated Bearer request promoted both existing rows to AUTO without creating an execution. The still-unclaimed disposable mission was deleted by exact ID. Targeted authorization/execution-mode tests, the deterministic dispatcher suite, TypeScript, diff integrity, and production build passed; both services remained active.

### Pending Mission Management

Pending Mission cards expose Edit and Cancel only while their compatibility status is `pending`. Both actions require the existing internal API Bearer credential and are revalidated authoritatively on the server. Editing updates the existing Mission fields and its existing queued execution mode in place. Title must be non-empty, priority must be low, medium, or high, and agent/execution-mode changes use the same `resolveMissionExecutionMode` policy as creation. Unsupported agents therefore remain MANUAL even if an edit requests AUTO.

Edit and Cancel acquire the same transaction-scoped PostgreSQL advisory lock as `claimNextMission` before reading or updating either row. They require one non-archived pending Mission with exactly one queued execution whose claim, start, execution, and worker identities remain unset. Because claim, edit, and cancel serialize on the same lock, a dispatcher claim that wins first makes the mutation return HTTP 409 without changing either row; an edit or cancellation that commits first is seen atomically by the next dispatcher transaction.

Cancellation preserves the Mission and MissionExecution as audit history. It changes the Mission compatibility status to `cancelled`, changes the queued attempt to the distinct durable `cancelled` execution status, and gives both the same terminal timestamp. It never maps cancellation to `failed`, never deletes either record, and never creates another attempt. The dispatcher selects only pending Mission plus queued AUTO execution pairs, so a cancelled pair cannot be claimed. The Missions board includes a separate Cancelled column; existing Failed and Awaiting Review presentation and archive behavior remain unchanged.

Pending Mission Management was verified in production on 2026-07-22 after stopping both user services, applying the additive enum synchronization, building, and restarting both services. A controlled pending edit retained the existing ID and single attempt, updated title/description/agent/priority, and applied the shared policy by forcing writer-bot AUTO to MANUAL on both rows. A controlled cancellation retained both rows with matching terminal timestamps and distinct cancelled states. Both remained unchanged across a full dispatcher poll and were removed afterward by exact ID. The isolated harness passed authorization, validation, supported/unsupported mode changes, edit/cancel success, repeat and claimed/cancelled rejection, and concurrent edit/cancel versus claim outcomes. Execution-mode, deterministic dispatcher, Operations Dashboard, TypeScript, diff integrity, production build, live route, service, and cleanup checks also passed.

Production verification completed 2026-07-21 22:46:57 MDT after the required two-service stop → build → start sequence. `/api/health`, `/api/missions/state`, and `/missions` returned HTTP 200; PostgreSQL was connected; the mission-state payload reported dispatcher health `up` and legacy worker `enabled=false`; both systemd services were enabled and active. The named existing mission retained ID `6d7ec7ee-ce3a-4809-b54e-69c293ed08ac`, status `pending`, and mode `MANUAL`.

`claimNextMission` uses one PostgreSQL common-table-expression statement with `FOR UPDATE ... SKIP LOCKED`. It selects one eligible Mission, changes exactly one queued attempt to claimed with worker/execution identity and claim/activity timestamps, and updates the compatibility Mission status to active atomically. A 12-caller concurrency test verifies that exactly one caller receives a given mission. Supporting service functions mark an execution running, record activity, or finish it as completed/failed; the deterministic dispatcher now uses the claim, running, and finish operations.

The existing Hermes cron worker remains the compatibility bridge and is intentionally unchanged in source. It still uses the global `/tmp/mission_worker_status.json` two-tick handoff and updates `Mission.status` directly. Backfilled execution attempts truthfully represent the migration-time state, but the legacy worker does not maintain the new attempt record after migration. While the deterministic dispatcher is active, the cron entry is disabled to avoid competing claims; the entry and script remain intact for immediate rollback.

### Deterministic mission dispatcher

`scripts/mission-dispatcher.ts` is a lightweight, non-LLM scheduler. It polls every 45 seconds by default, with an allowed configuration range of 30 to 60 seconds, and calls the existing atomic PostgreSQL claim operation. A claim is restricted by that service to explicit HERMES/AUTO mission and attempt pairs. The dispatcher supplies a stable process identity as `workerId` and a new UUID as `executionId`, so both identities are recorded as part of the atomic claim.

After a successful claim, all subsequent work (mission load, prompt preparation, Hermes launch, debrief validation, and completion) runs inside one guarded failure boundary. Any failure after claim transitions the execution and mission to `failed` with a persisted error so capacity is released. Automatic retries remain out of scope.

The dispatcher serially launches one fresh `hermes --oneshot` process for each claim and waits for it to exit before polling again. A database-serialized global active-count check also enforces concurrency one across multiple dispatcher processes. The temporary execution receives the claimed mission and execution identities plus a unique AgentOS debrief path. Completion requires exit code zero, a non-empty result summary, and a readable debrief with non-empty Summary, Work Performed, Evidence, and Decisions Made sections. Any missing or invalid output, nonzero exit, launch failure, or configured runtime timeout marks the durable attempt and compatibility Mission record failed.

### Stale-execution recovery and execution timeout

The dispatcher runs stale recovery before each claim. `MISSION_EXECUTION_STALE_SECONDS` configures the inactivity threshold, defaults to **1800 seconds (30 minutes)**, and must be an integer of at least 60. A claimed or running HERMES/AUTO attempt is stale when its latest persisted activity, evaluated as `COALESCE(heartbeatAt, startedAt, claimedAt, updatedAt, createdAt)`, is strictly older than the calculated cutoff. Healthy running Hermes processes refresh `heartbeatAt` every `max(10, min(60, floor(staleThreshold / 3)))` seconds; with the default threshold this is every 60 seconds.

Recovery is one PostgreSQL transaction guarded by the same transaction-scoped advisory lock used by claiming. A `FOR UPDATE ... SKIP LOCKED` candidate query joins the execution to its related Mission, requires `Mission.status = active`, and locks both rows before either update; the execution update repeats the active execution-status predicate. Stale executions attached to completed, failed, pending, or otherwise non-active Missions are not mutated or reported as recovered, and their existing capacity state is not silently changed. This makes Mission/execution recovery all-or-nothing, lets competing recovery processes cooperate, and prevents one execution from being recovered twice. A genuine recovery changes the execution to `failed`, sets `completedAt`, the explicit `recoveredAt`, and `heartbeatAt` to the recovery time, and persists an error containing prior status, execution ID, worker ID, last activity, threshold, and recovery worker. It changes the locked active compatibility Mission to `failed` with the same completion time. Because the recovered attempt is no longer claimed/running, the global active-count query immediately releases its database-backed capacity slot. A recovered mission stays failed for human review; recovery never creates a retry attempt.

`MISSION_EXECUTION_TIMEOUT_SECONDS` independently bounds a live Hermes process, defaults to **3600 seconds (60 minutes)**, and must be an integer of at least 60. On timeout the dispatcher sends SIGTERM, follows with SIGKILL after five seconds if necessary, and persists `Execution timeout exceeded <seconds> seconds` while failing both execution and mission. Terminal writes are conditional on the execution still being claimed/running, so a late process cannot overwrite an already recovered terminal result.

The current mission-state endpoint already includes the latest complete execution record, including `error` and `recoveredAt`. Failed Mission cards render the execution error and label recovered attempts with their recovery timestamp. The Operations Dashboard continues to count them as failed attention items and explicitly labels recovered stale attempts as `Recovered stale execution`.

The legacy `mission-worker` cron job, its schedule, script, and global temporary-file handoff remain installed as the rollback path. Its cron entry is disabled while the dispatcher is active because its legacy query does not participate in atomic execution claims. Rollback consists of stopping the dispatcher and re-enabling the preserved cron entry. The cron worker must not be removed until a separately authorized cutover component.

`npm run test:dispatcher` refuses the normal Mission Control database. It requires `DISPATCHER_TEST_DATABASE_URL` to identify a separate, empty database whose name ends in `_test`. The controlled no-model-cost harness verifies recent claimed/running preservation, expired claimed/running recovery, two-process recovery uniqueness, capacity release and subsequent AUTO completion, a controlled Hermes timeout, queued-to-claimed-to-running transitions, global concurrency one, valid-debrief completion, missing-debrief failure, immediate post-claim failure release, and deterministic child/row cleanup.

### Deployment and operations (systemd user services)

Long-running production ownership is **not** Hermes Desktop. Two independent systemd **user** services own production:

- `mission-control.service` — Next.js production server on port 3000 (`next start -p 3000` from a prebuilt `.next`)
- `mission-dispatcher.service` — `tsx scripts/mission-dispatcher.ts` with `MISSION_DISPATCH_CONCURRENCY=1`

Unit sources: `deploy/systemd/user/`. Installed path: `~/.config/systemd/user/`.

Both services:

- Use `WorkingDirectory=/home/oggie/mission-control`
- Run `scripts/wait-for-postgres.sh` before start (best-effort `docker start mission-control-pg`, then TCP wait on `127.0.0.1:5432`)
- Load secrets from the existing gitignored `.env` via `scripts/systemd-exec.cjs`
  - Literal dotenv parsing only (no shell `eval`, no `$VAR` / `$(cmd)` / backtick expansion)
  - Requires owner `oggie` and mode **0600**; refuses group/other-readable files
  - Never logs secret values; never stores secrets in unit files
- Use `Restart=on-failure`, `RestartSec=5`, `KillMode=control-group`
- Bound restart loops with `StartLimitIntervalSec=300` and `StartLimitBurst=5`
- Do **not** run `npm run build` in `ExecStart`
- Do **not** require each other; both primarily need PostgreSQL and can restart independently

Operator commands and journal access are documented in `MC-server-launch.md`.

#### Runtime status (operations verification 2026-07-20 20:24–20:25 MDT)

Codex review fixes applied and re-verified:

- Replaced unsafe shell/`eval` env loader with `scripts/systemd-exec.cjs` literal parser + spawn.
- No-secret fixture test `scripts/test-systemd-exec-env.cjs` PASS (literal `$()`, backticks, spaces, equals; mode 0600 gate).
- `.env` corrected to mode **0600** (`stat`: `oggie 600`).
- Units gained `StartLimitIntervalSec=300` / `StartLimitBurst=5`; controlled `/bin/false` test reached `failed` after burst (NRestarts=5), then production units restored.
- Stop → `npm run build` → install units (`diff` exact match) → `daemon-reload` → start both.
- `/api/health` → `{"ok":true,"db":"connected"}`; `/api/missions/state` and `/missions` HTTP 200.
- Dispatcher survived full 45s+ idle poll; `worker.enabled=false`.
- Ancestry under user systemd (`systemd(1)---systemd(1801)---...`); no Hermes Desktop.
- Services remain `enabled` + `active`.

#### Prior operations verification 2026-07-20 19:51–19:53 MDT

- Initial systemd cutover from Hermes-owned processes (superseded by 20:24 review-fix verification above).

#### Runtime status (dispatcher functional verification)

- **Intended runtime state while dispatcher phase is active:** production Next.js on port 3000 from a completed build, plus the deterministic dispatcher, with legacy `mission-worker` cron disabled. Prefer systemd user services over manual/Hermes terminals.
- **Startup instructions:** see `MC-server-launch.md`.
- **Last successful dispatcher functional verification:** 2026-07-20 19:29–19:30 MDT (isolated 5/5 harness + production idle poll under Hermes-owned processes before systemd cutover).
- **Stale-recovery/timeout verification:** 2026-07-21 21:19 MDT. The isolated no-model-cost harness passed twice consecutively after deterministic child cleanup, including recent/stale claimed/running cases, two-process uniqueness, capacity release, subsequent AUTO completion, and controlled timeout. Production completed stop → additive `prisma db push` → build → start; `/api/health`, `/api/missions/state`, and `/missions` returned HTTP 200. Both systemd services were enabled and active, dispatcher startup reported `poll=45s concurrency=1 stale=1800s timeout=3600s legacy_worker=preserved`, and the API reported the legacy worker disabled. The 2026-07-21 consistency re-review fix additionally requires and locks the related active Mission in the atomic candidate query; controlled completed/claimed and failed/running incompatibility cases remained unchanged, returned no false recovery IDs, and preserved their existing capacity state.
- **Final-source consistency-fix production verification:** 2026-07-21 22:12:16 MDT. After confirming the working tree contained the final `Mission.status = active` join and `FOR UPDATE OF e, m SKIP LOCKED` dual-row lock, production completed a fresh stop of both services → build from that exact source → start of both services. `/api/health` returned HTTP 200 with PostgreSQL connected, `/api/missions/state` and `/missions` returned HTTP 200, and both services were enabled and active. The dispatcher retained the same systemd MainPID with zero restarts through a 50-second observation, exceeding its 45-second poll interval. The legacy worker remained disabled, active production AUTO executions and production dispatcher test markers remained zero, and no controlled test processes remained.
- Prior verification: 2026-07-20 earlier session (four core harness assertions + production idle poll). Post-claim failure-boundary fix and fifth harness assertion completed after Codex review.

### Capture and promotion lifecycle

Quick Capture reuses the existing `Idea` model and `/api/ideas` route. A capture requires only text and defaults to the explicit `idea` type; the user may instead choose `todo`.

The planned lifecycle is:

```text
Idea → To-Do → Mission → Review → Archive
```

Each arrow represents a deliberate, bounded transition:

1. **Idea → To-Do:** update the existing capture record from the explicit `idea` type to `todo`.
2. **To-Do → Mission:** pass the capture into the existing Mission creation flow and Hermes dispatch workflow. This must not create a parallel mission system or bypass Hermes.
3. **Mission → Review:** Hermes records mission results and an AgentOS debrief path; completed work remains visible for human review.
4. **Review → Archive:** the user explicitly archives a reviewed mission. Archival remains human-in-the-loop and persistent.

The first two transitions are implemented. Idea promotion updates the same persisted record from `idea` to `todo`. To-Do promotion opens the existing Mission creation component, submits through `/api/missions`, and marks the capture as promoted only after Mission creation succeeds. Promoted captures remain preserved for lifecycle history but are omitted from the active Ideas list. Mission execution, review, debrief, and archive behavior remain unchanged. Later metadata work will be separated into small additions for project assignment, priority, tags, then search and filtering. These fields must remain optional so capture stays frictionless.

### Active capture editing

Active Ideas and To-Dos (`status = pending`) have an inline Edit action with Save and Cancel. Saving trims and validates the displayed title, updates that existing row in place, and advances only its automatic `updatedAt` modification timestamp in addition to the edited title. The client sends the version it displayed as `expectedUpdatedAt`; the API changes the row only when ID, pending status, and that timestamp still match. A stale save returns HTTP 409 without overwriting the newer value. The inline editor preserves the stale draft and error, and **Load latest for comparison** refreshes the saved card value without replacing that draft so the user can compare and retry safely. ID, type, lifecycle state, description, source, category, promotion history, and immutable `timestamp` creation time remain unchanged. Blank text is rejected. Other client-supplied lifecycle or metadata fields are not accepted.

Promoted, archived, or otherwise non-pending captures cannot be edited through the API and do not appear with an Edit action in the active list. This component does not add deletion, metadata, search, mission editing, or any other capture workflow.

Production verification completed 2026-07-21 23:28:02 MDT after mission-control stop → additive schema synchronization → build → restart. `/ideas`, `/api/ideas`, and `/api/health` returned HTTP 200 with PostgreSQL connected; all 14 active captures exposed `updatedAt`; the production schema contained the additive column; no Idea-edit test markers remained; both user services were enabled and active.

Optimistic-concurrency correction verification completed 2026-07-21 23:45:27 MDT after mission-control stop → build from the corrected source → restart. `/ideas` and `/api/ideas` returned HTTP 200. A disposable live Idea accepted the first current-version edit with HTTP 200, rejected a second edit using the original timestamp with HTTP 409, and retained the first saved value; the exact marker row was removed afterward. No Idea-edit or live-conflict markers remained, and both user services were enabled and active.

### Operations dashboard (home)

The home page opens with a compact **What needs attention** panel driven by `src/lib/operations-summary.ts` and `src/components/operations-summary.tsx`. It answers “what needs my attention right now?” using existing live data:

- Non-archived mission counts: queued (`pending`), running (`active`), awaiting review (`completed`), failed. A successful zero is shown as `0`; a failed query is explicit unavailable state and renders as `—`.
- Agent-state and host-health reads use the same availability contract and run independently. An unavailable agent read renders agent KPIs and the Collective as unavailable without erasing host health; an unavailable host read renders the Mint health values as unavailable without erasing valid agent counts. Each failure creates its own Needs Attention entry, while successful zero values remain `0`.
- Attention list: awaiting-review titles, failed titles (with recovered stale attempts identified explicitly), stalled queued/active missions older than 45 minutes, unavailable mission or Ideas/To-Do queries, PostgreSQL/web/dispatcher down or unknown, unavailable cron metadata, and legacy worker enabled (or last error while disabled).
- System pills: Mission Control web (`/api/health`), dispatcher (`systemctl --user is-active mission-dispatcher`), PostgreSQL (`SELECT 1`), legacy `mission-worker` enabled flag from Hermes cron registry. `inactive` and `failed` dispatcher states are down; transitional or unqueryable states are unknown. Reachable unhealthy web responses are down; probe failures are unknown. Both down and unknown are actionable and retain visible text labels.
- Workflow entry points: Create mission (existing modal), Review missions → `/missions`, Ideas/To-Dos → `/ideas`, Mission archive → `/missions/archive`

The Dashboard and Missions pages both obtain modal choices from `src/lib/mission-agents.ts`, which combines AgentOS registry entries with the existing Hermes sub-agent profiles and fallback behavior. It does not duplicate claim/dispatch logic, does not alter mission lifecycle, and does not add charts or Command Palette work.

### Explicit archive state

Completed and archived are separate concepts. Completed missions remain on the active mission board until explicitly archived, which supports review before removal from the working view.

### Shared responsive shell

Navigation and layout behavior are centralized in the root layout and sidebar rather than repeated per page. The archive is a first-class navigation route, and mobile responsiveness is handled by the shared shell.

### Workflow-led modernization

Visual work must support Mission Control's operational model: Hermes as the execution gateway, AgentOS as the canonical system of record, Graphify as the knowledge-graph layer, and explicit human review of mission results and debriefs before archival. Foundation tokens and shell responsiveness are complete. The next roadmap work prioritizes mission review and retrieval, Ideas and To-Do capture, and dashboard operational clarity before the command palette.

## Completed Phases

### Original AgentOS Integration Roadmap

- Phase 0: Added guarded AgentOS filesystem readers and established the integration baseline.
- Phase 1: Added the AgentOS summary widget to the main dashboard.
- Phase 2: Added agent heartbeat reporting, host-health APIs/reporters, live Hermes calendar data, and Graphify dashboard integration.
- Phase 3: Added Agents and Projects views backed by AgentOS registry, heartbeat, index, and ledger data.
- Phase 4: Added recent decisions and knowledge summaries to the dashboard.
- Phase 5: Added the AgentOS document library with Markdown viewing plus Homelab device and service registry views.

Additional completed workflow work includes mission creation and Kanban presentation, AgentOS-backed agent assignment choices, idea capture, mission result persistence, mission debrief lifecycle support, explicit mission archival, and clickable archived debriefs.

### Mission Control v2 Redesign

Phase 2.1 foundation status:

- Completed: refined global palette and design tokens.
- Completed: responsive Sidebar and Root Layout with stable desktop/mobile behavior.
- Completed: Phase 2.1.1 archive system, restart persistence, archive page, clickable archived debrief viewer, and archive search/filtering.
- Deferred: global command palette, to follow stable mission, capture, and dashboard workflows.

Phase 2.2 is ordered around operational workflow improvements rather than an appearance-first dashboard redesign. Archive search and agent filtering originated as the remaining Phase 2.1.1 item and was completed at the start of Phase 2.2 implementation. Active mission review/filtering, Quick Capture, the explicit Idea → To-Do → Mission promotion workflow, mission-board freshness/worker visibility, the database-backed execution-state/atomic-claim foundation, the lightweight deterministic dispatcher, and bounded stale-execution recovery/runtime timeout are complete. Automatic retries and parallel execution remain future work. See `docs/phase2-plan.md` for the authoritative roadmap and checklist.

## Operational Notes and Known Limitations

- There is no user authentication layer. Deployment beyond a trusted local network requires an authentication and authorization review.
- The mission creation route contains a shared-secret check but currently does not reject a failed check; this should be treated as unauthenticated behavior.
- The current ESLint 9 configuration fails before source evaluation with a circular configuration serialization error.
- Production builds succeed but emit a non-fatal Turbopack NFT trace warning caused by broad filesystem access traced through `src/lib/agentos.ts`.
- The dashboard depends on PostgreSQL and local AgentOS paths being available to the Next.js server process.
- Reporter freshness depends on external scheduling; Mission Control does not itself run every reporter continuously.

## Build and Runtime

### Mandatory production verification sequence

Use this sequence for every production verification:

1. Stop the running Next.js server.
2. Run the production build and wait for successful completion.
3. Start the server from the completed build.
4. Perform live UI verification.

Do not run `next build` while a production server is using the same `.next` directory. Replacing generated output beneath a running server can leave its in-memory asset references out of sync with the files on disk, causing JavaScript or CSS asset failures after refresh.

Common commands:

```bash
npm run dev
npm run build
npm run start -- -p 3000
npm run db:push
```

Required environment configuration includes `DATABASE_URL`. Integrations may also use `INTERNAL_API_SECRET`, `AGENTOS_ROOT`, and the reporter-specific Mission Control URL or secret settings documented in `.env.example` and the reporter scripts.

When changing architecture, persistence, routes, or phase status, update this document together with the relevant implementation and the AgentOS project memory log.
