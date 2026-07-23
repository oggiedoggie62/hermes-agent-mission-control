/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import { prisma } from "@/lib/prisma";
import { Clock, CheckCircle2, Circle, AlertCircle, Ban } from "lucide-react";
import { CreateMissionButton } from "../../components/create-mission-button";
import { getMissionAgentChoices } from "@/lib/mission-agents";
import { KanbanClient } from "./kanban-client";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const [missions, agents] = await Promise.all([
    prisma.mission.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "desc" }
    }),
    getMissionAgentChoices(),
  ]);

  const columns = [
    { title: "Pending", status: "pending", icon: <Circle className="w-4 h-4 text-slate-500" /> },
    { title: "Active", status: "active", icon: <Clock className="w-4 h-4 text-cyan-400" /> },
    { title: "Awaiting Review", status: "completed", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
    { title: "Failed", status: "failed", icon: <AlertCircle className="w-4 h-4 text-rose-500" /> },
    { title: "Cancelled", status: "cancelled", icon: <Ban className="w-4 h-4 text-slate-500" /> },
  ];

  return (
    <KanbanClient
      missions={missions as any}
      agents={agents}
      columns={columns}
    />
  );
}
