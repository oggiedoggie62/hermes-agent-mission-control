
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const health = await prisma.hostHealth.upsert({
    where: { hostname: body.hostname },
    update: body,
    create: body,
  });
  return NextResponse.json(health);
}

export async function GET() {
  const health = await prisma.hostHealth.findMany();
  return NextResponse.json(health);
}
