/* agent: codex | model: gpt-5 | date: 2026-07-13 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { result, status, debriefPath, isArchived } = body;

    if (!id) {
      return NextResponse.json({ error: "Mission ID required" }, { status: 400 });
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
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }
}
