/* agent: codex | model: gpt-5 | date: 2026-07-13 */
"use client";

import { Search, X } from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
}

interface MissionBoardFiltersProps {
  query: string;
  agentId: string;
  priority: string;
  status: string;
  agents: string[];
  statuses: FilterOption[];
  shownCount: number;
  totalCount: number;
  awaitingReviewCount: number;
  onQueryChange: (value: string) => void;
  onAgentChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onClear: () => void;
}

export function MissionBoardFilters({
  query,
  agentId,
  priority,
  status,
  agents,
  statuses,
  shownCount,
  totalCount,
  awaitingReviewCount,
  onQueryChange,
  onAgentChange,
  onPriorityChange,
  onStatusChange,
  onClear,
}: MissionBoardFiltersProps) {
  const hasFilters = query.trim().length > 0 || agentId !== "all" || priority !== "all" || status !== "all";

  return (
    <section aria-label="Mission review filters" className="mb-6 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search missions</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search title, description, result, or agent"
            className="h-10 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 text-[13px] text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/50"
          />
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label>
            <span className="sr-only">Filter missions by agent</span>
            <select
              value={agentId}
              onChange={(event) => onAgentChange(event.target.value)}
              className="h-10 w-full min-w-36 rounded-xl border border-white/10 bg-[var(--panel)] px-3 text-[13px] text-slate-300 outline-none focus:border-cyan-400/50"
            >
              <option value="all">All agents</option>
              {agents.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Filter missions by priority</span>
            <select
              value={priority}
              onChange={(event) => onPriorityChange(event.target.value)}
              className="h-10 w-full min-w-36 rounded-xl border border-white/10 bg-[var(--panel)] px-3 text-[13px] text-slate-300 outline-none focus:border-cyan-400/50"
            >
              <option value="all">All priorities</option>
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
          </label>

          <label>
            <span className="sr-only">Filter missions by status</span>
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value)}
              className="h-10 w-full min-w-36 rounded-xl border border-white/10 bg-[var(--panel)] px-3 text-[13px] text-slate-300 outline-none focus:border-cyan-400/50"
            >
              <option value="all">All statuses</option>
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-xl px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider" aria-live="polite">
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-400">
          {shownCount} of {totalCount} missions shown
        </span>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
          {awaitingReviewCount} completed awaiting review
        </span>
      </div>
    </section>
  );
}
