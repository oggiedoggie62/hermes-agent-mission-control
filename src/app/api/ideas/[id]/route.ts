/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { action } = await req.json();

    if (action === "promote-to-todo") {
      const updated = await prisma.idea.updateMany({
        where: { id, type: "idea", status: "pending" },
        data: { type: "todo" },
      });

      if (updated.count !== 1) {
        return NextResponse.json({ error: "Only pending Ideas can be promoted to To-Dos" }, { status: 409 });
      }
    } else if (action === "mark-promoted") {
      const updated = await prisma.idea.updateMany({
        where: { id, type: "todo", status: "pending" },
        data: { status: "promoted" },
      });

      if (updated.count !== 1) {
        return NextResponse.json({ error: "Only pending To-Dos can be promoted to Missions" }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: "Unsupported promotion action" }, { status: 400 });
    }

    const idea = await prisma.idea.findUnique({ where: { id } });
    return NextResponse.json(idea);
  } catch {
    return NextResponse.json({ error: "Failed to promote capture" }, { status: 500 });
  }
}
