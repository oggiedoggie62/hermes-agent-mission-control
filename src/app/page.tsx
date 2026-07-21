/* agent: codex | model: gpt-5.5 | date: 2026-07-20 */
import { Bot, ListTodo, Lightbulb, Activity, Monitor, Cpu, Database, Thermometer, HardDrive, Cpu as CpuIcon, Share2, BookOpen } from "lucide-react";
import Link from "next/link";
import { getAgents, getProjectLedger, getCronJobs, getGraphifyData, getDecisions, getKnowledgeTree, getRegistryServices } from "@/lib/agentos";
import { getOperationsSummary } from "@/lib/operations-summary";
import { OperationsSummaryPanel } from "@/components/operations-summary";
import { getMissionAgentChoices } from "@/lib/mission-agents";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ops = await getOperationsSummary();

  // AgentOS widget data (graceful if unavailable)
  const [agentosAgents, agentosLedger, agentosCron, missionAgents] = await Promise.all([
    getAgents().catch(() => null),
    getProjectLedger().catch(() => null),
    getCronJobs().catch(() => null),
    getMissionAgentChoices(),
  ]);
  const agentosActive = agentosAgents
    ? Object.values(agentosAgents.agents).filter((a) => a.state === "active").length
    : null;
  const ledgerActive = agentosLedger
    ? agentosLedger.rows.filter((r) => r.status === "active").length
    : null;
  const cronFailing = agentosCron
    ? agentosCron.filter((j) => j.enabled && j.last_status === "error").length
    : null;
  const agentosAvailable = agentosActive !== null && ledgerActive !== null && cronFailing !== null;

  // Graphify knowledge graph data
  const graphifyData = await getGraphifyData();

  // Phase 4 — recent decisions, knowledge summary, services
  const [decisions, knowledgeTree, services] = await Promise.all([
    getDecisions(5).catch(() => []),
    getKnowledgeTree().catch(() => []),
    getRegistryServices().catch(() => null),
  ]);
  const serviceCount = services?.services.length ?? null;
  const docCount = knowledgeTree.filter((n) => !n.isDir).length;
  const decisionCount = decisions.length;

  // Fallback to Mint-Hub if found, else first entry
  const hostHealth = ops.hostHealth.value ?? [];
  const mint = hostHealth.find((host) => host.hostname === "Mint-Hub") || hostHealth[0];
  const agentStats = ops.agentState.value;

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
              <div className="text-[18px] font-bold tracking-tight">{ops.hostHealth.available ? `${mint?.cpuUsage ?? "—"}%` : "—"}</div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                <Thermometer className="w-3 h-3 text-orange-400" /> GPU
              </div>
              <div className="text-[18px] font-bold tracking-tight">{ops.hostHealth.available ? `${mint?.gpuTemp ?? "—"}°C` : "—"}</div>
            </div>
          </div>
          
          <div className="mt-1 pt-3 border-t border-white/5 z-10">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                <HardDrive className="w-3 h-3 text-indigo-400" /> NAS STORAGE
              </div>
              <span className={`text-[9px] font-black uppercase px-2 rounded ${mint?.nasConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {!ops.hostHealth.available ? 'UNAVAILABLE' : mint?.nasConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="text-[14px] font-bold text-white">{ops.hostHealth.available ? (mint?.nasAvailable ?? "—") : "—"} <span className="text-[10px] text-slate-500 uppercase">{ops.hostHealth.available ? "GB free" : "Unavailable"}</span></div>
          </div>
        </div>
      </div>

      <OperationsSummaryPanel summary={ops} agents={missionAgents} />

      <div className="grid grid-cols-4 gap-5 mb-10">
        <Kpi icon={<Bot className="w-4 h-4 text-cyan-400" />} label="Agents online" value={agentStats ? `${agentStats.online} / ${agentStats.total}` : "—"} />
        <Kpi icon={<Activity className="w-4 h-4 text-indigo-400" />} label="Tasks completed" value={agentStats ? agentStats.totalTasks.toLocaleString() : "—"} />
        <Kpi icon={<ListTodo className="w-4 h-4 text-rose-400" />} label="Pending missions" value={ops.missions.available ? String(ops.missions.queued) : "—"} />
        <Kpi icon={<Lightbulb className="w-4 h-4 text-amber-400" />} label="Ideas to review" value={ops.pendingIdeas.available ? String(ops.pendingIdeas.value) : "—"} />
      </div>

      <div
        className="p-5 rounded-2xl flex flex-col gap-3 mb-10 relative overflow-hidden"
        style={{
          background: "rgba(30, 41, 59, 0.5)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div className="flex items-center gap-2 text-[12px] font-black tracking-widest text-cyan-400 uppercase">
          <CpuIcon className="w-4 h-4" />
          AgentOS
        </div>
        {agentosAvailable ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Agents Active</div>
              <div className="text-[24px] font-black tracking-tight text-white">{agentosActive}</div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Projects Active</div>
              <div className="text-[24px] font-black tracking-tight text-white">{ledgerActive}</div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Crons Failing</div>
              <div className={`text-[24px] font-black tracking-tight ${cronFailing > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {cronFailing}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-slate-400 font-medium">AgentOS: source unavailable</div>
        )}
      </div>

      {/* Graphify Knowledge Graph */}
      {graphifyData.length > 0 && (
        <div
          className="p-5 rounded-2xl flex flex-col gap-3 mb-10 relative overflow-hidden"
          style={{
            background: "rgba(30, 41, 59, 0.5)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] font-black tracking-widest text-cyan-400 uppercase">
            <Share2 className="w-4 h-4" />
            Knowledge Graph
          </div>
          <div className="grid grid-cols-1 gap-4">
            {graphifyData.map((g) => (
              <div key={g.project} className="flex flex-col gap-2">
                <div className="text-[13px] font-bold text-white">{g.project}</div>
                {g.reportSummary && (
                  <div className="text-[12px] text-slate-300 leading-relaxed">{g.reportSummary}</div>
                )}
                <div className="grid grid-cols-3 gap-3 mt-1">
                  <div className="flex flex-col">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Nodes</div>
                    <div className="text-[18px] font-black text-white">{g.nodeCount}</div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Edges</div>
                    <div className="text-[18px] font-black text-white">{g.edgeCount}</div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Communities</div>
                    <div className="text-[18px] font-black text-white">{g.communityCount}</div>
                  </div>
                </div>
                <div className="flex gap-3 mt-1">
                  {g.hasGraphHtml && (
                    <a
                      href={`/api/files?path=${encodeURIComponent(g.graphPath + "/graph.html")}`}
                      className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Graph →
                    </a>
                  )}
                  {g.hasGraphTreeHtml && (
                    <a
                      href={`/api/files?path=${encodeURIComponent(g.graphPath + "/GRAPH_TREE.html")}`}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Tree →
                    </a>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">Last updated: {new Date(g.lastUpdated).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Decisions — Phase 4 */}
      <div
        className="p-5 rounded-2xl flex flex-col gap-3 mb-10 relative overflow-hidden"
        style={{
          background: "rgba(30, 41, 59, 0.5)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div className="flex items-center gap-2 text-[12px] font-black tracking-widest text-cyan-400 uppercase">
          <BookOpen className="w-4 h-4" />
          Recent Decisions &amp; Knowledge
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Decisions */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Decisions</div>
            {decisionCount > 0 ? (
              <ul className="space-y-1">
                {decisions.map((d, i) => (
                  <li key={i}>
                    <a
                      href={`/api/files?path=${encodeURIComponent("/home/oggie/AI/AgentOS/Memory/decisions/" + d.file)}`}
                      className="text-[12px] text-cyan-300 hover:text-cyan-200 underline underline-offset-1"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {d.file.replace(".md", "")}
                    </a>
                    {d.headings.length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {d.headings.slice(0, 3).join(" · ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-slate-500">No decisions logged yet.</div>
            )}
            <Link href="/library" className="text-[10px] font-bold text-slate-400 hover:text-white mt-1">
              View all docs →
            </Link>
          </div>

          {/* Knowledge docs summary */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Knowledge Docs</div>
            <div className="text-[24px] font-black tracking-tight text-white">{docCount}</div>
            <div className="text-[11px] text-slate-400">markdown files across Knowledge/</div>
            <Link href="/library" className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 mt-1">
              Browse library →
            </Link>
          </div>

          {/* Registered services */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Services</div>
            {serviceCount !== null ? (
              <>
                <div className="text-[24px] font-black tracking-tight text-white">{serviceCount}</div>
                <div className="text-[11px] text-slate-400">registered in AgentOS</div>
              </>
            ) : (
              <div className="text-[12px] text-slate-500">Unavailable</div>
            )}
            <Link href="/library" className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 underline underline-offset-2 mt-1">
              View services →
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-[20px] font-black uppercase tracking-tight text-white">The Collective</h2>
        <Link href="/agents" className="text-[13px] font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1">
          Full Registry <span className="text-cyan-400">→</span>
        </Link>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {agentStats ? agentStats.agents.slice(0, 6).map((a) => (
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
        )) : (
          <div className="col-span-2 rounded-xl border border-white/5 bg-black/20 p-5 text-sm font-semibold text-slate-400">
            Agent state unavailable.
          </div>
        )}
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
