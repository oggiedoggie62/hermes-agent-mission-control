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
   - [ ] Retire the legacy global temporary-file handoff only when the deterministic dispatcher is ready; the current cron bridge remains unchanged for compatibility.
   - [ ] Add the deterministic dispatcher, temporary per-mission Hermes executions, recovery, and controlled concurrency only after database-backed execution state is stable.
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
   - [ ] Add project assignment in a later bounded metadata component.
   - [ ] Add priority and tags in a later bounded metadata component.
   - [ ] Add Ideas/To-Dos search and filtering after the metadata and lifecycle transitions are stable.
   - Keep Hermes as the execution gateway and AgentOS as the canonical system of record where applicable.
4. **Dashboard operational usability**
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
