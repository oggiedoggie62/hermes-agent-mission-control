
"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function CreateMissionButton({ agents }: { agents: { id: string; name: string; emoji: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target as HTMLFormElement);
    
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      agentId: formData.get("agentId"),
      priority: formData.get("priority"),
    };

    try {
      await fetch("/api/missions", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-[12px] uppercase rounded-full transition-all flex items-center gap-2"
      >
        <Plus size={16} /> New Mission
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
                <input required name="title" className="bg-slate-800 border border-white/5 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors" placeholder="e.g. Scrape new leaks" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Details</label>
                <textarea name="description" className="bg-slate-800 border border-white/5 rounded-xl px-4 py-2 text-white h-24 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="Mission parameters..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assign Agent</label>
                  <select name="agentId" className="bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors">
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</label>
                  <select name="priority" className="bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 transition-colors">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="mt-4 w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-black uppercase rounded-2xl transition-all"
              >
                {loading ? "Deploying..." : "Launch Mission"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
