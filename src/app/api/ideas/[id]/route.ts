/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { action, title, expectedUpdatedAt } = await req.json();

    if (action === "edit") {
      if (typeof title !== "string" || title.trim().length === 0) {
        return NextResponse.json({ error: "Capture text cannot be blank" }, { status: 400 });
      }
      if (typeof expectedUpdatedAt !== "string" || Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
        return NextResponse.json({ error: "A valid expectedUpdatedAt is required" }, { status: 400 });
      }

      const updated = await prisma.idea.updateMany({
        where: { id, status: "pending", updatedAt: new Date(expectedUpdatedAt) },
        data: { title: title.trim() },
      });

      if (updated.count !== 1) {
        const current = await prisma.idea.findUnique({ where: { id }, select: { status: true } });
        const message = current?.status === "pending"
          ? "This item was changed elsewhere. Review the latest version before saving again."
          : "Only active Ideas and To-Dos can be edited";
        return NextResponse.json({ error: message }, { status: 409 });
      }
    } else if (action === "promote-to-todo") {
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
      return NextResponse.json({ error: "Unsupported capture action" }, { status: 400 });
    }

    const idea = await prisma.idea.findUnique({ where: { id } });
    return NextResponse.json(idea);
  } catch {
    return NextResponse.json({ error: "Failed to update capture" }, { status: 500 });
  }
}
