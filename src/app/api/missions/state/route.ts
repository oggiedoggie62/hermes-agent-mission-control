/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCronJobs } from "@/lib/agentos";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [missions, cronJobs] = await Promise.all([
      prisma.mission.findMany({
        where: { isArchived: false },
        orderBy: { createdAt: "desc" },
        include: {
          executions: {
            orderBy: { attempt: "desc" },
            take: 1,
          },
        },
      }),
      getCronJobs(),
    ]);

    const worker = cronJobs?.find((job) => job.name === "mission-worker");

    return NextResponse.json(
      {
        missions,
        worker: worker
          ? {
              enabled: worker.enabled,
              lastRunAt: worker.last_run_at,
              nextRunAt: worker.next_run_at,
              lastStatus: worker.last_status,
              lastError: worker.last_error,
            }
          : null,
        refreshedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load current mission state" },
      { status: 500 },
    );
  }
}
