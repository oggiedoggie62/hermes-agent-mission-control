/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import { prisma } from "@/lib/prisma";
import { Clock, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { CreateMissionButton } from "../../components/create-mission-button";
import { getAgents } from "@/lib/agentos";
import { KanbanClient } from "./kanban-client";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const [missions, registry] = await Promise.all([
    prisma.mission.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "desc" }
    }),
    getAgents(),
  ]);

  // Build agent list from AgentOS registry (always populated)
  const registryAgents = registry
    ? Object.entries(registry.agents).map(([id, a]) => ({
        id,
        name: a.name,
        emoji: "🤖",
      }))
    : [];

  // Add sub-agent profiles that respond to kanban requests (Hermes profiles)
  const agents = [
    ...registryAgents,
    { id: "research-bot", name: "Research Bot", emoji: "🔬" },
    { id: "web-bot", name: "Web Bot", emoji: "🌐" },
    { id: "writer-bot", name: "Writer Bot", emoji: "✍️" },
    { id: "mini", name: "Mini", emoji: "🔹" },
  ];

  const columns = [
    { title: "Pending", status: "pending", icon: <Circle className="w-4 h-4 text-slate-500" /> },
    { title: "Active", status: "active", icon: <Clock className="w-4 h-4 text-cyan-400" /> },
    { title: "Awaiting Review", status: "completed", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
    { title: "Failed", status: "failed", icon: <AlertCircle className="w-4 h-4 text-rose-500" /> },
  ];

  return (
    <KanbanClient
      missions={missions as any}
      agents={agents}
      columns={columns}
    />
  );
}
