import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, result, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Mission ID required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (result !== undefined) data.result = result;
    if (status !== undefined) {
      data.status = status;
      if (status === "completed") data.completedAt = new Date();
    }

    const mission = await prisma.mission.update({
      where: { id },
      data,
    });

    return NextResponse.json(mission);
  } catch (e) {
    return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
  }
}