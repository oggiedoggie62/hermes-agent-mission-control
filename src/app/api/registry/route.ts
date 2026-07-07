import { NextResponse } from "next/server";
import { getRegistryDevices, getRegistryServices } from "@/lib/agentos";

export const dynamic = "force-dynamic";

export async function GET() {
  const [devices, services] = await Promise.all([
    getRegistryDevices(),
    getRegistryServices(),
  ]);
  return NextResponse.json({
    devices: devices?.devices ?? [],
    services: services?.services ?? [],
  });
}