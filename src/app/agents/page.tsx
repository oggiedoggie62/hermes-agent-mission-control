import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  let agents: Array<{
    id: string;
    name: string;
    emoji: string | null;
    role: string | null;
    status: string;
    lastActive: Date | null;
    tasksCompleted: number;
    totalCost: number;
    currentTask: string | null;
  }> = [];
  try {
    agents = await prisma.agentState.findMany({ orderBy: { name: "asc" } });
  } catch {}

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em] mb-2">Agents</h1>
      <p className="text-[var(--ink-2)] mb-8">
        Every agent your Hermes stack is running. They self-report here via{" "}
        <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--panel)" }}>
          POST /api/agents/state
        </code>
        .
      </p>

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
                <td className="p-3 text-[var(--ink-2)] truncate max-w-[280px]">
                  {a.currentTask || "-"}
                </td>
                <td className="p-3 text-right">{a.tasksCompleted}</td>
                <td className="p-3 text-right">${a.totalCost.toFixed(2)}</td>
                <td className="p-3 text-[var(--ink-3)]">
                  {a.lastActive ? new Date(a.lastActive).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[var(--ink-3)]">
                  No agents yet. Run{" "}
                  <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--panel)" }}>
                    npm run seed:demo
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
