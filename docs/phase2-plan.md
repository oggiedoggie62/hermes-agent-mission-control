# Mission Control v2 — Redesign Plan (Phase 2)

## Vision
Transform Mission Control from a "read-only summary dashboard" into a "proactive operations hub." The redesign will focus on higher information density, more intuitive workflows for mission management, and a more cohesive, modern "command center" aesthetic.

## 1. UI/UX Modernization (The "Aesthetic" Layer)

### 1.1 Unified Design System
- **Refined Glassmorphism:** Move away from heavy `rgba` backgrounds toward more subtle, layered surfaces using Tailwind v4's color palette.
- **Enhanced Typography:** Improve hierarchy and readability with better use of weights and tracking.
- **Consistent Iconography:** Standardize icon usage and sizing across all components.
- **Improved Spacing:** Implement a more rigorous grid and spacing system to prevent "clutter" in high-density views.

### 1.2 Interactive Elements
- **Smooth Transitions:** Use Framer Motion (if appropriate) or standard CSS transitions for page entries, hover states, and UI state changes.
- **Micro-interactions:** Add subtle feedback for button clicks, status changes, and hover effects.
- **Global Command Palette (Command+K):** Implement a fast search/action menu to navigate pages and trigger common agent commands.

## 2. Workflow Improvements (The "Utility" Layer)

### 2.1 Mission Management (Kanban 2.0)
- **Enhanced Kanban Cards:** Add more context to mission cards (e.g., estimated time, priority icons, agent quick-links).
- **Filtering & Searching:** Allow users to filter missions by agent, priority, or status.
- **Drill-down View:** A dedicated side-panel or modal for viewing full mission details without leaving the board.

### 2.2 Agent Operations
- **Agent Detail Pages:** Dedicated `/agents/[id]` routes with historical task data, memory summaries, and status logs.
- **Quick Actions:** Introduce "Command" buttons on agent cards (e.g., `Sync`, `Restart`, `Pause`)—these will dispatch to the Hermes API.
- **Memory Visibility:** Integrate "Knowledge Gaps" and "Memory Health" directly into the agent view.

### 2.3 Homelab & System Monitoring
- **Visual Heatmaps:** Use more intuitive visual representations for CPU/GPU/RAM/Storage (e.g., ring charts, progress bars).
- **Service Health Dashboard:** A more structured view of all registered services from AgentOS.

## 3. Proposed Implementation Roadmap

### Phase 2.1: Foundation & Design Tokens
- [x] Update `globals.css` with a refined color palette and design tokens.
- [x] Refactor `Sidebar` and `Layout` for better responsiveness and layout stability.
- [x] Record the Phase 2.1.1 mission lifecycle enhancement discovered during foundation work.

#### Phase 2.1.1: Mission Lifecycle Improvements

This subsection records an architectural enhancement discovered during Phase 2.1. It supports human review and debrief access before archival; it was not part of the original visual redesign scope.

- [x] Mission archive system.
- [x] Archive persistence across restarts.
- [x] Archive page.
- [x] Clickable archived debrief viewer.
- [x] Archive search and filtering.

#### Effective Phase 2.1 Status

- [x] Design tokens.
- [x] Responsive Sidebar and Layout.
- [x] Mission archive system (Phase 2.1.1).
- [x] Archive persistence.
- [x] Archive debrief viewer.
- [ ] Command Palette (deferred until core operational workflows are defined and stable).

### Phase 2.2: Operational Workflow Improvements

Phase 2.2 prioritizes daily operational value over appearance-only redesign. Work should proceed in small, independently testable groups.

1. **Mission execution reliability**
   - [x] Add a read-only endpoint for current non-archived mission state and Hermes mission-worker schedule state.
   - [x] Refresh the Missions board every 20 seconds and immediately when its browser tab regains focus.
   - [x] Show pending missions as queued with elapsed duration and completed missions as Awaiting Review.
   - [x] Show the mission worker's last run, expected next run, enabled state, and last result.
   - [x] Warn when a pending or active mission is at least 45 minutes old. Pending age is exact from creation; active age remains total mission age until execution timestamps exist.
   - [x] Add database-backed execution attempts with queued, claimed, running, completed, and failed states plus durable timing, identity, worker, attempt, heartbeat/activity, and error fields.
   - [x] Add an atomic PostgreSQL claim operation and verify that 12 concurrent workers produce exactly one claimant.
   - [x] Add `HERMES` execution provider and `MANUAL | AUTO` execution mode metadata, migrating existing missions to `MANUAL` so the future dispatcher cannot select them accidentally.
   - [x] Add and verify a lightweight deterministic dispatcher that polls explicit HERMES/AUTO work every 45 seconds, uses the atomic claim operation, records dispatcher/execution identity, validates result/debrief output, launches one temporary Hermes execution, and enforces database-backed global concurrency 1.
     - Post-claim guarded failure boundary: any failure after claim fails the execution/mission and releases capacity (no retries; not general stale recovery).
     - Isolated harness assertions: queued→claimed→running, concurrency 1, valid debrief completion, missing debrief failure, post-claim failure then subsequent claim.
     - Production verification timestamps are recorded in `MISSION_CONTROL.md` and the AgentOS work log after each successful stop → build → start → live check.
   - [x] Preserve the legacy global temporary-file cron worker unchanged as a rollback path; disable its cron entry while the dispatcher is active to prevent competing claims.
   - [x] **Deployment & Operations:** systemd user services for Mission Control web and deterministic dispatcher so production survives Hermes Desktop/terminal exit.
     - Units: `mission-control.service`, `mission-dispatcher.service` under `~/.config/systemd/user/` (sources in `deploy/systemd/user/`).
     - Independent services (no mutual Requires); both preflight-wait for PostgreSQL; secrets from existing `.env` via `scripts/systemd-exec.cjs` (literal load, mode 0600 required).
     - Restart bounds: `StartLimitIntervalSec=300`, `StartLimitBurst=5`, `Restart=on-failure`, `RestartSec=5`.
     - Re-verified 2026-07-20 20:24 MDT after Codex review fixes: health/state/missions HTTP 200, full dispatcher poll interval, user-systemd ancestry, `.env` mode 0600, installed units match repo, start-limit behavior proven then restored.
   - [ ] Retire the legacy global temporary-file handoff only in a separately authorized cutover.
   - [x] Add bounded stale-execution recovery and execution timeout.
     - Default inactivity threshold: `MISSION_EXECUTION_STALE_SECONDS=1800`; default hard Hermes runtime: `MISSION_EXECUTION_TIMEOUT_SECONDS=3600`; both require at least 60 seconds.
     - Recover stale claimed/running attempts atomically with advisory locking plus `FOR UPDATE ... SKIP LOCKED`; require and lock the related active Mission before either update, persist recovery time and diagnostics, fail both records consistently, and release global capacity without retrying. Incompatible non-active Missions are skipped without execution mutation, false recovery results, or capacity changes.
     - Heartbeat healthy Hermes executions, condition terminal writes on an active attempt, surface recovery errors/timestamps through mission state, Mission cards, and Dashboard attention.
     - No-model-cost harness covers recent claimed/running preservation, active-Mission stale claimed/running recovery, completed/claimed and failed/running incompatibility preservation, exact recovery results, skipped-row capacity preservation, two-process uniqueness, compatible capacity release, subsequent AUTO completion, hard timeout, and two consecutive clean stability runs.
     - Production re-verified 2026-07-21 21:19 MDT: additive schema sync and stop → build → start succeeded; health/state/missions HTTP 200; both systemd services enabled/active; concurrency remained 1; legacy worker remained preserved and disabled.
     - Final-source consistency fix re-verified 2026-07-21 22:12:16 MDT after confirming the active-Mission join and `FOR UPDATE OF e, m SKIP LOCKED`: fresh two-service stop → build → start passed; health/state/missions HTTP 200; PostgreSQL connected; both services enabled/active; dispatcher survived a full 45-second poll interval with the same MainPID and zero restarts; legacy worker disabled; active AUTO executions, production test markers, and controlled test processes all zero.
   - [x] Correct Mission Dispatch UX and mission-processor status truth.
     - New Mission defaults Hermes assignments to HERMES/AUTO, exposes explicit Manual selection, and enforces MANUAL for agents without a supported dispatcher in both UI and API.
     - Pending cards distinguish `Queued for automatic dispatch` from `Waiting for manual launch`; manual work does not receive the automatic-queue stalled label.
     - Operations Dashboard includes execution mode in its mission summary and limits pending 45-minute stalled attention to AUTO; pending MANUAL work never appears as an automatic-queue failure, while active/completed/failed/unavailable semantics remain unchanged.
     - Dashboard consistency re-verified 2026-07-21 22:58:09 MDT after mission-control stop → build → restart: `/`, `/missions`, and `/api/missions/state` HTTP 200; both services enabled/active; live old MANUAL mission produced no queued-stalled attention.
     - Missions banner reports deterministic dispatcher health and labels the preserved cron entry as the intentionally disabled legacy worker, suppressing misleading disabled next-run timestamps.
     - Isolated tests cover persisted default/explicit/unsupported modes, truthful labels, disabled legacy next-run suppression, and the existing dispatcher selection/completion harness.
     - Existing `Audit and Repair Hermes Scheduled Jobs` remains unchanged as HERMES/MANUAL; safest supported AUTO path is recreation through the verified dialog rather than direct row mutation.
     - Verified 2026-07-21 22:46:57 MDT: isolated creation/label/banner tests and the full dispatcher harness passed; final stop → build → start passed; health/state/missions HTTP 200; dispatcher health up; legacy worker disabled; both services enabled/active; named mission unchanged.
   - [ ] Add automatic retries only in a separately bounded reliability component.
   - [ ] Increase controlled concurrency only after single-execution dispatch is stable.
2. **Mission review and retrieval**
   - [x] Complete archive search and filtering from Phase 2.1.1 at the start of Phase 2.2 implementation.
   - [x] Add active-board search plus agent, priority, and status filtering.
   - [x] Add compact shown/total and completed-awaiting-review counts.
   - [x] Preserve and verify mission creation, debrief access, and explicit human review before archival.
3. **Ideas and To-Do capture**
   - Planned lifecycle: **Idea → To-Do → Mission → Review → Archive**.
   - [x] Add one-field Quick Capture with Enter-to-save and Idea as the default type.
   - [x] Represent Idea and To-Do as explicit persisted types on the existing `Idea` model.
   - [x] Add an optional Idea/To-Do selector, immediate feedback, and clear-on-success behavior.
   - [x] Render newly captured items immediately in the existing Ideas view and verify restart persistence.
   - [x] Promote an Idea to a To-Do as one explicit persisted lifecycle transition on the existing record.
   - [x] Promote a To-Do into a Mission through the existing Mission creation and Hermes dispatch workflow.
   - [x] Edit active Ideas and To-Dos in place.
     - Inline Edit, Save, and Cancel update only displayed text plus automatic modification timestamp.
     - Preserve ID, type, lifecycle/promotion state, creation timestamp, and all unrelated fields.
     - Reject blank text, retain failed-save drafts for retry, and disallow promoted/archived/non-active record edits.
     - Require optimistic concurrency with the displayed `updatedAt`: update only matching pending rows, return HTTP 409 for stale versions, retain the stale draft, and allow the latest saved value to be loaded for comparison without discarding that draft.
     - Targeted isolated coverage includes Idea and To-Do edits, invariant preservation, Cancel, blank rejection, the real route-backed stale conflict and draft/error state, a fresh-version retry, and promoted-record rejection.
     - Verified 2026-07-21 23:28:02 MDT after mission-control stop → additive schema sync → build → restart: Ideas page/API/health HTTP 200, active records expose modification timestamps, no test markers, both services enabled/active.
     - Optimistic-concurrency correction verified 2026-07-21 23:45:27 MDT after mission-control stop → corrected-source build → restart: Ideas page/API HTTP 200; controlled first save HTTP 200; stale second save HTTP 409; first value remained persisted; marker cleanup complete; both services enabled/active.
   - [ ] Add project assignment in a later bounded metadata component.
   - [ ] Add priority and tags in a later bounded metadata component.
   - [ ] Add Ideas/To-Dos search and filtering after the metadata and lifecycle transitions are stable.
   - Keep Hermes as the execution gateway and AgentOS as the canonical system of record where applicable.
4. **Dashboard operational usability**
   - [x] **Operations Dashboard (home):** surface “what needs attention” from live mission/health/service data — mission status counts, actionable exceptions (awaiting review, failed, stalled >45m, dispatcher/web/DB/legacy-worker problems), compact system health, and workflow entry points (create mission, review missions, Ideas/To-Dos, archive).
     - Reuses Prisma mission/idea queries, `/api/health` semantics, Hermes cron worker metadata, and `systemctl --user is-active mission-dispatcher` for service health.
     - Distinguishes authoritative zero values from unavailable mission and Ideas/To-Do reads; unavailable values render as `—` and create Needs Attention entries.
     - Reads agent state and host health independently with the same availability contract, so either source may fail without erasing valid data from the other; unavailable legacy KPI values never render as zero.
     - Treats inactive/failed health as down and unqueryable/timeout/transitional health as unknown; both states are actionable and visibly labeled.
     - Reuses one authoritative agent-choice helper for the Dashboard and `/missions` New Mission modals.
     - Targeted semantics include PostgreSQL down/unknown attention, dispatcher down attention, shared modal choices, independent agent/host failures, and authoritative zero behavior. Controlled live failure states verified 2026-07-20. No charts, Command Palette, lifecycle, dispatcher, or systemd architecture changes.
   - Prioritize actionable status, exceptions, recent decisions, and workflow entry points.
   - Add or refactor shared cards and health presentation only when they improve operational clarity.
5. **Command Palette**
   - Implement after the primary destinations and actions above are stable.
   - Use it as a keyboard-accessible navigation and workflow accelerator, not as a substitute for clear page-level controls.

### Phase 2.3: Feature Deep-Dives (Iterative)
- **Missions:** Kanban drill-down, richer review context, and agent quick-links.
- **Agents:** Profile pages + Quick Actions.
- **Library/Ideas:** Deeper reading, organization, and promotion workflows.

### Phase 2.4: Verification & Polish
- Regression testing (ensure all existing data still flows correctly).
- UI polish and animation tuning.
- Final audit against AgentOS connectivity.

## 4. Product and Architecture Guardrails

- Mission Control is an operational workspace, not an appearance-first dashboard.
- Hermes remains the execution gateway for agent work and commands.
- AgentOS remains the canonical system of record for durable knowledge, registries, decisions, and debriefs.
- Graphify remains the knowledge-graph layer.
- Mission review and debrief workflows must remain visible and accessible.
- Archival remains an explicit human-in-the-loop action after review.
- Visual changes must support these workflows rather than replace or obscure them.
- Changes should remain small and testable, with a production build, live UI verification where applicable, architecture documentation updates when needed, and a mandatory AgentOS work-log entry.

### Production Verification Sequence

Every production verification must use this order:

1. Stop the running Next.js server.
2. Build the application and wait for the build to complete successfully.
3. Start the Next.js server from the completed build.
4. Perform live UI verification against that running server.

Never run `next build` over `.next` while a production server is using that directory. This sequence prevents the running server from retaining stale asset references while generated files are replaced.
