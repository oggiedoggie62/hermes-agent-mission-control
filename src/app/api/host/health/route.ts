import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET() {
  const hosts = await prisma.hostHealth.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ hosts });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const {
    hostname,
    cpuUsage,
    ramUsage,
    diskUsage,
    gpuTemp,
    nasConnected,
    nasAvailable,
  } = body || {};

  if (!hostname) {
    return NextResponse.json({ error: "hostname required" }, { status: 400 });
  }

  const updated = await prisma.hostHealth.upsert({
    where: { hostname: String(hostname) },
    create: {
      hostname: String(hostname),
      cpuUsage: Number.isFinite(cpuUsage) ? Number(cpuUsage) : 0,
      ramUsage: Number.isFinite(ramUsage) ? Number(ramUsage) : 0,
      diskUsage: Number.isFinite(diskUsage) ? Number(diskUsage) : 0,
      gpuTemp: Number.isFinite(gpuTemp) ? Number(gpuTemp) : null,
      nasConnected: Boolean(nasConnected),
      nasAvailable: Number.isFinite(nasAvailable) ? Number(nasAvailable) : 0,
    },
    update: {
      ...(Number.isFinite(cpuUsage) && { cpuUsage: Number(cpuUsage) }),
      ...(Number.isFinite(ramUsage) && { ramUsage: Number(ramUsage) }),
      ...(Number.isFinite(diskUsage) && { diskUsage: Number(diskUsage) }),
      ...(gpuTemp !== undefined && { gpuTemp: Number.isFinite(gpuTemp) ? Number(gpuTemp) : null }),
      ...(nasConnected !== undefined && { nasConnected: Boolean(nasConnected) }),
      ...(Number.isFinite(nasAvailable) && { nasAvailable: Number(nasAvailable) }),
    },
  });

  return NextResponse.json({ host: updated });
}