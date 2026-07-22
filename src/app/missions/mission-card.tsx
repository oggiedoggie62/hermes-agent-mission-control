/* agent: codex | model: gpt-5 | date: 2026-07-21 */
"use client";

import { useState } from "react";
import { Archive, AlertCircle } from "lucide-react";

interface MissionCardProps {
  m: any;
  colIcon: React.ReactNode;
  onArchive: (id: string) => Promise<void>;
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

export function MissionCard({ m, colIcon, onArchive, now, stalledWarningMs }: MissionCardProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const age = now - new Date(m.createdAt).getTime();
  const isTimedState = m.status === "pending" || m.status === "active";
  const isStalled = isTimedState && age >= stalledWarningMs;
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

  return (
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
        <div className={`mb-3 flex items-center gap-1 text-[10px] font-bold ${isStalled ? "text-amber-400" : "text-slate-500"}`}>
          {isStalled && <AlertCircle className="h-3 w-3" aria-hidden="true" />}
          Queued for {formatDuration(age)}{isStalled ? " · exceeds 45m warning threshold" : ""}
        </div>
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
        <div className="absolute -bottom-8 left-0 right-0 flex items-center gap-1 px-2 py-1 bg-rose-500/20 border border-rose-500/30 rounded text-[9px] font-bold text-rose-400 animate-in fade-in slide-in-from-bottom-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  );
}
