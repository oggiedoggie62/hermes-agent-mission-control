/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { readFile } from "node:fs/promises";
import { claimNextMission, finishExecution, markExecutionRunning, recordExecutionActivity, recoverStaleExecutions } from "../src/lib/mission-execution";
import {
  buildHermesMissionPrompt,
  executionContractFailure,
  validateCompletionAcknowledgement,
  validateDebrief,
} from "../src/lib/hermes-debrief-contract";
import { selectMissionDebriefPath } from "../src/lib/mission-debrief-filename";
import { prisma } from "../src/lib/prisma";

const pollSeconds = Number(process.env.MISSION_DISPATCH_POLL_SECONDS ?? "45");
if (!Number.isInteger(pollSeconds) || pollSeconds < 30 || pollSeconds > 60) {
  throw new Error("MISSION_DISPATCH_POLL_SECONDS must be an integer from 30 to 60");
}
const concurrencyLimit = Number(process.env.MISSION_DISPATCH_CONCURRENCY ?? "1");
if (concurrencyLimit !== 1) {
  throw new Error("MISSION_DISPATCH_CONCURRENCY must be 1 in this rollout phase");
}
const staleThresholdSeconds = Number(process.env.MISSION_EXECUTION_STALE_SECONDS ?? "1800");
if (!Number.isInteger(staleThresholdSeconds) || staleThresholdSeconds < 60) {
  throw new Error("MISSION_EXECUTION_STALE_SECONDS must be an integer of at least 60");
}
const executionTimeoutSeconds = Number(process.env.MISSION_EXECUTION_TIMEOUT_SECONDS ?? "3600");
const minimumExecutionTimeoutSeconds = process.env.MISSION_DISPATCH_TEST_ALLOW_SHORT_TIMEOUT === "1" ? 1 : 60;
if (!Number.isInteger(executionTimeoutSeconds) || executionTimeoutSeconds < minimumExecutionTimeoutSeconds) {
  throw new Error("MISSION_EXECUTION_TIMEOUT_SECONDS must be an integer of at least 60");
}
const heartbeatSeconds = Math.max(10, Math.min(60, Math.floor(staleThresholdSeconds / 3)));

const dispatcherId = process.env.MISSION_DISPATCHER_ID?.trim() || `mission-dispatcher:${hostname()}:${process.pid}`;
const hermesBin = process.env.HERMES_BIN?.trim() || "/home/oggie/.local/bin/hermes";
const agentosRoot = process.env.AGENTOS_ROOT?.trim() || "/home/oggie/AI/AgentOS";
let stopping = false;
let wakeFromSleep: (() => void) | null = null;
let sleepTimer: NodeJS.Timeout | null = null;

async function readValidDebrief(absolutePath: string) {
  try {
    const content = await readFile(absolutePath, "utf8");
    const validationError = validateDebrief(content);
    return validationError ? { error: validationError } : { content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Expected debrief is missing or unreadable: ${message}` };
  }
}

function runHermes(prompt: string, executionId: string): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(hermesBin, ["--oneshot", prompt], {
      cwd: "/home/oggie/mission-control",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const heartbeat = setInterval(() => {
      void recordExecutionActivity(executionId).catch((error) =>
        console.error(`[${new Date().toISOString()}] heartbeat failed execution=${executionId}:`, error),
      );
    }, heartbeatSeconds * 1000);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, executionTimeoutSeconds * 1000);
    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
    };
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-32_000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-32_000); });
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code) => {
      cleanup();
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), timedOut });
    });
  });
}

async function dispatchOnce() {
  const executionId = randomUUID();
  const claim = await claimNextMission({ workerId: dispatcherId, executionId, concurrencyLimit });
  if (!claim) return;

  let missionId: string | null = null;

  try {
    // Test-only: inject a single post-claim failure before any Hermes work.
    // Used by the isolated no-model-cost harness to prove capacity is released.
    if (process.env.MISSION_DISPATCH_TEST_FAIL_AFTER_CLAIM === "once") {
      process.env.MISSION_DISPATCH_TEST_FAIL_AFTER_CLAIM = "";
      throw new Error("Injected post-claim failure for controlled verification");
    }

    const mission = await prisma.mission.findUniqueOrThrow({ where: { id: claim.missionId } });
    missionId = mission.id;

    const { debriefPath, absoluteDebriefPath } = await selectMissionDebriefPath({
      title: mission.title,
      executionId,
      agentosRoot,
    });
    const prompt = buildHermesMissionPrompt({
      missionId: mission.id,
      executionId,
      title: mission.title,
      priority: mission.priority,
      description: mission.description,
      absoluteDebriefPath,
    });

    console.log(`[${new Date().toISOString()}] claimed mission=${mission.id} execution=${executionId} dispatcher=${dispatcherId}`);
    await markExecutionRunning(executionId);
    const result = await runHermes(prompt, executionId);
    if (result.timedOut) {
      const error = `Execution timeout exceeded ${executionTimeoutSeconds} seconds`;
      await finishExecution(executionId, { status: "failed", error });
      console.error(`[${new Date().toISOString()}] failed mission=${missionId} execution=${executionId}: ${error}`);
      return;
    }
    if (result.code === 0) {
      const debrief = await readValidDebrief(absoluteDebriefPath);
      const acknowledgement = validateCompletionAcknowledgement(result.stdout, {
        missionId: mission.id,
        executionId,
        absoluteDebriefPath,
      });
      const contractErrors = [
        acknowledgement.error,
        debrief.error ?? null,
      ].filter((error): error is string => Boolean(error));
      if (contractErrors.length) {
        const error = executionContractFailure(
          contractErrors,
          result.stdout,
          result.stderr,
        );
        await finishExecution(executionId, { status: "failed", error });
        console.error(`[${new Date().toISOString()}] failed mission=${missionId} execution=${executionId}: ${error}`);
        return;
      }
      await finishExecution(executionId, {
        status: "completed",
        result: acknowledgement.resultSummary,
        debriefPath,
      });
      console.log(`[${new Date().toISOString()}] completed mission=${missionId} execution=${executionId}`);
      return;
    }
    const error = result.stderr || result.stdout || `Hermes exited with code ${result.code}`;
    await finishExecution(executionId, { status: "failed", error });
    console.error(`[${new Date().toISOString()}] failed mission=${missionId} execution=${executionId}: ${error}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishExecution(executionId, { status: "failed", error: message });
    console.error(`[${new Date().toISOString()}] failed mission=${missionId ?? "unknown"} execution=${executionId}: ${message}`);
  }
}

async function main() {
  console.log(`dispatcher=${dispatcherId} poll=${pollSeconds}s concurrency=${concurrencyLimit} stale=${staleThresholdSeconds}s timeout=${executionTimeoutSeconds}s legacy_worker=preserved`);
  while (!stopping) {
    const recovered = await recoverStaleExecutions({
      staleBefore: new Date(Date.now() - staleThresholdSeconds * 1000),
      recoveredBy: dispatcherId,
      staleThresholdSeconds,
    }).catch((error) => {
      console.error(`[${new Date().toISOString()}] stale recovery failed:`, error);
      return [];
    });
    for (const execution of recovered) {
      console.error(`[${execution.recoveredAt.toISOString()}] recovered stale mission=${execution.missionId} execution=${execution.executionId ?? "unassigned"} previous=${execution.previousStatus}`);
    }
    await dispatchOnce().catch((error) => console.error(`[${new Date().toISOString()}] poll failed:`, error));
    if (!stopping) {
      await new Promise<void>((resolve) => {
        wakeFromSleep = resolve;
        sleepTimer = setTimeout(resolve, pollSeconds * 1000);
      });
      wakeFromSleep = null;
      sleepTimer = null;
    }
  }
  await prisma.$disconnect();
}

function stop() {
  stopping = true;
  if (sleepTimer) clearTimeout(sleepTimer);
  wakeFromSleep?.();
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

void main();
