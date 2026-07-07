import { prisma } from "@/lib/prisma";
import { Calendar as CalendarIcon, Clock, Zap, Target } from "lucide-react";
import { getCronJobs } from "@/lib/agentos";

export const dynamic = "force-dynamic";

// Map cron names to emojis for the UI
const CRON_EMOJIS: Record<string, string> = {
  "gaming-newsletter-morning": "🌤️",
  "gaming-newsletter-afternoon": "🌇",
  "gaming-newsletter-weekly-summary": "🗞️",
  "gaming-morning-intel": "🧠",
  "destiny-news-hub-10am": "🚀",
  "destiny-petition-tracker-9pm": "✍️",
  "Autonomous Homelab Engineer": "👷",
  "ufo-site-overnight-build": "🛸",
  "obsidian-todo-sync": "📓",
  "mint-health-monitor": "🖥️",
  "thingiverse-weekly-popular": "🧊",
  "hermes-library-sync": "📚",
  "daily-health-summary": "🩺",
  "git-backup-guardian": "💾",
  "Tailscale Watchdog": "🐕",
  "homelab-heartbeat": "💓",
  "morning-intel": "🌅",
  "mc-heartbeat-reporter": "🛰️",
};

/** Format a cron schedule into a human-readable cadence string. */
function formatCadence(job: { schedule?: { display?: string; expr?: string } }): string {
  if (job.schedule?.display) return job.schedule.display;
  if (job.schedule?.expr) {
    if (job.schedule.expr.startsWith("every")) {
      const m = job.schedule.expr.match(/every\s+(\d+)(m|h)/);
      if (m) return m[1] === "5" ? "Watchdog" : `Every ${m[1]}${m[2] === "m" ? "m" : "h"}`;
    }
    // Simple cron expression → rough cadence
    const parts = job.schedule.expr.split(/\s+/);
    if (parts.length >= 5) {
      if (parts[1] === "*" && parts[2] === "*" && parts[4] === "*") return "Daily";
      if (parts[4] !== "*") return "Weekly";
      return "Recurring";
    }
  }
  return "Scheduled";
}

/** Format next_run_at or last_run_at into a friendly time string. */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const absMin = Math.abs(diffMs) / 60000;

  if (absMin < 1) return "now";
  if (absMin < 60) return `${Math.round(absMin)}m`;
  if (absMin < 1440) return `${Math.floor(absMin / 60)}h`;
  // Show date + time for farther out
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric" });
}

/** Format last_status as a display label. */
function statusLabel(status: string | null | undefined): string {
  if (!status) return "unknown";
  return status;
}

function statusColor(status: string | null | undefined): string {
  if (status === "ok") return "text-[#00ffcc]";
  if (status === "error") return "text-rose-400";
  return "text-slate-500";
}

export default async function CalendarPage() {
  const jobs = await getCronJobs();

  // If cron data is unavailable, show a banner instead of hardcoded data
  if (!jobs) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto min-h-screen text-slate-200">
        <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white uppercase italic">Operations Schedule</h1>
        <p className="text-slate-400 font-medium mb-10">Visual timeline of your digital workforce&apos;s automated runs.</p>
        <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-[14px] font-medium">
          Cron data unavailable — AgentOS readers could not load ~/.hermes/cron/jobs.json.
        </div>
      </div>
    );
  }

  // Sort: failing jobs first, then by next_run_at (earliest first)
  const sorted = [...jobs].sort((a, b) => {
    const aFailing = a.enabled && a.last_status === "error" ? 0 : 1;
    const bFailing = b.enabled && b.last_status === "error" ? 0 : 1;
    if (aFailing !== bFailing) return aFailing - bFailing;
    // Then by next_run_at
    const aTime = a.next_run_at ? new Date(a.next_run_at).getTime() : Infinity;
    const bTime = b.next_run_at ? new Date(b.next_run_at).getTime() : Infinity;
    return aTime - bTime;
  });

  return (
    <div className="p-8 max-w-[1200px] mx-auto min-h-screen text-slate-200">
      <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white uppercase italic">Operations Schedule</h1>
      <p className="text-slate-400 font-medium mb-10">Visual timeline of your digital workforce&apos;s automated runs.</p>

      <div className="grid grid-cols-1 gap-4">
        {sorted.map((job) => (
          <div 
            key={job.id}
            className="p-5 rounded-2xl flex items-center justify-between border transition-all hover:bg-white/[0.04]"
            style={{ background: "rgba(30, 41, 59, 0.3)", borderColor: "rgba(255, 255, 255, 0.05)" }}
          >
            <div className="flex items-center gap-4">
              <div className="text-3xl bg-slate-800/50 p-3 rounded-2xl border border-white/5">
                {CRON_EMOJIS[job.name] || "🤖"}
              </div>
              <div>
                <div className="text-[16px] font-bold text-white tracking-tight">{job.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="px-2 py-0.5 bg-slate-800 rounded text-[9px] font-black text-slate-400 uppercase border border-white/5 tracking-widest">{formatCadence(job)}</div>
                  <div className="text-[11px] text-cyan-400 font-bold flex items-center gap-1">
                    <Clock size={12} /> {job.next_run_at ? formatTime(job.next_run_at) : "—"}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 relative">
              <div className="text-right">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Status</div>
                <div className={`text-[12px] font-bold uppercase ${statusColor(job.last_status)}`}>
                  {statusLabel(job.last_status)}
                  {job.enabled === false && " (disabled)"}
                </div>
                {job.enabled && job.last_status === "error" && job.last_error && (
                  <div className="text-[9px] text-rose-400/70 max-w-[180px] truncate mt-0.5" title={job.last_error}>
                    {job.last_error}
                  </div>
                )}
              </div>
              <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5 text-slate-400">
                {job.last_status === "error" ? (
                  <span className="text-rose-400 text-[18px]">⚠</span>
                ) : (
                  <Zap size={16} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
