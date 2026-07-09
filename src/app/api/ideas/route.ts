import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ideas = await prisma.idea.findMany({
      orderBy: { timestamp: "desc" },
      take: 50,
    });
    return NextResponse.json(ideas);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const idea = await prisma.idea.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        source: "Mission Control (manual entry)",
        status: "pending",
        category: "uncategorized",
      },
    });

    return NextResponse.json(idea);
  } catch (e) {
    return NextResponse.json({ error: "Failed to create idea" }, { status: 500 });
  }
}