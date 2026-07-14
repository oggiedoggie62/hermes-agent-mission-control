/* agent: codex | model: gpt-5 | date: 2026-07-13 */
"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export interface ArchivedMission {
  id: string;
  agentId: string;
  title: string;
  description: string;
  result: string | null;
  debriefPath: string | null;
  completedAt: string | null;
}

interface ArchiveClientProps {
  missions: ArchivedMission[];
}

export function ArchiveClient({ missions }: ArchiveClientProps) {
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("all");

  const agents = useMemo(
    () => Array.from(new Set(missions.map((mission) => mission.agentId))).sort(),
    [missions],
  );

  const filteredMissions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return missions.filter((mission) => {
      if (agentId !== "all" && mission.agentId !== agentId) return false;
      if (!normalizedQuery) return true;

      return [
        mission.title,
        mission.description,
        mission.result,
        mission.debriefPath,
        mission.agentId,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [agentId, missions, query]);

  const hasFilters = query.trim().length > 0 || agentId !== "all";

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search archived missions</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, result, debrief, or agent"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-3 text-[13px] text-white outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-400/50"
          />
        </label>

        <label>
          <span className="sr-only">Filter archived missions by agent</span>
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            className="h-10 min-w-44 rounded-xl border border-white/10 bg-[var(--panel)] px-3 text-[13px] text-slate-300 outline-none focus:border-indigo-400/50"
          >
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500" aria-live="polite">
        {filteredMissions.length} of {missions.length} archived missions
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredMissions.length > 0 ? (
          filteredMissions.map((mission) => (
            <div
              key={mission.id}
              className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="truncate text-[15px] font-bold text-white">{mission.title}</h3>
                <span className="flex-none text-[10px] font-black uppercase text-slate-500">
                  {mission.completedAt ? new Date(mission.completedAt).toLocaleDateString() : "No date"}
                </span>
              </div>
              <div className="truncate text-[12px] text-slate-400 line-clamp-1">
                <span className="font-bold text-cyan-400">Result:</span> {mission.result || "No result"}
              </div>
              <div className="truncate text-[12px] text-slate-500 line-clamp-1">
                <span className="font-bold text-indigo-400">Debrief:</span>{" "}
                {mission.debriefPath ? (
                  <Link
                    href={`/library/doc?path=${encodeURIComponent(mission.debriefPath)}`}
                    className="text-indigo-300 underline underline-offset-2 transition-colors hover:text-indigo-200"
                  >
                    {mission.debriefPath.split("/").pop()}
                  </Link>
                ) : (
                  "No debrief"
                )}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Agent: {mission.agentId}
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center text-slate-500 italic">
            {hasFilters ? "No archived missions match these filters." : "No archived missions found."}
          </div>
        )}
      </div>
    </>
  );
}
