/* agent: codex | model: gpt-5 | date: 2026-07-22 */
"use client";

import { useState } from "react";
import { Archive, AlertCircle, Pencil, Play, X, XCircle } from "lucide-react";
import { missionQueueTimingLabel, supportsAutomaticDispatch } from "@/lib/mission-dispatch-ux";
import {
  changePendingMissionEdit,
  closePendingMissionEdit,
  failPendingMissionEdit,
  openPendingMissionEdit,
  succeedPendingMissionEdit,
  type MissionEditDraft,
  type PendingMissionEditState,
} from "@/lib/pending-mission-edit-state";

interface MissionCardProps {
  m: any;
  agents: Array<{ id: string; name: string; emoji: string | null }>;
  colIcon: React.ReactNode;
  onArchive: (id: string) => Promise<void>;
  onEnableAutomatic: (id: string) => Promise<void>;
  onEdit: (id: string, edit: MissionEditDraft) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  now: number;
  stalledWarningMs: number;
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function MissionCard({ m, agents, colIcon, onArchive, onEnableAutomatic, onEdit, onCancel, now, stalledWarningMs }: MissionCardProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [editState, setEditState] = useState<PendingMissionEditState>({
    open: false,
    draft: {
      title: m.title,
      description: m.description,
      agentId: m.agentId,
      priority: m.priority,
      executionMode: m.executionMode,
    },
    error: null,
  });
  const edit = editState.draft;
  const [error, setError] = useState<string | null>(null);
  const age = now - new Date(m.createdAt).getTime();
  const isTimedState = m.status === "pending" || m.status === "active";
  const isAutomatic = m.executionMode === "AUTO";
  const isStalled = isTimedState && (m.status !== "pending" || isAutomatic) && age >= stalledWarningMs;
  const latestExecution = m.executions?.[0];

  const handleArchive = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsArchiving(true);
    setError(null);
    try {
      await onArchive(m.id);
    } catch (err: any) {
      setError(err.message || "Failed to archive");
    } finally {
      setIsArchiving(false);
    }
  };

  const handleEnableAutomatic = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPromoting(true);
    setError(null);
    try {
      await onEnableAutomatic(m.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable automatic execution");
    } finally {
      setIsPromoting(false);
    }
  };

  const openEdit = () => {
    setEditState(openPendingMissionEdit({
      title: m.title,
      description: m.description,
      agentId: m.agentId,
      priority: m.priority,
      executionMode: m.executionMode,
    }));
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setEditState((current) => changePendingMissionEdit(current, {}));
    try {
      await onEdit(m.id, edit);
      setEditState((current) => succeedPendingMissionEdit(current));
    } catch (err) {
      setEditState((current) => failPendingMissionEdit(
        current,
        err instanceof Error ? err.message : "Failed to edit mission",
      ));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(`Cancel "${m.title}"? This preserves it as Cancelled and prevents dispatch.`)) return;
    setIsCancelling(true);
    setError(null);
    try {
      await onCancel(m.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel mission");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <div
        className="p-5 rounded-2xl border transition-all hover:bg-white/[0.04] group relative"
        style={{ background: "rgba(30, 41, 59, 0.4)", borderColor: "rgba(255, 255, 255, 0.05)" }}
      >
      <div className="flex justify-between items-start mb-3">
         <div className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-tighter ${
           m.priority === 'high' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
           m.priority === 'medium' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
           'bg-slate-500/10 text-slate-400 border-slate-500/20'
         }`}>
           {m.priority}
         </div>
         <div className="flex items-center gap-2">
            {colIcon}
            {m.status === "pending" && (
              <>
                <button type="button" onClick={openEdit} title="Edit pending mission" className="p-1 text-slate-500 hover:text-cyan-400">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={handleCancel} disabled={isCancelling} title="Cancel pending mission" className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-50">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {m.status === 'completed' && (
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                title="Archive Mission"
                className="p-1 text-slate-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
         </div>
      </div>
      <h3 className="text-[15px] font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors tracking-tight">{m.title}</h3>
      <p className="text-[12px] text-slate-400 mb-4 line-clamp-2 leading-relaxed">{m.description}</p>
      {m.status === "pending" && (
        <>
          <div className={`mb-3 flex items-center gap-1 text-[10px] font-bold ${isStalled ? "text-amber-400" : "text-slate-500"}`}>
            {isStalled && <AlertCircle className="h-3 w-3" aria-hidden="true" />}
            {missionQueueTimingLabel(isAutomatic ? "AUTO" : "MANUAL", formatDuration(age), isStalled)}
          </div>
          {!isAutomatic && m.executionProvider === "HERMES" && m.agentId.toLowerCase() === "hermes" && (
            <button
              type="button"
              onClick={handleEnableAutomatic}
              disabled={isPromoting}
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
            >
              <Play className="h-3 w-3" aria-hidden="true" />
              {isPromoting ? "Enabling..." : "Make Automatic"}
            </button>
          )}
        </>
      )}
      {m.status === "active" && isStalled && (
        <div className="mb-3 flex items-center gap-1 text-[10px] font-bold text-amber-400">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          Running state exceeds 45m warning threshold
        </div>
      )}
      {m.result && (
        <div className="mb-4 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
          <div className="text-[9px] font-black uppercase tracking-wider text-cyan-400 mb-1">Result</div>
          <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-4">{m.result}</div>
        </div>
      )}
      {m.status === "failed" && latestExecution?.error && (
        <div className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="mb-1 text-[9px] font-black uppercase tracking-wider text-rose-400">
            {latestExecution.recoveredAt ? "Stale execution recovered" : "Execution failed"}
          </div>
          <div className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-rose-200">
            {latestExecution.error}
          </div>
          {latestExecution.recoveredAt && (
            <div className="mt-1 text-[9px] text-slate-500">
              Recovered {new Date(latestExecution.recoveredAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {m.debriefPath && (
        <a
          href={`/library/doc?path=${encodeURIComponent(m.debriefPath)}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 mb-3"
        >
          Read Debrief →
        </a>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
           <span className="text-white italic">{m.agentId}</span>
        </div>
        <div className="text-[10px] font-black text-slate-600">{new Date(m.createdAt).toLocaleDateString()}</div>
      </div>

      {error && (
        <MissionCardActionError error={error} />
      )}
      </div>

      {editState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form onSubmit={handleEdit} className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black uppercase italic text-white">Edit Pending Mission</h2>
              <button type="button" onClick={() => setEditState((current) => closePendingMissionEdit(current))} className="text-slate-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <input required value={edit.title} onChange={(event) => setEditState((current) => changePendingMissionEdit(current, { title: event.target.value }))} className="w-full rounded-xl border border-white/5 bg-slate-800 px-4 py-2 text-white" aria-label="Mission title" />
            <textarea value={edit.description} onChange={(event) => setEditState((current) => changePendingMissionEdit(current, { description: event.target.value }))} className="h-24 w-full rounded-xl border border-white/5 bg-slate-800 px-4 py-2 text-white" aria-label="Mission description" />
            <div className="grid grid-cols-2 gap-3">
              <select value={edit.agentId} onChange={(event) => setEditState((current) => changePendingMissionEdit(current, { agentId: event.target.value, executionMode: "MANUAL" }))} className="rounded-xl border border-white/5 bg-slate-800 px-3 py-2 text-white" aria-label="Mission agent">
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.emoji} {agent.name}</option>)}
              </select>
              <select value={edit.priority} onChange={(event) => setEditState((current) => changePendingMissionEdit(current, { priority: event.target.value }))} className="rounded-xl border border-white/5 bg-slate-800 px-3 py-2 text-white" aria-label="Mission priority">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <select value={edit.executionMode} onChange={(event) => setEditState((current) => changePendingMissionEdit(current, { executionMode: event.target.value as MissionEditDraft["executionMode"] }))} className="w-full rounded-xl border border-white/5 bg-slate-800 px-3 py-2 text-white" aria-label="Execution mode">
              <option value="MANUAL">Manual</option>
              {supportsAutomaticDispatch(edit.agentId) && <option value="AUTO">Automatic</option>}
            </select>
            <p className="text-[10px] text-slate-500">Saving is allowed only while this mission remains pending and unclaimed.</p>
            <PendingMissionEditError error={editState.error} />
            <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-black uppercase text-black disabled:opacity-50">
              {isSaving ? "Saving..." : "Save Pending Mission"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export function PendingMissionEditError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {error}
    </div>
  );
}

export function MissionCardActionError({ error }: { error: string }) {
  return (
    <div role="alert" className="absolute -bottom-8 left-0 right-0 flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/20 px-2 py-1 text-[9px] font-bold text-rose-400">
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      {error}
    </div>
  );
}
