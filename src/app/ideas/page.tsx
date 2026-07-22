/* agent: codex | model: gpt-5 | date: 2026-07-21 */
"use client";

import { useState, useEffect } from "react";
import { ArrowDown, Check, CheckCircle2, CircleCheckBig, Lightbulb, Pencil, Send, X } from "lucide-react";
import { CreateMissionButton } from "@/components/create-mission-button";
import { beginCaptureEdit, cancelCaptureEdit, EMPTY_CAPTURE_EDIT, saveCaptureEdit } from "@/lib/capture-edit";

type CaptureType = "idea" | "todo";

interface Idea {
  id: string;
  title: string;
  description: string | null;
  type: CaptureType;
  source: string | null;
  status: string | null;
  timestamp: string;
  updatedAt: string;
}

interface MissionAgent {
  id: string;
  name: string;
  emoji: string | null;
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [agents, setAgents] = useState<MissionAgent[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CaptureType>("idea");
  const [saving, setSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(EMPTY_CAPTURE_EDIT);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/ideas").then((r) => r.json()),
      fetch("/api/missions").then((r) => r.json()),
    ])
      .then(([captures, missionData]) => {
        setIdeas(captures);
        setAgents(missionData.agents || []);
      })
      .catch(() => setFeedback({ kind: "error", message: "Failed to load captures or Mission agents." }));
  }, []);

  async function promoteToTodo(idea: Idea) {
    setPromotingId(idea.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote-to-todo" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to promote Idea");

      setIdeas((current) => current.map((item) => item.id === idea.id ? data : item));
      setFeedback({ kind: "success", message: `“${idea.title}” promoted to To-Do.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Failed to promote Idea" });
    } finally {
      setPromotingId(null);
    }
  }

  async function markMissionPromoted(idea: Idea) {
    const res = await fetch(`/api/ideas/${idea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark-promoted" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Mission created, but the To-Do could not be marked promoted");

    setIdeas((current) => current.filter((item) => item.id !== idea.id));
    setFeedback({ kind: "success", message: `“${idea.title}” promoted to Mission.` });
  }

  async function saveEdit(idea: Idea) {
    setEdit((current) => ({ ...current, saving: true, error: null }));
    setFeedback(null);
    const result = await saveCaptureEdit({ ...edit, saving: true, error: null }, idea);
    setEdit(result.state);
    if (result.capture) {
      setIdeas((current) => current.map((item) => item.id === idea.id ? result.capture as Idea : item));
      setFeedback({ kind: "success", message: `${idea.type === "todo" ? "To-Do" : "Idea"} updated.` });
    } else {
      setFeedback({ kind: "error", message: `${result.error}. Your edited text is still here to retry.` });
    }
  }

  async function loadLatestForComparison(id: string) {
    try {
      const response = await fetch("/api/ideas", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the latest saved value");
      const captures = await response.json() as Idea[];
      const latest = captures.find((capture) => capture.id === id);
      if (!latest) throw new Error("This item is no longer active");
      setIdeas((current) => current.map((item) => item.id === id ? latest : item));
      setFeedback({ kind: "success", message: "Latest saved value loaded for comparison. Your draft was preserved." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not load latest value" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type }),
      });
      if (res.ok) {
        const newIdea = await res.json();
        setIdeas((prev) => [newIdea, ...prev]);
        setTitle("");
        setFeedback({ kind: "success", message: `${type === "todo" ? "To-Do" : "Idea"} captured.` });
      } else {
        const data = await res.json().catch(() => null);
        setFeedback({ kind: "error", message: data?.error || "Capture failed. Try again." });
      }
    } catch {
      setFeedback({ kind: "error", message: "Capture failed. Check the connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-[1000px] mx-auto">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em] mb-2">Ideas &amp; To-Dos</h1>
      <p className="text-[var(--ink-2)] mb-8">Capture first. Organize and promote later.</p>

      <form onSubmit={submit} className="p-5 rounded-2xl mb-8 flex flex-col gap-4" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-2)]">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          Quick Capture
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            autoFocus
            type="text"
            aria-label="Quick capture text"
            placeholder="What do you want to remember or do?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-black/20 px-4 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-cyan-400"
          />
          <select
            aria-label="Capture type"
            value={type}
            onChange={(e) => setType(e.target.value as CaptureType)}
            className="h-12 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[13px] font-bold text-white outline-none focus:border-cyan-400"
          >
            <option value="idea">Idea</option>
            <option value="todo">To-Do</option>
          </select>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[12px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            <Send className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Capture"}
          </button>
        </div>
        {feedback && (
          <div
            role={feedback.kind === "error" ? "alert" : "status"}
            className={`flex items-center gap-2 text-[12px] font-medium ${feedback.kind === "success" ? "text-emerald-400" : "text-rose-400"}`}
          >
            {feedback.kind === "success" && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {feedback.message}
          </div>
        )}
      </form>

      <div className="flex flex-col gap-2">
        {ideas.length === 0 ? (
          <div className="p-6 text-center text-[var(--ink-3)]">No ideas yet. Capture one above!</div>
        ) : (
          ideas.map((i) => (
            <div key={i.id} className="p-4 rounded-xl" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <div className="mb-1 flex items-center gap-2">
                {i.type === "todo" ? (
                  <CircleCheckBig className="h-4 w-4 flex-none text-cyan-400" aria-hidden="true" />
                ) : (
                  <Lightbulb className="h-4 w-4 flex-none text-amber-400" aria-hidden="true" />
                )}
                {edit.editingId === i.id ? (
                  <input
                    aria-label={`Edit ${i.type === "todo" ? "To-Do" : "Idea"} text`}
                    value={edit.draft}
                    onChange={(event) => setEdit((current) => ({ ...current, draft: event.target.value, error: null }))}
                    className="min-w-0 flex-1 rounded-lg border border-cyan-500/40 bg-black/20 px-3 py-1.5 text-[14px] font-medium text-white outline-none focus:border-cyan-400"
                  />
                ) : (
                  <div className="font-medium text-[14px]">{i.title}</div>
                )}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${i.type === "todo" ? "bg-cyan-500/10 text-cyan-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {i.type === "todo" ? "To-Do" : "Idea"}
                </span>
              </div>
              {i.description && <div className="text-[13px] text-[var(--ink-2)] mb-2">{i.description}</div>}
              <div className="text-[11px] text-[var(--ink-3)]">
                {i.source || "unknown"} · {i.status || "pending"}
              </div>
              {edit.editingId === i.id && edit.error && (
                <div role="alert" className="mt-2 space-y-1 text-[11px] font-medium text-rose-400">
                  <div>{edit.error}</div>
                  <div className="text-slate-400">Latest saved: “{i.title}”</div>
                  <button
                    type="button"
                    onClick={() => loadLatestForComparison(i.id)}
                    className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
                  >
                    Load latest for comparison
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-3">
                {edit.editingId === i.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEdit(cancelCaptureEdit())}
                      disabled={edit.saving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase text-slate-300 hover:bg-white/10 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(i)}
                      disabled={edit.saving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> {edit.saving ? "Saving..." : "Save"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedback(null);
                      setEdit(beginCaptureEdit(i.id, i.title));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase text-slate-300 hover:bg-white/10"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                )}
                {edit.editingId !== i.id && (i.type === "idea" ? (
                  <button
                    type="button"
                    onClick={() => promoteToTodo(i)}
                    disabled={promotingId === i.id || edit.editingId === i.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    {promotingId === i.id ? "Promoting..." : "Promote to To-Do"}
                  </button>
                ) : (
                  <CreateMissionButton
                    agents={agents}
                    initialTitle={i.title}
                    initialDescription={i.description || ""}
                    triggerLabel="Promote to Mission"
                    compact
                    onCreated={() => markMissionPromoted(i)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
