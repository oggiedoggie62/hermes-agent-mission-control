/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import { recoverStaleExecutions } from "../src/lib/mission-execution";
import { prisma } from "../src/lib/prisma";

const staleBefore = new Date(process.env.MISSION_RECOVERY_TEST_STALE_BEFORE ?? "");
const recoveredBy = process.env.MISSION_RECOVERY_TEST_WORKER?.trim() ?? "";
const staleThresholdSeconds = Number(process.env.MISSION_EXECUTION_STALE_SECONDS ?? "");

if (Number.isNaN(staleBefore.getTime()) || !recoveredBy) {
  throw new Error("Recovery test worker requires a stale cutoff and worker identity");
}

async function main() {
  try {
    const recovered = await recoverStaleExecutions({ staleBefore, recoveredBy, staleThresholdSeconds });
    console.log(JSON.stringify(recovered.map((execution) => execution.id)));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
