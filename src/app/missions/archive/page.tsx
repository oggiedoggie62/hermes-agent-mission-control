/* agent: codex | model: gpt-5 | date: 2026-07-13 */
import { ArchiveClient, type ArchivedMission } from "./archive-client";

export default async function ArchivePage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/missions/archive`, {
    cache: "no-store",
  });
  const data: unknown = await res.json();
  const archivedMissions = Array.isArray(data) ? (data as ArchivedMission[]) : [];

  return (
    <div className="p-8 max-w-[1400px] mx-auto min-h-screen text-slate-200">
      <div className="mb-10">
        <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white uppercase italic">Mission Archives</h1>
        <p className="text-slate-400 font-medium">Completed missions, reviewed and archived.</p>
      </div>

      <ArchiveClient missions={archivedMissions} />
    </div>
  );
}
