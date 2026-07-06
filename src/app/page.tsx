import { prisma } from "@/lib/prisma";
import { Bot, ListTodo, Lightbulb, Activity, Monitor, Cpu, Database, Thermometer, HardDrive } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [agents, pendingMissions, pendingIdeas, hostHealth] = await Promise.all([
      prisma.agentState.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.mission.count({ where: { status: "pending" } }),
      prisma.idea.count({ where: { status: "pending" } }),
      prisma.hostHealth.findMany({ orderBy: { updatedAt: "desc" } }),
    ]);
    const online = agents.filter((a) => a.status === "online" || a.status === "working").length;
    const totalCost = agents.reduce((s, a) => s + (a.totalCost || 0), 0);
    const totalTasks = agents.reduce((s, a) => s + (a.tasksCompleted || 0), 0);
    return { agents, online, total: agents.length, totalCost, totalTasks, pendingMissions, pendingIdeas, hostHealth };
  } catch (e) {
    return { agents: [], online: 0, total: 0, totalCost: 0, totalTasks: 0, pendingMissions: 0, pendingIdeas: 0, hostHealth: [] };
  }
}

export default async function HomePage() {
  const s = await getStats();
  // Fallback to Mint-Hub if found, else first entry
  const mint = s.hostHealth.find(h => h.hostname === "Mint-Hub") || s.hostHealth[0];

  return (
    <div className="p-8 max-w-[1200px] mx-auto min-h-screen text-slate-200">
      <div className="flex justify-between items-start mb-10">
        <div>
          <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white">Mission Control</h1>
          <p className="text-slate-400 font-medium">
            Every agent and node in your Hermes stack, at a glance.
          </p>
        </div>
        
        {/* Mint + NAS Health Card */}
        <div className="p-5 rounded-2xl flex flex-col gap-3 min-w-[280px] relative overflow-hidden" 
          style={{ 
            background: "rgba(30, 41, 59, 0.5)", 
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)"
          }}>
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400">
                <Monitor className="w-4 h-4" />
              </div>
              <span className="text-[12px] font-black tracking-widest text-cyan-400 uppercase">MINT HEALTH</span>
            </div>
            <div className={`w-2 h-2 rounded-full ${mint ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-1 z-10 text-white">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                <Cpu className="w-3 h-3" /> Load
              </div>
              <div className="text-[18px] font-bold tracking-tight">{mint?.cpuUsage || "--"}%</div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                <Thermometer className="w-3 h-3 text-orange-400" /> GPU
              </div>
              <div className="text-[18px] font-bold tracking-tight">{mint?.gpuTemp || "--"}°C</div>
            </div>
          </div>
          
          <div className="mt-1 pt-3 border-t border-white/5 z-10">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                <HardDrive className="w-3 h-3 text-indigo-400" /> NAS STORAGE
              </div>
              <span className={`text-[9px] font-black uppercase px-2 rounded ${mint?.nasConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {mint?.nasConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="text-[14px] font-bold text-white">{mint?.nasAvailable || "0"} GB <span className="text-[10px] text-slate-500 uppercase">free</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-10">
        <Kpi icon={<Bot className="w-4 h-4 text-cyan-400" />} label="Agents online" value={`${s.online} / ${s.total}`} />
        <Kpi icon={<Activity className="w-4 h-4 text-indigo-400" />} label="Tasks completed" value={s.totalTasks.toLocaleString()} />
        <Kpi icon={<ListTodo className="w-4 h-4 text-rose-400" />} label="Pending missions" value={String(s.pendingMissions)} />
        <Kpi icon={<Lightbulb className="w-4 h-4 text-amber-400" />} label="Ideas to review" value={String(s.pendingIdeas)} />
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-[20px] font-black uppercase tracking-tight text-white">The Collective</h2>
        <Link href="/agents" className="text-[13px] font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1">
          Full Registry <span className="text-cyan-400">→</span>
        </Link>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {s.agents.slice(0, 6).map((a) => (
          <div
            key={a.id}
            className="p-6 rounded-2xl flex items-center gap-5 transition-all hover:bg-white/[0.04] border relative overflow-hidden text-white"
            style={{ background: "rgba(30, 41, 59, 0.3)", borderColor: "rgba(255, 255, 255, 0.05)" }}
          >
            <div className="text-3xl bg-slate-800/50 p-3 rounded-2xl border border-white/5 z-10">{a.emoji || "🤖"}</div>
            <div className="flex-1 min-w-0 z-10">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="font-bold text-[16px] truncate text-white">{a.name}</div>
                <StatusDot status={a.status} />
              </div>
              <div className="text-[12px] text-slate-400 font-bold uppercase tracking-wide truncate opacity-80">
                {a.currentTask || a.role || "Standby"}
              </div>
            </div>
            <div className="text-right z-10">
              <div className="text-[11px] font-black text-slate-400 uppercase mb-1 tracking-tighter">{a.tasksCompleted} Actions</div>
              <div className="text-[15px] font-black text-cyan-400 font-mono">${(a.totalCost || 0).toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="p-6 rounded-2xl flex flex-col gap-2 transition-all hover:translate-y-[-4px] border shadow-lg"
      style={{ background: "rgba(30, 41, 59, 0.3)", borderColor: "rgba(255, 255, 255, 0.05)" }}
    >
      <div className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">
        <div className="p-1 px-1.5 bg-white/5 rounded border border-white/5">
          {icon}
        </div>
        {label}
      </div>
      <div className="text-[32px] font-black tracking-[-0.04em] text-white underline underline-offset-[12px] decoration-white/5 decoration-2">{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" || status === "working"
      ? "bg-cyan-400"
      : status === "error"
      ? "bg-rose-500"
      : status === "idle"
      ? "bg-amber-400"
      : "bg-slate-600";
      
  return (
    <span className="relative flex h-2.5 w-2.5">
      {(status === "online" || status === "working") && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}
