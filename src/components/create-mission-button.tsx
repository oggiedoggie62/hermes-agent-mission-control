/* agent: codex | model: gpt-5 | date: 2026-07-22 */
"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { supportsAutomaticDispatch, type MissionExecutionMode } from "@/lib/mission-dispatch-ux";

interface MissionAgent {
  id: string;
  name: string;
  emoji: string | null;
}

interface CreatedMission {
  id: string;
  title: string;
}

interface CreateMissionButtonProps {
  agents: MissionAgent[];
  initialTitle?: string;
  initialDescription?: string;
  triggerLabel?: string;
  compact?: boolean;
  onCreated?: (mission: CreatedMission) => Promise<void> | void;
}

export function CreateMissionButton({
  agents,
  initialTitle = "",
  initialDescription = "",
  triggerLabel = "New Mission",
  compact = false,
  onCreated,
}: CreateMissionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialAgentId = agents[0]?.id ?? "";
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgentId);
  const [executionMode, setExecutionMode] = useState<MissionExecutionMode>("MANUAL");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.target as HTMLFormElement);
    
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      agentId: formData.get("agentId"),
      priority: formData.get("priority"),
      executionMode: formData.get("executionMode"),
    };

    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create mission");
      }

      const mission = await res.json();
      await onCreated?.(mission);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mission");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => {
          setError(null);
          setSelectedAgentId(initialAgentId);
          setExecutionMode("MANUAL");
          setOpen(true);
        }}
        disabled={agents.length === 0}
        className={`${compact ? "rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] text-cyan-400 hover:bg-cyan-500/20" : "rounded-full bg-cyan-500 px-4 py-2 text-[12px] text-black hover:bg-cyan-400"} flex items-center gap-2 font-black uppercase transition-all disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Plus size={compact ? 13 : 16} /> {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-black text-white italic uppercase">Deploy Mission</h2>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mission Title</label>
                <input required name="title" defaultValue={initialTitle} className="bg-slate-800 border border-white/5 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors" placeholder="e.g. Scrape new leaks" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Details</label>
                <textarea name="description" defaultValue={initialDescription} className="bg-slate-800 border border-white/5 rounded-xl px-4 py-2 text-white h-24 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="Mission parameters..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assign Agent</label>
                  <select
                    name="agentId"
                    value={selectedAgentId}
                    onChange={(event) => {
                      const nextAgentId = event.target.value;
                      setSelectedAgentId(nextAgentId);
                      setExecutionMode("MANUAL");
                    }}
                    className="bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</label>
                  <select name="priority" defaultValue="medium" className="bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Execution Mode</label>
                <select
                  name="executionMode"
                  value={executionMode}
                  onChange={(event) => setExecutionMode(event.target.value as MissionExecutionMode)}
                  className="bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="MANUAL">Manual</option>
                  {supportsAutomaticDispatch(selectedAgentId) && <option value="AUTO">Automatic</option>}
                </select>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  {supportsAutomaticDispatch(selectedAgentId)
                    ? executionMode === "AUTO"
                      ? "Automatic: the deterministic dispatcher may claim and launch this mission."
                      : "Manual: this mission waits for explicit launch."
                    : "Manual: this mission waits for explicit launch. No automatic dispatcher is configured for this agent."}
                </p>
              </div>

              {error && <div role="alert" className="text-[12px] font-medium text-rose-400">{error}</div>}

              <button 
                type="submit" 
                disabled={loading}
                className="mt-4 w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-black uppercase rounded-2xl transition-all"
              >
                {loading ? "Creating..." : executionMode === "AUTO" ? "Create & Queue Mission" : "Create Manual Mission"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
