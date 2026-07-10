
import { prisma } from "@/lib/prisma";
import { Plus, Clock, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { CreateMissionButton } from "../../components/create-mission-button";
import { getAgents } from "@/lib/agentos";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const [missions, registry] = await Promise.all([
    prisma.mission.findMany({ orderBy: { createdAt: "desc" } }),
    getAgents(),
  ]);

  // Build agent list from AgentOS registry (always populated)
  const registryAgents = registry
    ? Object.entries(registry.agents).map(([id, a]) => ({
        id,
        name: a.name,
        emoji: "🤖",
      }))
    : [];

  // Add sub-agent profiles that respond to kanban requests (Hermes profiles)
  const agents = [
    ...registryAgents,
    { id: "research-bot", name: "Research Bot", emoji: "🔬" },
    { id: "web-bot", name: "Web Bot", emoji: "🌐" },
    { id: "writer-bot", name: "Writer Bot", emoji: "✍️" },
    { id: "mini", name: "Mini", emoji: "🔹" },
  ];

  const columns = [
    { title: "Pending", status: "pending", icon: <Circle className="w-4 h-4 text-slate-500" /> },
    { title: "Active", status: "active", icon: <Clock className="w-4 h-4 text-cyan-400" /> },
    { title: "Completed", status: "completed", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
    { title: "Failed", status: "failed", icon: <AlertCircle className="w-4 h-4 text-rose-500" /> },
  ];

  return (
    <div className="p-8 max-w-[1400px] mx-auto min-h-screen text-slate-200">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white uppercase italic">Task Board</h1>
          <p className="text-slate-400 font-medium">Kanban execution view for your digital workforce.</p>
        </div>
        <CreateMissionButton agents={agents} />
      </div>

      <div className="grid grid-cols-4 gap-6 items-start">
        {columns.map((col) => (
          <div key={col.status} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 px-2 mb-2">
              {col.icon}
              <span className="text-[12px] font-black uppercase tracking-widest text-white">{col.title}</span>
              <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                {missions.filter(m => m.status === col.status).length}
              </span>
            </div>

            <div className="flex flex-col gap-3 min-h-[500px] p-2 bg-black/10 rounded-3xl border border-white/5">
              {missions
                .filter((m) => m.status === col.status)
                .map((m) => (
                  <div
                    key={m.id}
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
                       {col.icon}
                    </div>
                    <h3 className="text-[15px] font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors tracking-tight">{m.title}</h3>
                    <p className="text-[12px] text-slate-400 mb-4 line-clamp-2 leading-relaxed">{m.description}</p>
                    {m.result && (
                      <div className="mb-4 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
                        <div className="text-[9px] font-black uppercase tracking-wider text-cyan-400 mb-1">Result</div>
                        <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-4">{m.result}</div>
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
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
