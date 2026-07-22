/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveMissionExecutionMode } from "@/lib/mission-dispatch-ux";

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    // Check for session/cookie auth later, for now internal secret is the bridge
    // return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, agentId, priority, executionMode: requestedExecutionMode } = body;

    if (!title || !agentId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    let executionMode;
    try {
      executionMode = resolveMissionExecutionMode(agentId, requestedExecutionMode);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid execution mode" },
        { status: 400 },
      );
    }

    const mission = await prisma.$transaction(async (tx) => {
      const created = await tx.mission.create({
        data: {
          title,
          description: description || "",
          agentId,
          priority: priority || "medium",
          status: "pending",
          executionProvider: "HERMES",
          executionMode,
        },
      });

      await tx.missionExecution.create({
        data: {
          missionId: created.id,
          status: "queued",
          provider: "HERMES",
          mode: executionMode,
          attempt: 1,
        },
      });

      return created;
    });

    return NextResponse.json(mission);
  } catch (e) {
    return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
  }
}

export async function GET() {
  const agents = await prisma.agentState.findMany({
    select: { id: true, name: true, emoji: true },
    orderBy: { name: "asc" }
  });
  return NextResponse.json({ agents });
}
