/* agent: codex | model: gpt-5 | date: 2026-07-22 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { CreateMissionButton } from "../../components/create-mission-button";
import { MissionCard } from "./mission-card";
import { MissionBoardFilters } from "./mission-board-filters";
import { dispatcherStatusLabel, legacyWorkerNextRunLabel, type DispatcherHealth } from "@/lib/mission-dispatch-ux";

interface Mission {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  result: string | null;
  debriefPath: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
  executionProvider: "HERMES";
  executionMode: "AUTO" | "MANUAL";
}

interface MissionEdit {
  title: string;
  description: string;
  agentId: string;
  priority: string;
  executionMode: "AUTO" | "MANUAL";
}

interface Column {
  title: string;
  status: string;
  icon: React.ReactNode;
}

interface KanbanClientProps {
  missions: Mission[];
  agents: any[];
  columns: Column[];
}

interface WorkerState {
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface DispatcherState {
  health: DispatcherHealth;
}

const POLL_INTERVAL_MS = 20_000;
export const STALLED_WARNING_MS = 45 * 60 * 1000;

function formatRelativeTime(value: string | null, now: number) {
  if (!value) return "unavailable";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "unavailable";
  const difference = timestamp - now;
  const minutes = Math.max(0, Math.round(Math.abs(difference) / 60_000));
  if (Math.abs(difference) < 60_000) return difference >= 0 ? "in under a minute" : "under a minute ago";
  return difference >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
}

export function KanbanClient({ missions, agents, columns }: KanbanClientProps) {
  const [localMissions, setLocalMissions] = useState(missions);
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [worker, setWorker] = useState<WorkerState | null>(null);
  const [dispatcher, setDispatcher] = useState<DispatcherState | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refreshMissionState = useCallback(async () => {
    try {
      const response = await fetch("/api/missions/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Mission refresh failed");
      setLocalMissions(data.missions || []);
      setWorker(data.worker || null);
      setDispatcher(data.dispatcher || null);
      setRefreshedAt(data.refreshedAt || new Date().toISOString());
      setRefreshError(null);
      setNow(Date.now());
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Mission refresh failed");
    }
  }, []);

  useEffect(() => {
    void refreshMissionState();
    const interval = window.setInterval(() => void refreshMissionState(), POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshMissionState();
    };
    const handleFocus = () => void refreshMissionState();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshMissionState]);

  const missionAgents = useMemo(
    () => Array.from(new Set(localMissions.map((mission) => mission.agentId))).sort(),
    [localMissions],
  );

  const filteredMissions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return localMissions.filter((mission) => {
      if (agentId !== "all" && mission.agentId !== agentId) return false;
      if (priority !== "all" && mission.priority !== priority) return false;
      if (status !== "all" && mission.status !== status) return false;
      if (!normalizedQuery) return true;

      return [mission.title, mission.description, mission.result, mission.agentId]
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [agentId, localMissions, priority, query, status]);

  const visibleColumns = status === "all" ? columns : columns.filter((column) => column.status === status);
  const awaitingReviewCount = localMissions.filter((mission) => mission.status === "completed").length;

  const clearFilters = () => {
    setQuery("");
    setAgentId("all");
    setPriority("all");
    setStatus("all");
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });

      if (res.ok) {
        setLocalMissions((prev) => prev.filter((m) => m.id !== id));
      } else {
        console.error("Failed to archive mission");
      }
    } catch (error) {
      console.error("Error archiving mission:", error);
    }
  };

  const handleEnableAutomatic = async (id: string) => {
    const internalApiSecret = window.prompt("Enter the Mission Control internal API secret to enable automatic execution.");
    if (!internalApiSecret) {
      throw new Error("Authorization is required to enable automatic execution");
    }
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${internalApiSecret}`,
      },
      body: JSON.stringify({ action: "enableAutomaticExecution" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || "Failed to enable automatic execution");
    }
    setLocalMissions((previous) => previous.map((mission) => (
      mission.id === id ? { ...mission, ...data } : mission
    )));
    await refreshMissionState();
  };

  const runPendingAction = async (id: string, body: Record<string, unknown>) => {
    const internalApiSecret = window.prompt("Enter the Mission Control internal API secret.");
    if (!internalApiSecret) throw new Error("Authorization is required");
    const response = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${internalApiSecret}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Mission update failed");
    setLocalMissions((previous) => previous.map((mission) => (
      mission.id === id ? { ...mission, ...data } : mission
    )));
    await refreshMissionState();
  };

  const handleEditPending = (id: string, edit: MissionEdit) => (
    runPendingAction(id, { action: "editPending", ...edit })
  );

  const handleCancelPending = (id: string) => (
    runPendingAction(id, { action: "cancelPending" })
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto min-h-screen text-slate-200">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white uppercase italic">Task Board</h1>
          <p className="text-slate-400 font-medium">Kanban execution view for your digital workforce.</p>
        </div>
        <CreateMissionButton agents={agents} />
      </div>

      <MissionBoardFilters
        query={query}
        agentId={agentId}
        priority={priority}
        status={status}
        agents={missionAgents}
        statuses={columns.map((column) => ({ value: column.status, label: column.title }))}
        shownCount={filteredMissions.length}
        totalCount={localMissions.length}
        awaitingReviewCount={awaitingReviewCount}
        onQueryChange={setQuery}
        onAgentChange={setAgentId}
        onPriorityChange={setPriority}
        onStatusChange={setStatus}
        onClear={clearFilters}
      />

      <section className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[11px] text-slate-400" aria-label="Mission processor status" aria-live="polite">
        <span className="inline-flex items-center gap-2 font-bold text-slate-300">
          <Activity className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          Deterministic dispatcher
        </span>
        <span className={dispatcher?.health === "up" ? "text-emerald-400" : dispatcher?.health === "down" ? "text-rose-400" : "text-slate-400"}>
          {dispatcherStatusLabel(dispatcher?.health ?? "unknown")}
        </span>
        <span className="text-slate-500">Legacy worker · {worker?.enabled ? "Enabled" : worker ? "Disabled intentionally" : "Status unavailable"}</span>
        <span>Legacy last run: {formatRelativeTime(worker?.lastRunAt ?? null, now)}</span>
        <span>
          Legacy next run: {worker
            ? legacyWorkerNextRunLabel(worker.enabled, worker.nextRunAt, (value) => formatRelativeTime(value, now))
            : "—"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-slate-500">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Auto-refresh 20s{refreshedAt ? ` · updated ${formatRelativeTime(refreshedAt, now)}` : ""}
        </span>
        {refreshError && <span className="w-full text-rose-400">Refresh warning: {refreshError}</span>}
        {worker?.lastError && <span className="w-full text-rose-400">Worker warning: {worker.lastError}</span>}
      </section>

      <div className={`grid gap-6 items-start ${visibleColumns.length === 1 ? "grid-cols-1" : visibleColumns.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {visibleColumns.map((col) => (
          <div key={col.status} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 px-2 mb-2">
              {col.icon}
              <span className="text-[12px] font-black uppercase tracking-widest text-white">{col.title}</span>
              <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                {filteredMissions.filter((m) => m.status === col.status).length}
              </span>
            </div>

            <div className="flex flex-col gap-3 min-h-[500px] p-2 bg-black/10 rounded-3xl border border-white/5">
              {filteredMissions
                .filter((m) => m.status === col.status)
                .map((m) => (
                  <MissionCard
                    key={m.id}
                    m={m}
                    agents={agents}
                    colIcon={col.icon}
                    onArchive={handleArchive}
                    onEnableAutomatic={handleEnableAutomatic}
                    onEdit={handleEditPending}
                    onCancel={handleCancelPending}
                    now={now}
                    stalledWarningMs={STALLED_WARNING_MS}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
