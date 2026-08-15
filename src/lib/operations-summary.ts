/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { getCronJobs, type CronJob } from "@/lib/agentos";
import type { AgentState, HostHealth } from "@prisma/client";

const execFileAsync = promisify(execFile);

export const STALLED_WARNING_MS = 45 * 60 * 1000;
export const UFO_READINESS_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export const OPS_ACTION_QUEUE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const CONTRACT_FUTURE_SKEW_MS = 5 * 60 * 1000;
export type ServiceHealth = "up" | "down" | "unknown";

export interface Availability<T> {
  available: boolean;
  value: T | null;
}

export interface AttentionItem {
  id: string;
  severity: "critical" | "warning";
  label: string;
  href: string;
}

export interface UfoReadiness {
  generatedAt: string;
  decision: "PASS" | "WARN" | "BLOCK";
  publicationAllowed: boolean;
  publicationBlockers: string[];
  warnings: string[];
  recommendedAction: string;
}

export interface OpsAction {
  id: string;
  priority: "P0" | "P1" | "P2" | "P3";
  title: string;
  status: "open" | "acknowledged" | "resolved";
  acknowledgedAt: string | null;
  handsOff: boolean;
}

export interface OpsActionQueue {
  generatedAt: string;
  open: number;
  acknowledged: number;
  byPriority: Record<OpsAction["priority"], number>;
  actions: OpsAction[];
}

interface ContractReadOptions {
  now?: () => number;
  maxAgeMs?: number;
}

interface MissionSummaryRow {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  executionMode: "AUTO" | "MANUAL";
  executions: Array<{
    error: string | null;
    recoveredAt: Date | null;
  }>;
}

export interface OperationsSummary {
  agentState: Availability<{
    agents: AgentState[];
    online: number;
    total: number;
    totalTasks: number;
  }>;
  hostHealth: Availability<HostHealth[]>;
  ufoReadiness: Availability<UfoReadiness>;
  opsActionQueue: Availability<OpsActionQueue>;
  missions: {
    available: boolean;
    queued: number | null;
    running: number | null;
    awaitingReview: number | null;
    failed: number | null;
    stalled: number | null;
  };
  attention: AttentionItem[];
  system: {
    web: ServiceHealth;
    dispatcher: ServiceHealth;
    postgres: ServiceHealth;
    legacyWorker: {
      available: boolean;
      enabled: boolean | null;
      lastStatus: string | null;
      lastError: string | null;
    };
  };
  pendingIdeas: Availability<number>;
  refreshedAt: string;
}

interface OperationsSummaryDependencies {
  readAgentState: () => Promise<AgentState[]>;
  readHostHealth: () => Promise<HostHealth[]>;
  readUfoReadiness: () => Promise<UfoReadiness>;
  readOpsActionQueue: () => Promise<OpsActionQueue>;
  readMissions: () => Promise<MissionSummaryRow[]>;
  readPendingIdeas: () => Promise<number>;
  probePostgres: () => Promise<ServiceHealth>;
  probeDispatcher: () => Promise<ServiceHealth>;
  probeWeb: () => Promise<ServiceHealth>;
  readCronJobs: () => Promise<CronJob[]>;
  now: () => number;
}

export function classifySystemdActiveState(output: string): ServiceHealth {
  switch (output.trim()) {
    case "active":
      return "up";
    case "inactive":
    case "failed":
      return "down";
    case "activating":
    case "deactivating":
    default:
      return "unknown";
  }
}

async function defaultProbePostgres(): Promise<ServiceHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}

export async function probeDispatcherHealth(
  runSystemctl: () => Promise<{ stdout: string }> = () =>
    execFileAsync(
      "systemctl",
      ["--user", "is-active", "mission-dispatcher.service"],
      { timeout: 2000 },
    ),
): Promise<ServiceHealth> {
  try {
    const { stdout } = await runSystemctl();
    return classifySystemdActiveState(stdout);
  } catch (error) {
    const stdout =
      typeof error === "object" && error !== null && "stdout" in error
        ? String(error.stdout)
        : "";
    return stdout.trim() ? classifySystemdActiveState(stdout) : "unknown";
  }
}

export async function probeWebHealth(
  fetchHealth: () => Promise<{ ok: boolean; json: () => Promise<unknown> }> = () =>
    fetch("http://127.0.0.1:3000/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    }),
): Promise<ServiceHealth> {
  try {
    const response = await fetchHealth();
    if (!response.ok) return "down";
    const body = (await response.json()) as { ok?: boolean };
    return body.ok ? "up" : "down";
  } catch {
    return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTimestamp(value: unknown, label: string): number {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`${label} must be an ISO 8601 timestamp with a timezone`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} is not a valid timestamp`);
  }
  return timestamp;
}

function requireFreshTimestamp(
  value: unknown,
  label: string,
  now: number,
  maxAgeMs: number,
): string {
  const timestamp = parseTimestamp(value, label);
  const age = now - timestamp;
  if (age < -CONTRACT_FUTURE_SKEW_MS) {
    throw new Error(`${label} is too far in the future`);
  }
  if (age > maxAgeMs) {
    throw new Error(`${label} is stale`);
  }
  return value as string;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

export async function readUfoReadiness(
  path = process.env.UFO_READINESS_PATH
    ?? "/home/oggie/projects/ufo-readiness-gate/reports/latest.json",
  options: ContractReadOptions = {},
): Promise<UfoReadiness> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("Invalid UFO readiness contract");
  }
  const value = parsed;
  const generatedAt = requireFreshTimestamp(
    value.generated_at,
    "UFO readiness generated_at",
    (options.now ?? Date.now)(),
    options.maxAgeMs ?? UFO_READINESS_MAX_AGE_MS,
  );
  if (!["PASS", "WARN", "BLOCK"].includes(String(value.decision))) {
    throw new Error("Invalid UFO readiness decision");
  }
  if (typeof value.publication_allowed !== "boolean"
    || typeof value.recommended_action !== "string"
    || value.recommended_action.trim() === "") {
    throw new Error("Invalid UFO readiness contract");
  }
  const publicationBlockers = requireStringArray(
    value.publication_blockers,
    "UFO readiness publication_blockers",
  );
  const warnings = requireStringArray(value.warnings, "UFO readiness warnings");
  return {
    generatedAt,
    decision: value.decision as UfoReadiness["decision"],
    publicationAllowed: value.publication_allowed,
    publicationBlockers,
    warnings,
    recommendedAction: value.recommended_action,
  };
}

export async function readOpsActionQueue(
  path = process.env.OPS_ACTION_QUEUE_PATH
    ?? "/home/oggie/projects/ops-action-queue/reports/latest.json",
  options: ContractReadOptions = {},
): Promise<OpsActionQueue> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("Invalid Ops Action Queue contract");
  }
  const value = parsed;
  const summaryValue = value.summary;
  const actionsValue = value.actions;
  if (!isRecord(summaryValue) || !isRecord(summaryValue.by_priority)
    || !Array.isArray(actionsValue)) {
    throw new Error("Invalid Ops Action Queue contract");
  }
  const summary = summaryValue;
  const priorities = summaryValue.by_priority;
  const generatedAt = requireFreshTimestamp(
    value.generated_at,
    "Ops Action Queue generated_at",
    (options.now ?? Date.now)(),
    options.maxAgeMs ?? OPS_ACTION_QUEUE_MAX_AGE_MS,
  );
  const priorityNames = ["P0", "P1", "P2", "P3"] as const;
  const open = requireNonNegativeInteger(summary.open, "Ops Action Queue open count");
  const acknowledged = requireNonNegativeInteger(
    summary.acknowledged,
    "Ops Action Queue acknowledged count",
  );
  const byPriority = Object.fromEntries(priorityNames.map((priority) => [
    priority,
    requireNonNegativeInteger(priorities[priority], `Ops Action Queue ${priority} count`),
  ])) as OpsActionQueue["byPriority"];
  const actions: OpsAction[] = actionsValue.map((item: unknown) => {
    if (!isRecord(item)) throw new Error("Invalid Ops Action Queue action");
    const action = item;
    if (typeof action.id !== "string" || action.id.trim() === ""
      || typeof action.title !== "string" || action.title.trim() === ""
      || !priorityNames.includes(action.priority as OpsAction["priority"])
      || !["open", "acknowledged", "resolved"].includes(String(action.status))
      || typeof action.hands_off !== "boolean"
      || (action.acknowledged_at !== null && typeof action.acknowledged_at !== "string")) {
      throw new Error("Invalid Ops Action Queue action");
    }
    if (typeof action.acknowledged_at === "string") {
      parseTimestamp(action.acknowledged_at, `Ops Action Queue action ${action.id} acknowledged_at`);
    }
    return {
      id: action.id,
      priority: action.priority as OpsAction["priority"],
      title: action.title,
      status: action.status as OpsAction["status"],
      acknowledgedAt: action.acknowledged_at as string | null,
      handsOff: action.hands_off,
    };
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length
    || open !== actions.filter((action) => action.status === "open").length
    || acknowledged !== actions.filter((action) => action.status === "acknowledged").length
    || priorityNames.some((priority) =>
      byPriority[priority] !== actions.filter((action) => action.priority === priority).length)) {
    throw new Error("Ops Action Queue summary does not match its actions");
  }
  return {
    generatedAt,
    open,
    acknowledged,
    byPriority,
    actions,
  };
}

const defaultDependencies: OperationsSummaryDependencies = {
  readAgentState: () => prisma.agentState.findMany({ orderBy: { updatedAt: "desc" } }),
  readHostHealth: () => prisma.hostHealth.findMany({ orderBy: { updatedAt: "desc" } }),
  readUfoReadiness,
  readOpsActionQueue,
  readMissions: () =>
    prisma.mission.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        executionMode: true,
        executions: {
          orderBy: { attempt: "desc" },
          take: 1,
          select: { error: true, recoveredAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  readPendingIdeas: () => prisma.idea.count({ where: { status: "pending" } }),
  probePostgres: defaultProbePostgres,
  probeDispatcher: probeDispatcherHealth,
  probeWeb: probeWebHealth,
  readCronJobs: async () => {
    const jobs = await getCronJobs();
    if (!jobs) throw new Error("Cron metadata unavailable");
    return jobs;
  },
  now: Date.now,
};

function addHealthAttention(
  attention: AttentionItem[],
  id: string,
  health: ServiceHealth,
  downLabel: string,
  unknownLabel: string,
) {
  if (health === "up") return;
  attention.unshift({
    id,
    severity: "critical",
    label: health === "down" ? downLabel : unknownLabel,
    href: "/",
  });
}

export async function getOperationsSummary(
  overrides: Partial<OperationsSummaryDependencies> = {},
): Promise<OperationsSummary> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const [agentResult, hostResult, ufoResult, actionResult, missionResult, ideaResult, postgres, dispatcher, web, cronResult] = await Promise.all([
    dependencies.readAgentState().then(
      (agents) => ({
        available: true as const,
        value: {
          agents,
          online: agents.filter((agent) => agent.status === "online" || agent.status === "working").length,
          total: agents.length,
          totalTasks: agents.reduce((sum, agent) => sum + (agent.tasksCompleted || 0), 0),
        },
      }),
      () => ({ available: false as const, value: null }),
    ),
    dependencies.readHostHealth().then(
      (value) => ({ available: true as const, value }),
      () => ({ available: false as const, value: null }),
    ),
    dependencies.readUfoReadiness().then(
      (value) => ({ available: true as const, value }),
      () => ({ available: false as const, value: null }),
    ),
    dependencies.readOpsActionQueue().then(
      (value) => ({ available: true as const, value }),
      () => ({ available: false as const, value: null }),
    ),
    dependencies.readMissions().then(
      (value) => ({ available: true as const, value }),
      () => ({ available: false as const, value: null }),
    ),
    dependencies.readPendingIdeas().then(
      (value) => ({ available: true as const, value }),
      () => ({ available: false as const, value: null }),
    ),
    dependencies.probePostgres(),
    dependencies.probeDispatcher(),
    dependencies.probeWeb(),
    dependencies.readCronJobs().then(
      (value) => ({ available: true as const, value }),
      () => ({ available: false as const, value: null }),
    ),
  ]);

  let queued = 0;
  let running = 0;
  let awaitingReview = 0;
  let failed = 0;
  let stalled = 0;
  const attention: AttentionItem[] = [];

  if (!agentResult.available) {
    attention.unshift({ id: "data-agent-state", severity: "critical", label: "Agent state data is unavailable", href: "/agents" });
  }
  if (!hostResult.available) {
    attention.unshift({ id: "data-host-health", severity: "critical", label: "Host health data is unavailable", href: "/machines" });
  }
  if (!ufoResult.available) {
    attention.unshift({ id: "data-ufo-readiness", severity: "critical", label: "UFO readiness data is unavailable, invalid, or stale", href: "/" });
  } else if (ufoResult.value.decision === "BLOCK") {
    attention.unshift({
      id: "ufo-publication-blocked",
      severity: "critical",
      label: `UFO publication blocked: ${ufoResult.value.publicationBlockers[0] ?? ufoResult.value.recommendedAction}`,
      href: "/",
    });
  } else if (ufoResult.value.decision === "WARN") {
    attention.push({
      id: "ufo-readiness-warning",
      severity: "warning",
      label: `UFO readiness warning: ${ufoResult.value.warnings[0] ?? ufoResult.value.recommendedAction}`,
      href: "/",
    });
  }

  if (!actionResult.available) {
    attention.unshift({ id: "data-ops-action-queue", severity: "critical", label: "Ops Action Queue data is unavailable, invalid, or stale", href: "/" });
  } else {
    for (const action of actionResult.value.actions.filter((item) =>
      item.status === "open" && item.acknowledgedAt === null && (item.priority === "P0" || item.priority === "P1")
    )) {
      attention.unshift({
        id: `ops-${action.id}`,
        severity: action.priority === "P0" ? "critical" : "warning",
        label: `${action.priority}: ${action.title}${action.handsOff ? " (hands-off)" : ""}`,
        href: "/",
      });
    }
  }

  if (missionResult.available) {
    for (const mission of missionResult.value) {
      const age = dependencies.now() - new Date(mission.createdAt).getTime();
      if (mission.status === "pending") {
        queued += 1;
        if (mission.executionMode === "AUTO" && age >= STALLED_WARNING_MS) {
          stalled += 1;
          attention.push({ id: `stalled-queued-${mission.id}`, severity: "warning", label: `Queued mission exceeds 45m: ${mission.title}`, href: "/missions" });
        }
      } else if (mission.status === "active") {
        running += 1;
        if (age >= STALLED_WARNING_MS) {
          stalled += 1;
          attention.push({ id: `stalled-active-${mission.id}`, severity: "warning", label: `Active mission exceeds 45m: ${mission.title}`, href: "/missions" });
        }
      } else if (mission.status === "completed") {
        awaitingReview += 1;
        attention.push({ id: `review-${mission.id}`, severity: "warning", label: `Awaiting review: ${mission.title}`, href: "/missions" });
      } else if (mission.status === "failed") {
        failed += 1;
        const latestExecution = mission.executions[0];
        attention.push({
          id: `failed-${mission.id}`,
          severity: "critical",
          label: latestExecution?.recoveredAt
            ? `Recovered stale execution: ${mission.title}`
            : `Failed mission: ${mission.title}`,
          href: "/missions",
        });
      }
    }
  } else {
    attention.unshift({ id: "data-missions", severity: "critical", label: "Mission data is unavailable", href: "/missions" });
  }

  if (!ideaResult.available) {
    attention.unshift({ id: "data-ideas", severity: "critical", label: "Ideas and To-Dos data is unavailable", href: "/ideas" });
  }

  addHealthAttention(attention, "sys-postgres", postgres, "PostgreSQL is down", "PostgreSQL status is unavailable");
  addHealthAttention(attention, "sys-dispatcher", dispatcher, "Deterministic dispatcher is down", "Dispatcher status is unavailable");
  addHealthAttention(attention, "sys-web", web, "Mission Control health check is down", "Mission Control health status is unavailable");

  const worker = cronResult.available
    ? cronResult.value.find((job) => job.name === "mission-worker") ?? null
    : null;
  if (!cronResult.available || !worker) {
    attention.unshift({ id: "sys-legacy-worker-unavailable", severity: "critical", label: "Legacy worker cron metadata is unavailable", href: "/calendar" });
  } else if (worker.enabled) {
    attention.unshift({ id: "sys-legacy-worker", severity: "warning", label: "Legacy mission-worker cron is enabled (should stay disabled while dispatcher is active)", href: "/calendar" });
  } else if (worker.last_status === "error") {
    attention.push({ id: "sys-legacy-worker-error", severity: "warning", label: "Legacy mission-worker last status was error (cron remains disabled)", href: "/calendar" });
  }

  return {
    agentState: agentResult,
    hostHealth: hostResult,
    ufoReadiness: ufoResult,
    opsActionQueue: actionResult,
    missions: {
      available: missionResult.available,
      queued: missionResult.available ? queued : null,
      running: missionResult.available ? running : null,
      awaitingReview: missionResult.available ? awaitingReview : null,
      failed: missionResult.available ? failed : null,
      stalled: missionResult.available ? stalled : null,
    },
    attention: attention.slice(0, 12),
    system: {
      web,
      dispatcher,
      postgres,
      legacyWorker: {
        available: cronResult.available && worker !== null,
        enabled: worker?.enabled ?? null,
        lastStatus: worker?.last_status ?? null,
        lastError: worker?.last_error ?? null,
      },
    },
    pendingIdeas: ideaResult,
    refreshedAt: new Date(dependencies.now()).toISOString(),
  };
}
