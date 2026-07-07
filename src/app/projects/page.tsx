import { getProjectLedger, getProjectsIndex } from "@/lib/agentos";
import { ListTodo, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400",
    paused: "bg-amber-500/20 text-amber-400",
    archived: "bg-slate-500/20 text-slate-400",
    abandoned: "bg-rose-500/20 text-rose-400",
  };
  return colors[status] || "bg-slate-500/20 text-slate-400";
}

export default async function ProjectsPage() {
  const [ledger, index] = await Promise.all([
    getProjectLedger(),
    getProjectsIndex(),
  ]);

  const ledgerProjectNames = new Set(ledger?.rows.map((r) => r.project) ?? []);

  // Index-only projects (not in ledger)
  const indexOnly = (index?.projects ?? []).filter(
    (p) => !ledgerProjectNames.has(p.name),
  );

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em] mb-2">Projects</h1>
      <p className="text-[var(--ink-2)] mb-8">
        Every tracked project from the AgentOS project ledger — across all agents.
      </p>

      {/* Ledger Table */}
      <div className="rounded-xl overflow-hidden mb-10" style={{ border: "1px solid var(--line)" }}>
        <table className="w-full text-[13.5px]">
          <thead style={{ background: "var(--panel)" }}>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
              <th className="p-3 font-medium">Project</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Contributors</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3 font-medium">Updated</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {!ledger || ledger.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[var(--ink-3)]">
                  No projects in AgentOS ledger yet.
                </td>
              </tr>
            ) : (
              ledger.rows.map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-3 font-medium">{r.project}</td>
                  <td className="p-3 text-[var(--ink-2)] text-[12px]">{r.type}</td>
                  <td className="p-3 text-[var(--ink-2)] text-[12px]">{r.contributors}</td>
                  <td className="p-3 text-[var(--ink-3)] text-[12px]">{r.created}</td>
                  <td className="p-3 text-[var(--ink-3)] text-[12px]">{r.lastUpdated}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--ink-2)] text-[12px] max-w-[300px] truncate" title={r.notes}>
                    {r.notes}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Index-only projects (registry drift) */}
      {indexOnly.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          <div className="p-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400"
            style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Registry Drift — index-only, not in ledger
          </div>
          <table className="w-full text-[13.5px]">
            <thead style={{ background: "var(--panel)" }}>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
                <th className="p-3 font-medium">Project</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Path</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {indexOnly.map((p) => (
                <tr key={p.name} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-[var(--ink-2)] text-[12px]">{p.type}</td>
                  <td className="p-3 text-[var(--ink-2)] text-[12px] font-mono">{p.path}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusBadge(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}