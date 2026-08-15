/* agent: codex | model: gpt-5.5 | date: 2026-07-20 */
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Circle,
  Clock,
  Lightbulb,
  ListTodo,
  Plus,
  Server,
  XCircle,
} from "lucide-react";
import { CreateMissionButton } from "@/components/create-mission-button";
import type { OperationsSummary, ServiceHealth } from "@/lib/operations-summary";

interface MissionAgent {
  id: string;
  name: string;
  emoji: string | null;
}

function healthLabel(h: ServiceHealth) {
  if (h === "up") return { text: "UP", className: "text-emerald-400 bg-emerald-500/15" };
  if (h === "down") return { text: "DOWN", className: "text-rose-400 bg-rose-500/15" };
  return { text: "UNKNOWN", className: "text-slate-300 bg-slate-500/15" };
}

function HealthPill({ label, health }: { label: string; health: ServiceHealth }) {
  const h = healthLabel(health);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded ${h.className}`}>{h.text}</span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  tone?: "rose" | "amber" | "emerald" | "cyan" | "slate";
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-400"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "emerald"
          ? "text-emerald-400"
          : tone === "cyan"
            ? "text-cyan-400"
            : "text-white";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-[28px] font-black tracking-tight leading-none ${toneClass}`}>
        {value === null ? "—" : value}
      </div>
    </div>
  );
}

export function OperationsSummaryPanel({
  summary,
  agents,
}: {
  summary: OperationsSummary;
  agents: MissionAgent[];
}) {
  const needsAttention = summary.attention.length > 0;
  const legacy = summary.system.legacyWorker;

  return (
    <section
      className="mb-10 p-5 rounded-2xl relative overflow-hidden"
      style={{
        background: "rgba(30, 41, 59, 0.55)",
        backdropFilter: "blur(16px)",
        border: needsAttention
          ? "1px solid rgba(251, 113, 133, 0.35)"
          : "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-black tracking-widest text-cyan-400 uppercase mb-1">
            <AlertTriangle className="w-4 h-4" />
            What needs attention
          </div>
          <p className="text-[13px] text-slate-400 font-medium">
            Operational exceptions first. Counts use live non-archived missions.
          </p>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          refreshed {new Date(summary.refreshedAt).toLocaleTimeString()}
        </div>
      </div>

      {/* Attention list */}
      <div className="mb-5">
        {needsAttention ? (
          <ul className="space-y-1.5">
            {summary.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.04] ${
                    item.severity === "critical"
                      ? "border-rose-500/30 text-rose-200"
                      : "border-amber-500/25 text-amber-100"
                  }`}
                >
                  {item.severity === "critical" ? (
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                  )}
                  <span className="leading-snug">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-[13px] font-semibold text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            Nothing needs attention right now.
          </div>
        )}
      </div>

      {/* UFO publication gate */}
      <div className="mb-5">
        <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">
          UFO publication gate
        </div>
        {summary.ufoReadiness.available && summary.ufoReadiness.value ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3">
            <div>
              <div className={`text-[13px] font-black ${
                summary.ufoReadiness.value.decision === "PASS"
                  ? "text-emerald-400"
                  : summary.ufoReadiness.value.decision === "WARN"
                    ? "text-amber-400"
                    : "text-rose-400"
              }`}>
                {summary.ufoReadiness.value.decision}
              </div>
              <div className="text-[11px] text-slate-400">
                Publication {summary.ufoReadiness.value.publicationAllowed ? "allowed" : "blocked"}
              </div>
            </div>
            <div className="max-w-xl text-[11px] text-slate-300">
              {summary.ufoReadiness.value.recommendedAction}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {new Date(summary.ufoReadiness.value.generatedAt).toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-3 text-[12px] font-semibold text-rose-300">
            UFO readiness contract unavailable
          </div>
        )}
      </div>

      {/* Ops Action Queue */}
      <div className="mb-5">
        <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">
          Ops Action Queue
        </div>
        {summary.opsActionQueue.available && summary.opsActionQueue.value ? (
          <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Stat icon={<ListTodo className="w-3 h-3" />} label="Open" value={summary.opsActionQueue.value.open} tone="cyan" />
              <Stat icon={<XCircle className="w-3 h-3" />} label="P0" value={summary.opsActionQueue.value.byPriority.P0} tone="rose" />
              <Stat icon={<AlertTriangle className="w-3 h-3" />} label="P1" value={summary.opsActionQueue.value.byPriority.P1} tone="amber" />
              <Stat icon={<Circle className="w-3 h-3" />} label="P2 / P3" value={summary.opsActionQueue.value.byPriority.P2 + summary.opsActionQueue.value.byPriority.P3} tone="slate" />
              <Stat icon={<CheckCircle2 className="w-3 h-3" />} label="Acknowledged" value={summary.opsActionQueue.value.acknowledged} tone="emerald" />
            </div>
            <div className="mt-2 text-right text-[10px] text-slate-500 font-mono">
              generated {new Date(summary.opsActionQueue.value.generatedAt).toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-3 text-[12px] font-semibold text-rose-300">
            Ops Action Queue contract unavailable
          </div>
        )}
      </div>

      {/* Mission status */}
      <div className="mb-5">
        <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">
          Mission status
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat icon={<Circle className="w-3 h-3" />} label="Queued" value={summary.missions.queued} tone="slate" />
          <Stat icon={<Clock className="w-3 h-3" />} label="Running" value={summary.missions.running} tone="cyan" />
          <Stat
            icon={<CheckCircle2 className="w-3 h-3" />}
            label="Awaiting review"
            value={summary.missions.awaitingReview}
            tone="emerald"
          />
          <Stat icon={<XCircle className="w-3 h-3" />} label="Failed" value={summary.missions.failed} tone="rose" />
        </div>
        {summary.missions.stalled !== null && summary.missions.stalled > 0 && (
          <div className="mt-2 text-[11px] font-bold text-amber-400">
            {summary.missions.stalled} mission{summary.missions.stalled === 1 ? "" : "s"} exceed the 45m stalled threshold
          </div>
        )}
      </div>

      {/* System status */}
      <div className="mb-5">
        <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2 flex items-center gap-1.5">
          <Server className="w-3 h-3" /> System status
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <HealthPill label="Mission Control" health={summary.system.web} />
          <HealthPill label="Dispatcher" health={summary.system.dispatcher} />
          <HealthPill label="PostgreSQL" health={summary.system.postgres} />
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Legacy worker</span>
            <span
              className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded ${
                legacy.enabled === true
                  ? "text-amber-400 bg-amber-500/15"
                  : legacy.enabled === false
                    ? "text-emerald-400 bg-emerald-500/15"
                    : "text-slate-400 bg-slate-500/15"
              }`}
            >
              {legacy.enabled === true ? "ENABLED" : legacy.enabled === false ? "DISABLED" : "UNAVAILABLE"}
            </span>
          </div>
        </div>
      </div>

      {/* Workflow entry points */}
      <div>
        <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">
          Workflow entry points
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateMissionButton agents={agents} triggerLabel="Create mission" compact />
          <Link
            href="/missions"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            <ListTodo className="w-3.5 h-3.5" />
            Review missions
            {summary.missions.awaitingReview !== null && summary.missions.awaitingReview > 0
              ? ` (${summary.missions.awaitingReview})`
              : ""}
          </Link>
          <Link
            href="/ideas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] font-bold text-amber-200 hover:bg-amber-500/20"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Ideas / To-Dos
            {summary.pendingIdeas.available && summary.pendingIdeas.value !== null && summary.pendingIdeas.value > 0
              ? ` (${summary.pendingIdeas.value})`
              : ""}
          </Link>
          <Link
            href="/missions/archive"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-bold text-slate-200 hover:bg-white/10"
          >
            <Archive className="w-3.5 h-3.5" />
            Mission archive
          </Link>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 ml-1">
            <Plus className="w-3 h-3" />
            Use Create mission for Hermes dispatch
          </span>
        </div>
      </div>
    </section>
  );
}
