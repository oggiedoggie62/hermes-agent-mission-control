import { prisma } from "@/lib/prisma";
import { Calendar as CalendarIcon, Clock, Zap, Target } from "lucide-react";

export const dynamic = "force-dynamic";

// Map cron names to emojis for the UI
const CRON_EMOJIS: Record<string, string> = {
  "gaming-newsletter-morning": "🌤️",
  "gaming-newsletter-afternoon": "🌇",
  "gaming-newsletter-weekly-summary": "🗞️",
  "destiny-news-hub-10am": "🚀",
  "destiny-petition-tracker-9pm": "✍️",
  "Autonomous Homelab Engineer": "👷",
  "ufo-site-overnight-build": "🛸",
  "obsidian-todo-sync": "📓",
  "mint-health-monitor": "🖥️",
  "hero-mission-control-sync": "🛰️",
  "thingiverse-weekly-popular": "🧊"
};

export default async function CalendarPage() {
  // Normally we would pull these from the Hermes CLI/API, 
  // but for the dashboard we will mock the current scheduled jobs we found in cronjob list.
  
  const schedules = [
    { name: "Autonomous Homelab Engineer", time: "08:00 AM", cadence: "Daily", status: "Active" },
    { name: "gaming-newsletter-morning", time: "09:00 AM", cadence: "Daily", status: "Active" },
    { name: "destiny-news-hub-10am", time: "10:00 AM", cadence: "Daily", status: "Active" },
    { name: "gaming-newsletter-afternoon", time: "04:00 PM", cadence: "Daily", status: "Active" },
    { name: "destiny-petition-tracker-9pm", time: "09:00 PM", cadence: "Daily", status: "Active" },
    { name: "thingiverse-weekly-popular", time: "Mon 09:00 AM", cadence: "Weekly", status: "Active" },
    { name: "gaming-newsletter-weekly-summary", time: "Sun 12:00 PM", cadence: "Weekly", status: "Active" },
    { name: "ufo-site-overnight-build", time: "Every 12h", cadence: "Recurring", status: "Active" },
    { name: "mint-health-monitor", time: "Every 5m", cadence: "Watchdog", status: "Active" },
    { name: "hermes-library-sync", time: "Every 1h", cadence: "Sync", status: "Active" },
  ];

  return (
    <div className="p-8 max-w-[1200px] mx-auto min-h-screen text-slate-200">
      <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white uppercase italic">Operations Schedule</h1>
      <p className="text-slate-400 font-medium mb-10">Visual timeline of your digital workforce's automated runs.</p>

      <div className="grid grid-cols-1 gap-4">
        {schedules.map((s) => (
          <div 
            key={s.name} 
            className="p-5 rounded-2xl flex items-center justify-between border transition-all hover:bg-white/[0.04]"
            style={{ background: "rgba(30, 41, 59, 0.3)", borderColor: "rgba(255, 255, 255, 0.05)" }}
          >
            <div className="flex items-center gap-4">
              <div className="text-3xl bg-slate-800/50 p-3 rounded-2xl border border-white/5">
                {CRON_EMOJIS[s.name] || "🤖"}
              </div>
              <div>
                <div className="text-[16px] font-bold text-white tracking-tight">{s.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="px-2 py-0.5 bg-slate-800 rounded text-[9px] font-black text-slate-400 uppercase border border-white/5 tracking-widest">{s.cadence}</div>
                  <div className="text-[11px] text-cyan-400 font-bold flex items-center gap-1">
                    <Clock size={12} /> {s.time}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
               <div className="text-right">
                 <div className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Status</div>
                 <div className="text-[12px] font-bold text-[#00ffcc] uppercase">Active</div>
               </div>
               <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5 text-slate-400">
                  <Zap size={16} />
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
