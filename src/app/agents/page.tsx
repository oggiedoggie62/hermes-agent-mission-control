import { prisma } from "@/lib/prisma";
import { getAgents } from "@/lib/agentos";
import { Bot, Cpu, Globe, HardDrive, GitBranch, Terminal } from "lucide-react";

export const dynamic = "force-dynamic";

function permIcon(key: string) {
  switch (key) {
    case "filesystem": return <HardDrive className="w-3 h-3" />;
    case "network": return <Globe className="w-3 h-3" />;
    case "docker": return <Terminal className="w-3 h-3" />;
    case "git": return <GitBranch className="w-3 h-3" />;
    default: return <Cpu className="w-3 h-3" />;
  }
}

function permColor(val: string) {
  if (val === "full") return "text-emerald-400";
  if (val === "limited" || val === "read-only") return "text-amber-400";
  return "text-slate-500";
}

function statusColor(state: string) {
  if (state === "active") return "text-emerald-400";
  if (state === "idle") return "text-amber-400";
  if (state === "inactive") return "text-slate-500";
  return "text-slate-400";
}

export default async function AgentsPage() {
  const [registry, agents] = await Promise.all([
    getAgents(),
    (async () => {
      try {
        return await prisma.agentState.findMany({ orderBy: { name: "asc" } });
      } catch { return []; }
    })(),
  ]);

  const registryAgents = registry ? Object.entries(registry.agents) : [];

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em] mb-2">Agents</h1>
      <p className="text-[var(--ink-2)] mb-8">
        Who agents <em>are</em> (AgentOS registry) and what they&apos;re doing <em>right now</em> (live heartbeat).
      </p>

      {/* AgentOS Registry Table */}
      <h2 className="text-[14px] font-bold uppercase tracking-wider text-[var(--ink-2)] mb-3">AgentOS Registry</h2>
      <div className="rounded-xl overflow-hidden mb-10" style={{ border: "1px solid var(--line)" }}>
        <table className="w-full text-[13.5px]">
          <thead style={{ background: "var(--panel)" }}>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Model</th>
              <th className="p-3 font-medium">State</th>
              <th className="p-3 font-medium">Permissions</th>
              <th className="p-3 font-medium">Projects</th>
              <th className="p-3 font-medium">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {registryAgents.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[var(--ink-3)]">
                  AgentOS registry unavailable.
                </td>
              </tr>
            ) : registryAgents.map(([key, a]) => (
              <tr key={key} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="p-3 font-medium">
                  <span className="mr-2"><Bot className="w-4 h-4 inline text-cyan-400" /></span>
                  {a.name}
                </td>
                <td className="p-3 text-[var(--ink-2)] text-[12px]">{a.role}</td>
                <td className="p-3 text-[var(--ink-2)] text-[12px]">{a.preferred_model || "-"}</td>
                <td className={`p-3 font-semibold text-[12px] ${statusColor(a.state)}`}>{a.state}</td>
                <td className="p-3">
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(a.permissions || {}).map(([k, v]) => (
                      <span key={k} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${permColor(v as string)}`}
                        title={`${k}: ${v}`}>
                        {permIcon(k)}{v as string}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-[var(--ink-2)] text-[12px]">
                  {(a.current_projects?.length ?? 0) > 0
                    ? a.current_projects.join(", ")
                    : "-"}
                </td>
                <td className="p-3 text-[var(--ink-3)] text-[11px]">
                  {a.last_active ? new Date(a.last_active).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live Heartbeat (Prisma) Table */}
      <h2 className="text-[14px] font-bold uppercase tracking-wider text-[var(--ink-2)] mb-3">Live Heartbeat</h2>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
        <table className="w-full text-[13.5px]">
          <thead style={{ background: "var(--panel)" }}>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
              <th className="p-3 font-medium">Agent</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Current task</th>
              <th className="p-3 font-medium text-right">Tasks</th>
              <th className="p-3 font-medium text-right">Cost</th>
              <th className="p-3 font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="p-3 font-medium">
                  <span className="mr-2">{a.emoji || "🤖"}</span>
                  {a.name}
                </td>
                <td className="p-3 text-[var(--ink-2)]">{a.role || "-"}</td>
                <td className="p-3">{a.status}</td>
                <td className="p-3 text-[var(--ink-2)] truncate max-w-[280px]">{a.currentTask || "-"}</td>
                <td className="p-3 text-right">{a.tasksCompleted}</td>
                <td className="p-3 text-right">${(a.totalCost || 0).toFixed(2)}</td>
                <td className="p-3 text-[var(--ink-3)]">
                  {a.lastActive ? new Date(a.lastActive).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[var(--ink-3)]">
                  No heartbeat data yet. Agents self-report via{" "}
                  <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--panel)" }}>
                    POST /api/agents/state
                  </code>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
