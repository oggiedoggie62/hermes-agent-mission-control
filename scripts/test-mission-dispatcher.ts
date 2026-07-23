/* agent: codex | model: gpt-5 | date: 2026-07-21 */
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
const recoveryWorkerScript = path.resolve("scripts/recover-stale-once.ts");
const children = new Set<ChildProcess>();
let prisma: PrismaClient;

async function waitFor<T>(read: () => Promise<T | null>, label: string, timeoutMs = 30_000): Promise<T> {
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

async function killDispatcher(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGKILL");
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

function runRecoveryWorker(id: string, staleBefore: Date) {
  return new Promise<string[]>((resolve, reject) => {
    const child = spawn(tsxBin, [recoveryWorkerScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MISSION_EXECUTION_STALE_SECONDS: "60",
        MISSION_RECOVERY_TEST_STALE_BEFORE: staleBefore.toISOString(),
        MISSION_RECOVERY_TEST_WORKER: id,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(`Recovery worker ${id} failed: ${stderr || stdout}`));
      try {
        resolve(JSON.parse(stdout.trim()) as string[]);
      } catch {
        reject(new Error(`Recovery worker ${id} returned invalid output: ${stdout}`));
      }
    });
  });
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
    const recentAt = new Date();
    const expiredAt = new Date(Date.now() - 120_000);
    const staleBefore = new Date(Date.now() - 60_000);
    const makeExecutionMission = async (
      suffix: string,
      executionStatus: "claimed" | "running",
      activityAt: Date,
      missionStatus = "active",
    ) =>
      prisma.mission.create({
        data: {
          agentId: "hermes",
          title: `${marker}-${suffix}`,
          description: "Controlled stale-recovery fixture",
          status: missionStatus,
          priority: "high",
          executionMode: "AUTO",
          executions: {
            create: {
              mode: "AUTO",
              status: executionStatus,
              executionId: `${marker}-${suffix}-execution`,
              workerId: `${marker}-crashed-worker`,
              claimedAt: activityAt,
              startedAt: executionStatus === "running" ? activityAt : null,
              heartbeatAt: activityAt,
            },
          },
        },
        include: { executions: true },
      });

    const recentClaimed = await makeExecutionMission("recent-claimed", "claimed", recentAt);
    const recentRunning = await makeExecutionMission("recent-running", "running", recentAt);
    const expiredClaimed = await makeExecutionMission("expired-claimed", "claimed", expiredAt);
    const expiredRunning = await makeExecutionMission("expired-running", "running", expiredAt);
    const incompatibleClaimed = await makeExecutionMission(
      "incompatible-completed-claimed",
      "claimed",
      expiredAt,
      "completed",
    );
    const incompatibleRunning = await makeExecutionMission(
      "incompatible-failed-running",
      "running",
      expiredAt,
      "failed",
    );

    const recoveryResults = await Promise.all([
      runRecoveryWorker(`${marker}:recovery-a`, staleBefore),
      runRecoveryWorker(`${marker}:recovery-b`, staleBefore),
    ]);
    const recoveredIds = recoveryResults.flat();
    const expectedRecoveredIds = new Set([
      expiredClaimed.executions[0].id,
      expiredRunning.executions[0].id,
    ]);
    if (recoveredIds.length !== 2
      || new Set(recoveredIds).size !== 2
      || recoveredIds.some((id) => !expectedRecoveredIds.has(id))) {
      throw new Error(`Two recovery processes did not recover each expired execution exactly once: ${recoveredIds.join(",")}`);
    }
    for (const mission of [recentClaimed, recentRunning]) {
      const execution = await prisma.missionExecution.findFirstOrThrow({ where: { missionId: mission.id } });
      if (execution.status === "failed" || execution.recoveredAt) {
        throw new Error(`Recent ${execution.status} execution was recovered prematurely`);
      }
    }
    for (const mission of [expiredClaimed, expiredRunning]) {
      const execution = await prisma.missionExecution.findFirstOrThrow({ where: { missionId: mission.id } });
      const failedMission = await prisma.mission.findUniqueOrThrow({ where: { id: mission.id } });
      if (execution.status !== "failed" || failedMission.status !== "failed" || !execution.recoveredAt
        || !execution.completedAt || !execution.error?.includes("Stale execution recovered")
        || !execution.error.includes("lastActivityAt=") || !execution.error.includes("recoveredBy=")) {
        throw new Error(`Expired ${mission.id} did not persist complete stale-recovery diagnostics`);
      }
    }

    for (const mission of [incompatibleClaimed, incompatibleRunning]) {
      const originalExecution = mission.executions[0];
      const execution = await prisma.missionExecution.findFirstOrThrow({ where: { missionId: mission.id } });
      const unchangedMission = await prisma.mission.findUniqueOrThrow({ where: { id: mission.id } });
      if (execution.status !== originalExecution.status
        || execution.recoveredAt
        || execution.completedAt
        || execution.error
        || unchangedMission.status !== mission.status) {
        throw new Error(`Incompatible Mission ${mission.id} or its execution was changed by stale recovery`);
      }
    }
    const incompatibleActiveCapacity = await prisma.missionExecution.count({
      where: {
        missionId: { in: [incompatibleClaimed.id, incompatibleRunning.id] },
        status: { in: ["claimed", "running"] },
      },
    });
    if (incompatibleActiveCapacity !== 2) {
      throw new Error("Skipped incompatible executions incorrectly changed database-backed capacity");
    }

    await prisma.missionExecution.updateMany({
      where: {
        missionId: {
          in: [recentClaimed.id, recentRunning.id, incompatibleClaimed.id, incompatibleRunning.id],
        },
      },
      data: { status: "failed", completedAt: new Date(), error: "Controlled fixture cleanup" },
    });
    await prisma.mission.updateMany({
      where: {
        id: {
          in: [recentClaimed.id, recentRunning.id, incompatibleClaimed.id, incompatibleRunning.id],
        },
      },
      data: { status: "failed", completedAt: new Date() },
    });

    const capacityBlocker = await makeExecutionMission("capacity-blocker", "running", expiredAt);
    const recoveryNext = await prisma.mission.create({
      data: {
        agentId: "hermes",
        title: `${marker}-recovery-next`,
        description: "[stub:valid-debrief]",
        priority: "medium",
        executionMode: "AUTO",
        executions: { create: { mode: "AUTO" } },
      },
    });
    const capacityRecovery = await Promise.all([
      runRecoveryWorker(`${marker}:capacity-a`, staleBefore),
      runRecoveryWorker(`${marker}:capacity-b`, staleBefore),
    ]);
    const capacityRecoveredIds = capacityRecovery.flat();
    if (capacityRecoveredIds.length !== 1 || new Set(capacityRecoveredIds).size !== 1) {
      throw new Error("Competing recovery processes recovered the capacity blocker more than once");
    }
    const activeAfterRecovery = await prisma.missionExecution.count({
      where: { provider: "HERMES", mode: "AUTO", status: { in: ["claimed", "running"] } },
    });
    if (activeAfterRecovery !== 0) throw new Error("Stale recovery did not release database-backed capacity");

    const recoveryDispatcher = startDispatcher(`${marker}:dispatcher-after-recovery`, controlDir, agentosRoot);
    const recoveryNextRunning = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: recoveryNext.id, status: "running" } });
      return row ?? null;
    }, "AUTO mission claim after stale recovery");
    if (!recoveryNextRunning.executionId) throw new Error("Post-recovery execution identity was not persisted");
    await writeFile(path.join(controlDir, `release-${recoveryNextRunning.executionId}`), "release\n");
    await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: recoveryNext.id, status: "completed" } });
      return row ?? null;
    }, "AUTO mission completion after stale recovery");
    await stopDispatcher(recoveryDispatcher.child);

    const timeoutMission = await prisma.mission.create({
      data: {
        agentId: "hermes",
        title: `${marker}-execution-timeout`,
        description: "[stub:valid-debrief]",
        priority: "high",
        executionMode: "AUTO",
        executions: { create: { mode: "AUTO" } },
      },
    });
    const timeoutDispatcher = startDispatcher(
      `${marker}:dispatcher-timeout`,
      controlDir,
      agentosRoot,
      {
        MISSION_DISPATCH_TEST_ALLOW_SHORT_TIMEOUT: "1",
        MISSION_EXECUTION_TIMEOUT_SECONDS: "1",
      },
    );
    const timedOutExecution = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: timeoutMission.id } });
      return row?.status === "failed" ? row : null;
    }, "Hermes execution timeout failure");
    const timedOutMission = await prisma.mission.findUniqueOrThrow({ where: { id: timeoutMission.id } });
    if (timedOutMission.status !== "failed"
      || !timedOutExecution.completedAt
      || timedOutExecution.recoveredAt
      || timedOutExecution.error !== "Execution timeout exceeded 1 seconds") {
      throw new Error("Hermes execution timeout did not fail execution and mission cleanly");
    }
    const activeAfterTimeout = await prisma.missionExecution.count({
      where: { provider: "HERMES", mode: "AUTO", status: { in: ["claimed", "running"] } },
    });
    if (activeAfterTimeout !== 0) throw new Error("Hermes execution timeout did not release capacity");
    await stopDispatcher(timeoutDispatcher.child);

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

    const launchBaseline = await launchCount(controlDir);
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
    if ((await launchCount(controlDir)) - launchBaseline !== 1) {
      throw new Error("Two dispatchers launched more than one Hermes execution");
    }
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
    if (
      !completed.completedAt
      || completedMission.status !== "completed"
      || !completedMission.debriefPath
      || completedMission.result !== "Controlled dispatcher verification completed."
      || completedMission.result.includes("MISSION CONTROL COMPLETION")
      || completedMission.result.includes("Mission ID:")
    ) {
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
    if (
      !failed.error?.includes("missing or unreadable")
      || !failed.error.includes("MISSION CONTROL COMPLETION")
      || !failed.error.includes("stdout excerpt")
      || !failed.error.includes("stderr excerpt")
      || failedMission.status !== "failed"
    ) {
      throw new Error("Missing debrief did not persist a clear execution and mission failure");
    }
    await stopDispatcher(missingDispatcher.child);

    const runContractFailure = async (
      suffix: string,
      description: string,
      expectedError: RegExp,
      extraEnv: Record<string, string> = {},
    ) => {
      const mission = await prisma.mission.create({
        data: {
          agentId: "hermes",
          title: `${marker}-${suffix}`,
          description,
          priority: "high",
          executionMode: "AUTO",
          executions: { create: { mode: "AUTO" } },
        },
      });
      const dispatcher = startDispatcher(
        `${marker}:dispatcher-${suffix}`,
        controlDir,
        agentosRoot,
        extraEnv,
      );
      const runningExecution = await waitFor(async () => {
        const row = await prisma.missionExecution.findFirst({
          where: { missionId: mission.id, status: "running" },
        });
        return row ?? null;
      }, `${suffix} execution to reach running`);
      if (!runningExecution.executionId) throw new Error(`${suffix} execution ID was not persisted`);
      await writeFile(path.join(controlDir, `release-${runningExecution.executionId}`), "release\n");
      const failedExecution = await waitFor(async () => {
        const row = await prisma.missionExecution.findFirst({
          where: { missionId: mission.id, status: "failed" },
        });
        return row ?? null;
      }, `${suffix} execution failure`);
      const failedContractMission = await prisma.mission.findUniqueOrThrow({
        where: { id: mission.id },
      });
      await stopDispatcher(dispatcher.child);
      if (
        failedContractMission.status !== "failed"
        || !failedExecution.error
        || !expectedError.test(failedExecution.error)
      ) {
        throw new Error(`${suffix} did not persist the expected contract failure: ${failedExecution.error}`);
      }
      return failedExecution;
    };

    const invalidAcknowledgement = await runContractFailure(
      "invalid-acknowledgement",
      "[stub:invalid-acknowledgement]",
      /completion acknowledgement was missing, malformed/,
    );
    const wrongPathAcknowledgement = await runContractFailure(
      "wrong-path-acknowledgement",
      "[stub:wrong-path-acknowledgement]",
      /exact debrief path/,
    );
    const malformedDebrief = await runContractFailure(
      "malformed-debrief",
      "[stub:malformed-debrief]",
      /Debrief is missing required section: Evidence/,
    );
    const diagnosticSecret = "dispatcher-contract-secret-must-be-redacted";
    const diagnosticFailure = await runContractFailure(
      "diagnostic-failure",
      "[stub:diagnostic-failure]",
      /stdout excerpt \(2000\/.*\).*\[truncated\][\s\S]*stderr excerpt \(2000\/.*\).*\[truncated\]/,
      { MISSION_DISPATCH_TEST_SECRET: diagnosticSecret },
    );
    if (
      diagnosticFailure.error?.includes(diagnosticSecret)
      || (diagnosticFailure.error?.length ?? Number.POSITIVE_INFINITY) > 4_500
    ) {
      throw new Error("Persisted contract diagnostics were not bounded and secret-safe");
    }

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
      throw new Error(
        `Post-claim failure did not fail execution and mission cleanly: mission=${postClaimFailedMission.status}`
        + ` execution=${postClaimFailed.status} error=${postClaimFailed.error}\n${failDispatcher.output()}`,
      );
    }
    const activeAfterPostClaimFail = await prisma.missionExecution.count({
      where: { provider: "HERMES", mode: "AUTO", status: { in: ["claimed", "running"] } },
    });
    if (activeAfterPostClaimFail !== 0) {
      throw new Error(`Post-claim failure left ${activeAfterPostClaimFail} active execution(s) occupying capacity`);
    }

    await stopDispatcher(failDispatcher.child);
    const nextDispatcher = startDispatcher(`${marker}:dispatcher-post-claim-next`, controlDir, agentosRoot);

    const nextRunning = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({ where: { missionId: postClaimNext.id } });
      if (row?.status === "failed") {
        throw new Error(`Subsequent mission failed before running: ${row.error}\n${nextDispatcher.output()}`);
      }
      return row?.status === "running" ? row : null;
    }, "subsequent AUTO mission claim after post-claim failure", 30_000).catch((error) => {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${nextDispatcher.output()}`);
    });
    if (!nextRunning.executionId || !nextRunning.workerId) {
      throw new Error("Subsequent AUTO mission was not claimed after post-claim failure released capacity");
    }
    await writeFile(path.join(controlDir, `release-${nextRunning.executionId}`), "release\n");
    const nextCompleted = await waitFor(async () => {
      const row = await prisma.missionExecution.findFirst({
        where: { missionId: postClaimNext.id },
      });
      if (row?.status === "failed") {
        throw new Error(`Subsequent mission failed unexpectedly: ${row.error}\n${nextDispatcher.output()}`);
      }
      return row?.status === "completed" ? row : null;
    }, "subsequent mission completion after post-claim failure", 20_000);
    await stopDispatcher(nextDispatcher.child);

    console.log(`PASS queued->claimed->running: execution=${running.executionId} worker=${running.workerId}`);
    console.log(`PASS stale threshold: recent claimed/running preserved; expired claimed/running recovered`);
    console.log(`PASS atomic stale recovery: processes=2 unique_recoveries=${recoveredIds.length}`);
    console.log("PASS incompatible mission states: completed/claimed and failed/running unchanged, no false recovery result, capacity preserved");
    console.log(`PASS recovery capacity release: blocker=${capacityBlocker.id} next=${recoveryNext.id} completed`);
    console.log(`PASS Hermes execution timeout: execution=${timedOutExecution.executionId} mission_status=${timedOutMission.status} capacity=0`);
    console.log(`PASS global concurrency: dispatchers=2 eligible=2 max_active=${maxActive} initial_launches=1`);
    console.log(`PASS valid acknowledgement + valid debrief: execution=${completed.executionId} mission_status=${completedMission.status}`);
    console.log(`PASS acknowledgement without file: execution=${failed.executionId} mission_status=${failedMission.status}`);
    console.log(`PASS file without valid acknowledgement: execution=${invalidAcknowledgement.executionId} failed`);
    console.log(`PASS acknowledgement with wrong path: execution=${wrongPathAcknowledgement.executionId} failed`);
    console.log(`PASS malformed debrief: execution=${malformedDebrief.executionId} failed`);
    console.log(`PASS bounded stdout/stderr diagnostics: execution=${diagnosticFailure.executionId} error_length=${diagnosticFailure.error?.length}`);
    console.log(`PASS post-claim failure: execution=${postClaimFailed.executionId} mission_status=${postClaimFailedMission.status} next=${nextCompleted.executionId}`);
  } finally {
    await Promise.all(Array.from(children, (child) => killDispatcher(child)));
    await prisma.mission.deleteMany({ where: { title: { startsWith: marker } } });
    await prisma?.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
