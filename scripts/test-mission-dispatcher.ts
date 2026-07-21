/* agent: codex | model: gpt-5 | date: 2026-07-15 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const testDatabaseUrl = process.env.DISPATCHER_TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error("DISPATCHER_TEST_DATABASE_URL is required; dispatcher tests refuse the normal Mission Control database");
}
const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.replace(/^\//, ""));
if (!testDatabaseName.endsWith("_test")) {
  throw new Error("DISPATCHER_TEST_DATABASE_URL must name a database ending in _test");
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error("DISPATCHER_TEST_DATABASE_URL must differ from the normal DATABASE_URL");
}
process.env.DATABASE_URL = testDatabaseUrl;

const marker = `dispatcher-e2e-${Date.now()}`;
const dispatcherScript = path.resolve("scripts/mission-dispatcher.ts");
const tsxBin = path.resolve("node_modules/.bin/tsx");
const stubBin = path.resolve("scripts/test-hermes-dispatcher-stub.sh");
const children = new Set<ChildProcess>();
let prisma: PrismaClient;

async function waitFor<T>(read: () => Promise<T | null>, label: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function startDispatcher(
  id: string,
  controlDir: string,
  agentosRoot: string,
  extraEnv: Record<string, string> = {},
) {
  const child = spawn(tsxBin, [dispatcherScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENTOS_ROOT: agentosRoot,
      HERMES_BIN: stubBin,
      MISSION_DISPATCHER_ID: id,
      MISSION_DISPATCH_CONCURRENCY: "1",
      MISSION_DISPATCH_POLL_SECONDS: "30",
      MISSION_DISPATCH_TEST_CONTROL: controlDir,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk; });
  child.stderr?.on("data", (chunk) => { output += chunk; });
  child.once("exit", () => children.delete(child));
  return { child, output: () => output };
}

async function stopDispatcher(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

async function launchCount(controlDir: string) {
  try {
    const lines = (await readFile(path.join(controlDir, "launches.log"), "utf8")).trim().split("\n");
    return lines.filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function main() {
  const prismaBin = path.resolve("node_modules/.bin/prisma");
  const schemaSync = spawnSync(prismaBin, ["db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (schemaSync.status !== 0) {
    throw new Error(`Could not prepare isolated dispatcher test database:\n${schemaSync.stderr || schemaSync.stdout}`);
  }
  ({ prisma } = await import("../src/lib/prisma"));
  const existingMissionCount = await prisma.mission.count();
  if (existingMissionCount !== 0) {
    throw new Error(`Isolated dispatcher test database must be empty; found ${existingMissionCount} existing mission(s)`);
  }

  const root = await mkdtemp(path.join(tmpdir(), `${marker}-`));
  const controlDir = path.join(root, "control");
  const agentosRoot = path.join(root, "AgentOS");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(controlDir, { recursive: true }));

  try {
    const valid = await prisma.mission.create({
      data: {
        agentId: "hermes",
        title: `${marker}-valid`,
        description: "[stub:valid-debrief]",
        priority: "high",
        executionMode: "AUTO",
        executions: { create: { mode: "AUTO" } },
      },
      include: { executions: true },
    });
    const missing = await prisma.mission.create({
      data: {
        agentId: "hermes",
        title: `${marker}-missing`,
        description: "[stub:missing-debrief]",
        priority: "medium",
        executionMode: "AUTO",
        executions: { create: { mode: "AUTO" } },
      },
      include: { executions: true },
    });
    if (valid.executions[0]?.status !== "queued" || missing.executions[0]?.status !== "queued") {
      throw new Error("Temporary AUTO executions did not begin queued");
    }

    const first = startDispatcher(`${marker}:dispatcher-a`, controlDir, agentosRoot);
    const second = startDispatcher(`${marker}:dispatcher-b`, controlDir, agentosRoot);
    const running = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({
        where: { missionId: valid.id, status: "running" },
      });
      return row ?? null;
    }, "valid execution to reach running");

    let maxActive = 0;
    for (let sample = 0; sample < 20; sample += 1) {
      const active = await prisma.missionExecution.count({
        where: { provider: "HERMES", mode: "AUTO", status: { in: ["claimed", "running"] } },
      });
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (maxActive !== 1) throw new Error(`Expected global active maximum 1, observed ${maxActive}`);
    if (await launchCount(controlDir) !== 1) throw new Error("Two dispatchers launched more than one Hermes execution");
    if (!running.executionId || !running.workerId || !running.claimedAt || !running.startedAt || !running.heartbeatAt) {
      throw new Error("Execution identity or claim/running timestamps were not persisted");
    }
    const stillQueued = await prisma.missionExecution.findFirstOrThrow({ where: { missionId: missing.id } });
    if (stillQueued.status !== "queued") throw new Error("Second eligible execution bypassed the global limit");

    await writeFile(path.join(controlDir, `release-${running.executionId}`), "release\n");
    const completed = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: valid.id } });
      if (row?.status === "failed") throw new Error(`Valid execution failed unexpectedly: ${row.error}`);
      return row?.status === "completed" ? row : null;
    }, "valid execution completion");
    const completedMission = await prisma.mission.findUniqueOrThrow({ where: { id: valid.id } });
    if (!completed.completedAt || completedMission.status !== "completed" || !completedMission.debriefPath || !completedMission.result) {
      throw new Error("Valid debrief did not produce completed/Awaiting Review persistence");
    }
    await Promise.all([stopDispatcher(first.child), stopDispatcher(second.child)]);

    const missingDispatcher = startDispatcher(`${marker}:dispatcher-missing`, controlDir, agentosRoot);
    const missingRunning = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: missing.id, status: "running" } });
      return row ?? null;
    }, "missing-debrief execution to reach running");
    if (!missingRunning.executionId) throw new Error("Missing-debrief execution ID was not persisted");
    await writeFile(path.join(controlDir, `release-${missingRunning.executionId}`), "release\n");
    const failed = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: missing.id, status: "failed" } });
      return row ?? null;
    }, "missing-debrief execution failure");
    const failedMission = await prisma.mission.findUniqueOrThrow({ where: { id: missing.id } });
    if (!failed.error?.includes("missing or unreadable") || failedMission.status !== "failed") {
      throw new Error("Missing debrief did not persist a clear execution and mission failure");
    }
    await stopDispatcher(missingDispatcher.child);

    // Post-claim failure boundary: fail immediately after claim, release capacity, claim next.
    const postClaimFail = await prisma.mission.create({
      data: {
        agentId: "hermes",
        title: `${marker}-post-claim-fail`,
        description: "[stub:valid-debrief]",
        priority: "high",
        executionMode: "AUTO",
        executions: { create: { mode: "AUTO" } },
      },
    });
    const postClaimNext = await prisma.mission.create({
      data: {
        agentId: "hermes",
        title: `${marker}-post-claim-next`,
        description: "[stub:valid-debrief]",
        priority: "medium",
        executionMode: "AUTO",
        executions: { create: { mode: "AUTO" } },
      },
    });

    const failDispatcher = startDispatcher(
      `${marker}:dispatcher-post-claim-fail`,
      controlDir,
      agentosRoot,
      { MISSION_DISPATCH_TEST_FAIL_AFTER_CLAIM: "once" },
    );
    const postClaimFailed = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({
        where: { missionId: postClaimFail.id, status: "failed" },
      });
      return row ?? null;
    }, "post-claim injected failure");
    const postClaimFailedMission = await prisma.mission.findUniqueOrThrow({ where: { id: postClaimFail.id } });
    if (
      postClaimFailedMission.status !== "failed"
      || !postClaimFailed.error?.includes("Injected post-claim failure")
      || postClaimFailed.status === "claimed"
      || postClaimFailed.status === "running"
    ) {
      throw new Error("Post-claim failure did not fail execution and mission cleanly");
    }
    const activeAfterPostClaimFail = await prisma.missionExecution.count({
      where: { provider: "HERMES", mode: "AUTO", status: { in: ["claimed", "running"] } },
    });
    if (activeAfterPostClaimFail !== 0) {
      throw new Error(`Post-claim failure left ${activeAfterPostClaimFail} active execution(s) occupying capacity`);
    }

    const nextRunning = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({
        where: { missionId: postClaimNext.id, status: "running" },
      });
      return row ?? null;
    }, "subsequent AUTO mission claim after post-claim failure", 45_000);
    if (!nextRunning.executionId || !nextRunning.workerId) {
      throw new Error("Subsequent AUTO mission was not claimed after post-claim failure released capacity");
    }
    await writeFile(path.join(controlDir, `release-${nextRunning.executionId}`), "release\n");
    const nextCompleted = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({
        where: { missionId: postClaimNext.id, status: "completed" },
      });
      return row ?? null;
    }, "subsequent mission completion after post-claim failure");
    await stopDispatcher(failDispatcher.child);

    console.log(`PASS queued->claimed->running: execution=${running.executionId} worker=${running.workerId}`);
    console.log(`PASS global concurrency: dispatchers=2 eligible=2 max_active=${maxActive} initial_launches=1`);
    console.log(`PASS valid debrief: execution=${completed.executionId} mission_status=${completedMission.status}`);
    console.log(`PASS missing debrief: execution=${failed.executionId} mission_status=${failedMission.status} error=${failed.error}`);
    console.log(`PASS post-claim failure: execution=${postClaimFailed.executionId} mission_status=${postClaimFailedMission.status} next=${nextCompleted.executionId}`);
  } finally {
    for (const child of children) child.kill("SIGKILL");
    await prisma.mission.deleteMany({ where: { title: { startsWith: marker } } });
    await prisma?.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
