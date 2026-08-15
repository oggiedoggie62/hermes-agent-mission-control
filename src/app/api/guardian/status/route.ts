import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STORE_KEY = "mac-mini-guardian-status";

function authorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization") || "";
  return Boolean(secret) && auth === `Bearer ${secret}`;
}

export async function GET() {
  try {
    const record = await prisma.dataStore.findUnique({ where: { key: STORE_KEY } });
    return NextResponse.json({ status: record?.data ?? null, updatedAt: record?.updatedAt ?? null });
  } catch {
    return NextResponse.json({ status: null, updatedAt: null }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.hostname !== "string" || typeof body.status !== "string") {
    return NextResponse.json({ error: "hostname and status are required" }, { status: 400 });
  }
  const record = await prisma.dataStore.upsert({
    where: { key: STORE_KEY },
    create: { key: STORE_KEY, data: body },
    update: { data: body },
  });
  return NextResponse.json({ status: record.data, updatedAt: record.updatedAt });
}
