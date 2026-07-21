/* agent: codex | model: gpt-5.5 | date: 2026-07-20 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { getCronJobs, type CronJob } from "@/lib/agentos";
import type { AgentState, HostHealth } from "@prisma/client";

const execFileAsync = promisify(execFile);

export const STALLED_WARNING_MS = 45 * 60 * 1000;
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

interface MissionSummaryRow {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface OperationsSummary {
  agentState: Availability<{
    agents: AgentState[];
    online: number;
    total: number;
    totalTasks: number;
  }>;
  hostHealth: Availability<HostHealth[]>;
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

const defaultDependencies: OperationsSummaryDependencies = {
  readAgentState: () => prisma.agentState.findMany({ orderBy: { updatedAt: "desc" } }),
  readHostHealth: () => prisma.hostHealth.findMany({ orderBy: { updatedAt: "desc" } }),
  readMissions: () =>
    prisma.mission.findMany({
      where: { isArchived: false },
      select: { id: true, title: true, status: true, createdAt: true },
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
  const [agentResult, hostResult, missionResult, ideaResult, postgres, dispatcher, web, cronResult] = await Promise.all([
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

  if (missionResult.available) {
    for (const mission of missionResult.value) {
      const age = dependencies.now() - new Date(mission.createdAt).getTime();
      if (mission.status === "pending") {
        queued += 1;
        if (age >= STALLED_WARNING_MS) {
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
        attention.push({ id: `failed-${mission.id}`, severity: "critical", label: `Failed mission: ${mission.title}`, href: "/missions" });
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
