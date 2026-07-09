"use client";

import { useState, useEffect } from "react";
import { Lightbulb, Send } from "lucide-react";

interface Idea {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  status: string | null;
  timestamp: string;
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ideas")
      .then((r) => r.json())
      .then(setIdeas)
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      });
      if (res.ok) {
        const newIdea = await res.json();
        setIdeas((prev) => [newIdea, ...prev]);
        setTitle("");
        setDescription("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-[1000px] mx-auto">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em] mb-2">Ideas</h1>
      <p className="text-[var(--ink-2)] mb-8">Capture ideas as they come. They&apos;re visible to you and all agents.</p>

      {/* Capture Form */}
      <form onSubmit={submit} className="p-5 rounded-2xl mb-8 flex flex-col gap-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-2)]">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          New Idea
        </div>
        <input
          type="text"
          placeholder="Idea title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent border-b border-[var(--line)] pb-2 text-[15px] font-medium text-white placeholder-[var(--ink-3)] outline-none focus:border-cyan-400 transition-colors"
        />
        <textarea
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-transparent text-[13px] text-[var(--ink-2)] placeholder-[var(--ink-3)] outline-none resize-none"
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="self-end flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          <Send className="w-3.5 h-3.5" />
          {saving ? "Saving..." : "Capture"}
        </button>
      </form>

      {/* Ideas List */}
      <div className="flex flex-col gap-2">
        {ideas.length === 0 ? (
          <div className="p-6 text-center text-[var(--ink-3)]">No ideas yet. Capture one above!</div>
        ) : (
          ideas.map((i) => (
            <div key={i.id} className="p-4 rounded-xl" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <div className="font-medium text-[14px] mb-1">{i.title}</div>
              {i.description && <div className="text-[13px] text-[var(--ink-2)] mb-2">{i.description}</div>}
              <div className="text-[11px] text-[var(--ink-3)]">
                {i.source || "unknown"} · {i.status || "pending"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
