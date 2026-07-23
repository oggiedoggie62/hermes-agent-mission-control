/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supportsAutomaticDispatch } from "@/lib/mission-dispatch-ux";
import { requireInternalApiSecret } from "@/lib/internal-api-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { result, status, debriefPath, isArchived, action } = body;

    if (!id) {
      return NextResponse.json({ error: "Mission ID required" }, { status: 400 });
    }

    if (action === "enableAutomaticExecution") {
      const authorizationError = requireInternalApiSecret(req);
      if (authorizationError) return authorizationError;

      const mission = await prisma.$transaction(async (tx) => {
        const candidate = await tx.mission.findUnique({
          where: { id },
          select: { agentId: true },
        });
        if (!candidate || !supportsAutomaticDispatch(candidate.agentId)) {
          throw new Error("MISSION_AGENT_NOT_ELIGIBLE");
        }

        const updatedMissions = await tx.mission.updateMany({
          where: {
            id,
            agentId: candidate.agentId,
            status: "pending",
            isArchived: false,
            executionProvider: "HERMES",
            executionMode: "MANUAL",
          },
          data: { executionMode: "AUTO" },
        });
        if (updatedMissions.count !== 1) {
          throw new Error("MISSION_NOT_ELIGIBLE");
        }

        const updatedExecutions = await tx.missionExecution.updateMany({
          where: {
            missionId: id,
            status: "queued",
            provider: "HERMES",
            mode: "MANUAL",
          },
          data: { mode: "AUTO" },
        });
        if (updatedExecutions.count !== 1) {
          throw new Error("MISSION_EXECUTION_NOT_ELIGIBLE");
        }

        return tx.mission.findUniqueOrThrow({
          where: { id },
          include: { executions: { orderBy: { attempt: "desc" }, take: 1 } },
        });
      });
      return NextResponse.json(mission);
    }

    const data: Record<string, unknown> = {};
    if (result !== undefined) data.result = result;
    if (debriefPath !== undefined) data.debriefPath = debriefPath;
    if (status !== undefined) {
      data.status = status;
      if (status === "completed") data.completedAt = new Date();
    }
    if (isArchived !== undefined) data.isArchived = isArchived;

    const mission = await prisma.mission.update({
      where: { id },
      data,
    });

    return NextResponse.json(mission);
  } catch (e) {
    if (e instanceof Error && (
      e.message === "MISSION_NOT_ELIGIBLE"
      || e.message === "MISSION_AGENT_NOT_ELIGIBLE"
      || e.message === "MISSION_EXECUTION_NOT_ELIGIBLE"
    )) {
      return NextResponse.json(
        { error: "Only pending Manual Hermes missions with one queued Manual execution can be made Automatic" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }
}
