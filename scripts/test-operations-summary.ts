/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import assert from "node:assert/strict";
import path from "node:path";
import {
  classifySystemdActiveState,
  getOperationsSummary,
  OPS_ACTION_QUEUE_MAX_AGE_MS,
  probeDispatcherHealth,
  probeWebHealth,
  readOpsActionQueue,
  readUfoReadiness,
  UFO_READINESS_MAX_AGE_MS,
  type ServiceHealth,
} from "../src/lib/operations-summary";
import type { CronJob } from "../src/lib/agentos";
import type { AgentState } from "@prisma/client";
import { getMissionAgentChoices } from "../src/lib/mission-agents";

const disabledWorker: CronJob = {
  id: "mission-worker",
  name: "mission-worker",
  enabled: false,
  next_run_at: null,
  last_run_at: null,
  last_status: "ok",
  last_error: null,
  deliver: null,
};

const fixturePath = (name: string) => path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "operations-summary",
  name,
);

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    readAgentState: async () => [],
    readHostHealth: async () => [],
    readUfoReadiness: async () => ({
      generatedAt: "2026-07-20T00:00:00Z",
      decision: "PASS" as const,
      publicationAllowed: true,
      publicationBlockers: [],
      warnings: [],
      recommendedAction: "Ready.",
    }),
    readOpsActionQueue: async () => ({
      generatedAt: "2026-07-20T00:00:00Z",
      open: 0,
      acknowledged: 0,
      byPriority: { P0: 0, P1: 0, P2: 0, P3: 0 },
      actions: [],
    }),
    readMissions: async () => [],
    readPendingIdeas: async () => 0,
    probePostgres: async (): Promise<ServiceHealth> => "up",
    probeDispatcher: async (): Promise<ServiceHealth> => "up",
    probeWeb: async (): Promise<ServiceHealth> => "up",
    readCronJobs: async () => [disabledWorker],
    now: () => Date.UTC(2026, 6, 20),
    ...overrides,
  };
}

async function assertAttention(
  id: string,
  overrides: Record<string, unknown>,
) {
  const summary = await getOperationsSummary(dependencies(overrides));
  assert(summary.attention.some((item) => item.id === id), `Expected attention item ${id}`);
}

async function main() {
  const contractNow = Date.parse("2026-08-05T08:00:00-06:00");
  const validUfo = await readUfoReadiness(fixturePath("ufo-valid.json"), {
    now: () => contractNow,
  });
  assert.equal(validUfo.decision, "WARN");
  assert.equal(validUfo.publicationAllowed, true);
  await assert.rejects(
    readUfoReadiness(fixturePath("ufo-valid.json"), {
      now: () => Date.parse("2026-08-05T20:15:00.001-06:00"),
    }),
    /stale/,
  );
  await assert.rejects(
    readUfoReadiness(fixturePath("ufo-invalid-timestamp.json"), { now: () => contractNow }),
    /ISO 8601 timestamp/,
  );
  await assert.rejects(
    readUfoReadiness(fixturePath("ufo-invalid-schema.json"), { now: () => contractNow }),
    /Invalid UFO readiness contract/,
  );
  assert.equal(UFO_READINESS_MAX_AGE_MS, 36 * 60 * 60 * 1000);
  console.log("PASS actual UFO reader accepts fresh fixtures and rejects stale, invalid timestamp, and invalid schema fixtures");

  const validOps = await readOpsActionQueue(fixturePath("ops-valid.json"), {
    now: () => contractNow,
  });
  assert.equal(validOps.open, 1);
  assert.equal(validOps.acknowledged, 1);
  assert.equal(validOps.actions[1]?.status, "acknowledged");
  await assert.rejects(
    readOpsActionQueue(fixturePath("ops-valid.json"), {
      now: () => Date.parse("2026-08-05T20:00:00.001-06:00"),
    }),
    /stale/,
  );
  await assert.rejects(
    readOpsActionQueue(fixturePath("ops-invalid-timestamp.json"), { now: () => contractNow }),
    /ISO 8601 timestamp/,
  );
  await assert.rejects(
    readOpsActionQueue(fixturePath("ops-invalid-schema.json"), { now: () => contractNow }),
    /summary does not match its actions/,
  );
  assert.equal(OPS_ACTION_QUEUE_MAX_AGE_MS, 36 * 60 * 60 * 1000);
  console.log("PASS actual Ops Action Queue reader accepts fresh fixtures and rejects stale, invalid timestamp, and inconsistent schema fixtures");

  assert.equal(classifySystemdActiveState("active\n"), "up");
  assert.equal(classifySystemdActiveState("inactive\n"), "down");
  assert.equal(classifySystemdActiveState("failed\n"), "down");
  assert.equal(classifySystemdActiveState("activating\n"), "unknown");
  assert.equal(classifySystemdActiveState("deactivating\n"), "unknown");
  assert.equal(await probeDispatcherHealth(async () => ({ stdout: "active\n" })), "up");
  for (const state of ["inactive", "failed"]) {
    assert.equal(
      await probeDispatcherHealth(async () => Promise.reject({ stdout: `${state}\n` })),
      "down",
    );
  }
  assert.equal(await probeDispatcherHealth(async () => Promise.reject(new Error("systemctl unavailable"))), "unknown");
  console.log("PASS dispatcher active/inactive/failed/transitional classification");

  await assertAttention("sys-dispatcher", {
    probeDispatcher: async () => "unknown" as const,
  });
  console.log("PASS systemctl unavailable is unknown and actionable");

  for (const postgres of ["down", "unknown"] as const) {
    const summary = await getOperationsSummary(dependencies({
      probePostgres: async () => postgres,
    }));
    assert.equal(summary.system.postgres, postgres);
    assert(summary.attention.some((item) =>
      item.id === "sys-postgres" && item.label === (
        postgres === "down" ? "PostgreSQL is down" : "PostgreSQL status is unavailable"
      ),
    ));
  }
  console.log("PASS PostgreSQL down/unknown labels and attention");

  const dispatcherDown = await getOperationsSummary(dependencies({
    probeDispatcher: async () => "down" as const,
  }));
  assert(dispatcherDown.attention.some((item) =>
    item.id === "sys-dispatcher" && item.label === "Deterministic dispatcher is down",
  ));
  console.log("PASS dispatcher down is actionable");

  assert.equal(
    await probeWebHealth(async () => ({ ok: false, json: async () => ({ ok: false }) })),
    "down",
  );
  assert.equal(
    await probeWebHealth(async () => ({ ok: true, json: async () => ({ ok: false }) })),
    "down",
  );
  assert.equal(await probeWebHealth(async () => Promise.reject(new Error("timeout"))), "unknown");
  await assertAttention("sys-web", { probeWeb: async () => "down" as const });
  await assertAttention("sys-web", { probeWeb: async () => "unknown" as const });
  console.log("PASS web health down and probe unavailable are actionable");

  await assertAttention("sys-legacy-worker-unavailable", {
    readCronJobs: async () => {
      throw new Error("unavailable");
    },
  });
  console.log("PASS cron metadata unavailable is actionable");

  const missionsUnavailable = await getOperationsSummary(dependencies({
    readMissions: async () => {
      throw new Error("unavailable");
    },
  }));
  assert.equal(missionsUnavailable.missions.available, false);
  assert.equal(missionsUnavailable.missions.queued, null);
  assert(missionsUnavailable.attention.some((item) => item.id === "data-missions"));
  console.log("PASS database mission query unavailable is null and actionable");

  const ideasUnavailable = await getOperationsSummary(dependencies({
    readPendingIdeas: async () => {
      throw new Error("unavailable");
    },
  }));
  assert.deepEqual(ideasUnavailable.pendingIdeas, { available: false, value: null });
  assert(ideasUnavailable.attention.some((item) => item.id === "data-ideas"));
  console.log("PASS Ideas query unavailable is null and actionable");

  const healthy = await getOperationsSummary(dependencies());
  assert.equal(healthy.missions.queued, 0);
  assert.deepEqual(healthy.pendingIdeas, { available: true, value: 0 });
  assert.equal(healthy.attention.length, 0);
  console.log("PASS successful zero remains authoritative data");

  const blockedUfo = await getOperationsSummary(dependencies({
    readUfoReadiness: async () => ({
      generatedAt: "2026-07-29T14:00:00Z",
      decision: "BLOCK" as const,
      publicationAllowed: false,
      publicationBlockers: ["Gather health state is failed, not healthy."],
      warnings: [],
      recommendedAction: "Resolve blockers before building or deploying.",
    }),
  }));
  assert.equal(blockedUfo.ufoReadiness.value?.publicationAllowed, false);
  assert(blockedUfo.attention.some((item) =>
    item.id === "ufo-publication-blocked"
      && item.label.includes("Gather health state is failed"),
  ));
  console.log("PASS UFO BLOCK contract is visible and actionable");

  const ufoUnavailable = await getOperationsSummary(dependencies({
    readUfoReadiness: async () => {
      throw new Error("missing");
    },
  }));
  assert.equal(ufoUnavailable.ufoReadiness.available, false);
  assert(ufoUnavailable.attention.some((item) => item.id === "data-ufo-readiness"));
  console.log("PASS missing UFO contract fails visibly");

  const actionQueue = await getOperationsSummary(dependencies({
    readOpsActionQueue: async () => ({
      generatedAt: "2026-08-04T14:00:00Z",
      open: 4,
      acknowledged: 1,
      byPriority: { P0: 1, P1: 1, P2: 2, P3: 0 },
      actions: [
        { id: "urgent", priority: "P0" as const, title: "Core service down", status: "open" as const, acknowledgedAt: null, handsOff: false },
        { id: "seen", priority: "P1" as const, title: "Known outage", status: "open" as const, acknowledgedAt: "2026-08-04T14:01:00Z", handsOff: false },
        { id: "mac", priority: "P2" as const, title: "Mac Mini unavailable", status: "open" as const, acknowledgedAt: null, handsOff: true },
      ],
    }),
  }));
  assert.equal(actionQueue.opsActionQueue.value?.open, 4);
  assert(actionQueue.attention.some((item) => item.id === "ops-urgent" && item.severity === "critical"));
  assert(!actionQueue.attention.some((item) => item.id === "ops-seen"));
  assert(!actionQueue.attention.some((item) => item.id === "ops-mac"));
  console.log("PASS Ops Action Queue exposes counts and promotes only unacknowledged P0/P1 actions");

  const actionQueueUnavailable = await getOperationsSummary(dependencies({
    readOpsActionQueue: async () => { throw new Error("missing"); },
  }));
  assert.equal(actionQueueUnavailable.opsActionQueue.available, false);
  assert(actionQueueUnavailable.attention.some((item) => item.id === "data-ops-action-queue"));
  console.log("PASS missing Ops Action Queue contract fails visibly");

  const now = Date.UTC(2026, 6, 20);
  const missionSemantics = await getOperationsSummary(dependencies({
    now: () => now,
    readMissions: async () => [
      { id: "old-auto", title: "Old automatic", status: "pending", executionMode: "AUTO", createdAt: new Date(now - 46 * 60_000), executions: [] },
      { id: "old-manual", title: "Old manual", status: "pending", executionMode: "MANUAL", createdAt: new Date(now - 90 * 60_000), executions: [] },
      { id: "recent-auto", title: "Recent automatic", status: "pending", executionMode: "AUTO", createdAt: new Date(now - 44 * 60_000), executions: [] },
      { id: "old-active", title: "Old active", status: "active", executionMode: "MANUAL", createdAt: new Date(now - 46 * 60_000), executions: [] },
      { id: "completed", title: "Completed work", status: "completed", executionMode: "AUTO", createdAt: new Date(now), executions: [] },
      { id: "failed", title: "Failed work", status: "failed", executionMode: "AUTO", createdAt: new Date(now), executions: [{ error: "failure", recoveredAt: null }] },
    ],
  }));
  assert.equal(missionSemantics.missions.queued, 3);
  assert.equal(missionSemantics.missions.running, 1);
  assert.equal(missionSemantics.missions.awaitingReview, 1);
  assert.equal(missionSemantics.missions.failed, 1);
  assert.equal(missionSemantics.missions.stalled, 2);
  assert(missionSemantics.attention.some((item) => item.id === "stalled-queued-old-auto"));
  assert(!missionSemantics.attention.some((item) => item.id === "stalled-queued-old-manual"));
  assert(!missionSemantics.attention.some((item) => item.id === "stalled-queued-recent-auto"));
  assert(missionSemantics.attention.some((item) => item.id === "stalled-active-old-active"));
  assert(missionSemantics.attention.some((item) => item.id === "review-completed"));
  assert(missionSemantics.attention.some((item) => item.id === "failed-failed"));
  console.log("PASS mission stalled semantics: old AUTO queued, old MANUAL skipped, recent AUTO skipped, active/complete/failed unchanged");

  const recoveredStale = await getOperationsSummary(dependencies({
    readMissions: async () => [{
      id: "stale-mission",
      title: "Recovered work",
      status: "failed",
      executionMode: "AUTO",
      createdAt: new Date(0),
      executions: [{ error: "Stale execution recovered", recoveredAt: new Date() }],
    }],
  }));
  assert(recoveredStale.attention.some((item) =>
    item.id === "failed-stale-mission" && item.label === "Recovered stale execution: Recovered work",
  ));
  console.log("PASS stale recovery is explicit in dashboard attention");

  const agentUnavailable = await getOperationsSummary(dependencies({
    readAgentState: async () => {
      throw new Error("unavailable");
    },
  }));
  assert.deepEqual(agentUnavailable.agentState, { available: false, value: null });
  assert(agentUnavailable.attention.some((item) => item.id === "data-agent-state"));
  console.log("PASS agent-state unavailable cannot render as 0 / 0");

  const agent: AgentState = {
    id: "hermes",
    name: "Hermes",
    emoji: null,
    role: null,
    status: "online",
    lastActive: null,
    tasksCompleted: 0,
    totalCost: 0,
    currentTask: null,
    recentActivity: [],
    updatedAt: new Date(0),
  };
  const hostUnavailable = await getOperationsSummary(dependencies({
    readAgentState: async () => [agent],
    readHostHealth: async () => {
      throw new Error("unavailable");
    },
  }));
  assert.equal(hostUnavailable.hostHealth.available, false);
  assert.deepEqual(hostUnavailable.agentState.value && {
    online: hostUnavailable.agentState.value.online,
    total: hostUnavailable.agentState.value.total,
    totalTasks: hostUnavailable.agentState.value.totalTasks,
  }, { online: 1, total: 1, totalTasks: 0 });
  assert(hostUnavailable.attention.some((item) => item.id === "data-host-health"));
  console.log("PASS host-health unavailable preserves valid agent-state data");

  const zeroAgents = await getOperationsSummary(dependencies());
  assert.deepEqual(zeroAgents.agentState.value && {
    online: zeroAgents.agentState.value.online,
    total: zeroAgents.agentState.value.total,
    totalTasks: zeroAgents.agentState.value.totalTasks,
  }, { online: 0, total: 0, totalTasks: 0 });
  console.log("PASS valid agent-state zero values remain zero");

  const registry = async () => ({
    version: 1,
    last_updated: "2026-07-20T00:00:00Z",
    agents: {
      hermes: {
        name: "Hermes",
        role: "Primary",
        strengths: [],
        weaknesses: [],
        preferred_model: null,
        fallback_model: null,
        available_toolsets: [],
        current_projects: [],
        platforms: [],
        permissions: {},
        state: "active",
        last_active: null,
      },
    },
  });
  const dashboardChoices = await getMissionAgentChoices(registry);
  const missionsChoices = await getMissionAgentChoices(registry);
  assert.deepEqual(dashboardChoices, missionsChoices);
  assert.deepEqual(
    dashboardChoices.map(({ id, name }) => ({ id, name })),
    [
      { id: "hermes", name: "Hermes" },
      { id: "research-bot", name: "Research Bot" },
      { id: "web-bot", name: "Web Bot" },
      { id: "writer-bot", name: "Writer Bot" },
      { id: "mini", name: "Mini" },
    ],
  );
  console.log("PASS Dashboard and Missions agent IDs/labels are identical");
}

void main();
