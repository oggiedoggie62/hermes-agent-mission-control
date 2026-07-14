/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";
import { claimNextMission } from "../src/lib/mission-execution";

async function main() {
  const marker = `atomic-claim-test-${randomUUID()}`;
  const mission = await prisma.mission.create({
    data: {
      title: marker,
      description: "Temporary concurrency verification record",
      agentId: "hermes",
      priority: "high",
      status: "pending",
      executionProvider: "HERMES",
      executionMode: "AUTO",
      executions: {
        create: {
          status: "queued",
          provider: "HERMES",
          mode: "AUTO",
          attempt: 1,
        },
      },
    },
  });

  try {
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        claimNextMission({
          workerId: `atomic-test-worker-${index}`,
          executionId: `atomic-test-${randomUUID()}`,
        }),
      ),
    );
    const successful = claims.filter((claim) => claim?.missionId === mission.id);
    if (successful.length !== 1) {
      throw new Error(`Expected exactly one claim, received ${successful.length}`);
    }

    const persisted = await prisma.missionExecution.findMany({
      where: { missionId: mission.id },
    });
    if (persisted.length !== 1 || persisted[0]?.status !== "claimed") {
      throw new Error("Atomic claim did not persist exactly one claimed execution");
    }

    console.log(`PASS: 12 concurrent workers produced exactly one claim for ${mission.id}`);
  } finally {
    await prisma.mission.delete({ where: { id: mission.id } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
