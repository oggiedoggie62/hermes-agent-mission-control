/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import type { MissionExecutionStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

function executionStatus(missionStatus: string): MissionExecutionStatus {
  if (missionStatus === "active") return "running";
  if (missionStatus === "completed") return "completed";
  if (missionStatus === "failed") return "failed";
  return "queued";
}

async function main() {
  const missions = await prisma.mission.findMany({
    where: { executions: { none: {} } },
  });

  let created = 0;
  for (const mission of missions) {
    const status = executionStatus(mission.status);
    await prisma.missionExecution.create({
      data: {
        missionId: mission.id,
        status,
        provider: mission.executionProvider,
        mode: mission.executionMode,
        attempt: 1,
        completedAt:
          status === "completed" || status === "failed"
            ? mission.completedAt
            : null,
        error:
          status === "failed"
            ? mission.result || "Legacy mission failed without recorded error details"
            : null,
        createdAt: mission.createdAt,
      },
    });
    created += 1;
  }

  console.log(`Backfilled ${created} mission execution record(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
