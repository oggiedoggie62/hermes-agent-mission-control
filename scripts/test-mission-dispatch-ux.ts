/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  dispatcherStatusLabel,
  legacyWorkerNextRunLabel,
  missionQueueTimingLabel,
} from "../src/lib/mission-dispatch-ux";

const testDatabaseUrl = process.env.DISPATCHER_TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error("DISPATCHER_TEST_DATABASE_URL is required");
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!databaseName.endsWith("_test")) throw new Error("Mission dispatch UX tests require a database ending in _test");
if (process.env.DATABASE_URL === testDatabaseUrl) throw new Error("Test database must differ from the normal DATABASE_URL");
process.env.DATABASE_URL = testDatabaseUrl;

const marker = `mission-dispatch-ux-${Date.now()}`;
const fixtureMissionIds = new Set<string>();
const internalApiSecret = `mission-dispatch-ux-secret-${Date.now()}`;
process.env.INTERNAL_API_SECRET = internalApiSecret;

function promotionRequest(id: string, authorization?: string) {
  return new NextRequest(`http://localhost/api/missions/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { "Authorization": authorization } : {}),
    },
    body: JSON.stringify({ action: "enableAutomaticExecution" }),
  });
}

async function createMission(body: Record<string, unknown>) {
  const { POST } = await import("../src/app/api/missions/route");
  const response = await POST(new NextRequest("http://localhost/api/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const mission = JSON.parse(text) as { id: string };
  fixtureMissionIds.add(mission.id);
  return mission;
}

async function main() {
  const schemaSync = spawnSync(
    path.resolve("node_modules/.bin/prisma"),
    ["db", "push", "--skip-generate"],
    { cwd: process.cwd(), env: process.env, encoding: "utf8" },
  );
  if (schemaSync.status !== 0) {
    throw new Error(`Could not prepare isolated execution-mode test database:\n${schemaSync.stderr || schemaSync.stdout}`);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { PATCH } = await import("../src/app/api/missions/[id]/route");
  const { claimNextMission, finishExecution, markExecutionRunning } = await import("../src/lib/mission-execution");
  let isolationVerified = false;
  try {
    const [existingMissions, existingExecutions] = await Promise.all([
      prisma.mission.count(),
      prisma.missionExecution.count(),
    ]);
    if (existingMissions !== 0 || existingExecutions !== 0) {
      throw new Error(
        `Isolated execution-mode test database must be empty; found ${existingMissions} mission(s) and ${existingExecutions} execution(s)`,
      );
    }
    isolationVerified = true;
    console.log(`PASS isolated database safety: ${databaseName} is separate from normal Mission Control and begins empty`);

    const hermesDefault = await createMission({
      title: `${marker}-hermes-default`, description: "default", agentId: "hermes", priority: "medium",
    });
    const hermesManual = await createMission({
      title: `${marker}-hermes-manual`, description: "manual", agentId: "hermes", priority: "medium", executionMode: "MANUAL",
    });
    const unsupportedDefault = await createMission({
      title: `${marker}-unsupported-default`, description: "unsupported", agentId: "writer-bot", priority: "medium",
    });
    const unsupportedAuto = await createMission({
      title: `${marker}-unsupported-auto`, description: "unsupported auto", agentId: "writer-bot", priority: "medium", executionMode: "AUTO",
    });
    const hermesAutomatic = await createMission({
      title: `${marker}-hermes-auto`, description: "automatic", agentId: "hermes", priority: "medium", executionMode: "AUTO",
    });

    const rows = await prisma.mission.findMany({
      where: { id: { in: [hermesDefault.id, hermesManual.id, unsupportedDefault.id, unsupportedAuto.id, hermesAutomatic.id] } },
      include: { executions: true },
    });
    const byId = new Map(rows.map((mission) => [mission.id, mission]));
    assert.equal(byId.get(hermesDefault.id)?.executionMode, "MANUAL");
    assert.equal(byId.get(hermesDefault.id)?.executions[0]?.mode, "MANUAL");
    assert.equal(byId.get(hermesManual.id)?.executionMode, "MANUAL");
    assert.equal(byId.get(hermesManual.id)?.executions[0]?.mode, "MANUAL");
    assert.equal(byId.get(hermesAutomatic.id)?.executionMode, "AUTO");
    assert.equal(byId.get(hermesAutomatic.id)?.executions[0]?.mode, "AUTO");
    for (const id of [unsupportedDefault.id, unsupportedAuto.id]) {
      assert.equal(byId.get(id)?.executionMode, "MANUAL");
      assert.equal(byId.get(id)?.executions[0]?.mode, "MANUAL");
    }
    console.log("PASS mission creation policy: Manual default, explicit Hermes Automatic, unsupported agents Manual");

    const manualClaim = await claimNextMission({
      workerId: `${marker}-manual-worker`,
      executionId: `${marker}-manual-execution`,
      concurrencyLimit: 1,
    });
    assert.notEqual(manualClaim?.missionId, hermesDefault.id);
    const untouchedManual = await prisma.mission.findUniqueOrThrow({
      where: { id: hermesDefault.id },
      include: { executions: true },
    });
    assert.equal(untouchedManual.status, "pending");
    assert.equal(untouchedManual.executions.length, 1);
    console.log("PASS new Manual mission remains pending and unclaimed");

    if (manualClaim?.missionId === hermesAutomatic.id) {
      await markExecutionRunning(`${marker}-manual-execution`);
      await finishExecution(`${marker}-manual-execution`, {
        status: "completed",
        result: "automatic mission complete",
        debriefPath: "Memory/debriefs/test.md",
      });
    }
    assert.equal(manualClaim?.missionId, hermesAutomatic.id);
    console.log("PASS new Automatic Hermes mission is claimed through the existing atomic path");

    const missingAuthorization = await PATCH(
      promotionRequest(hermesManual.id),
      { params: Promise.resolve({ id: hermesManual.id }) },
    );
    assert.equal(missingAuthorization.status, 401);
    const invalidAuthorization = await PATCH(
      promotionRequest(hermesManual.id, "Bearer invalid-secret"),
      { params: Promise.resolve({ id: hermesManual.id }) },
    );
    assert.equal(invalidAuthorization.status, 403);
    const missingMissionWithoutAuthorization = await PATCH(
      promotionRequest("does-not-exist"),
      { params: Promise.resolve({ id: "does-not-exist" }) },
    );
    assert.equal(missingMissionWithoutAuthorization.status, 401);
    const missingMissionWithInvalidAuthorization = await PATCH(
      promotionRequest("does-not-exist", "Bearer invalid-secret"),
      { params: Promise.resolve({ id: "does-not-exist" }) },
    );
    assert.equal(missingMissionWithInvalidAuthorization.status, 403);
    const unauthorizedUnchanged = await prisma.mission.findUniqueOrThrow({
      where: { id: hermesManual.id },
      include: { executions: true },
    });
    assert.equal(unauthorizedUnchanged.executionMode, "MANUAL");
    assert.equal(unauthorizedUnchanged.status, "pending");
    assert.equal(unauthorizedUnchanged.executions.length, 1);
    assert.equal(unauthorizedUnchanged.executions[0]?.mode, "MANUAL");
    assert.equal(unauthorizedUnchanged.executions[0]?.status, "queued");
    console.log("PASS promotion authorization: missing 401, invalid 403, no ID disclosure, both rows unchanged");

    const unsupportedPromotion = await PATCH(
      promotionRequest(unsupportedDefault.id, `Bearer ${internalApiSecret}`),
      { params: Promise.resolve({ id: unsupportedDefault.id }) },
    );
    assert.equal(unsupportedPromotion.status, 409);
    const rejectedUnsupported = await prisma.mission.findUniqueOrThrow({
      where: { id: unsupportedDefault.id },
      include: { executions: true },
    });
    assert.equal(rejectedUnsupported.executionMode, "MANUAL");
    assert.equal(rejectedUnsupported.executions.length, 1);
    assert.equal(rejectedUnsupported.executions[0]?.mode, "MANUAL");
    assert.equal(rejectedUnsupported.executions[0]?.status, "queued");
    const rejectedClaim = await claimNextMission({
      workerId: `${marker}-unsupported-worker`,
      executionId: `${marker}-unsupported-execution`,
      concurrencyLimit: 1,
    });
    assert.equal(rejectedClaim, null);
    const stillRejected = await prisma.mission.findUniqueOrThrow({
      where: { id: unsupportedDefault.id },
      include: { executions: true },
    });
    assert.equal(stillRejected.status, "pending");
    assert.equal(stillRejected.executionMode, "MANUAL");
    assert.equal(stillRejected.executions[0]?.status, "queued");
    assert.equal(stillRejected.executions[0]?.mode, "MANUAL");
    console.log("PASS unsupported Manual promotion rejected unchanged and never claimed");

    const promoteResponse = await PATCH(
      promotionRequest(hermesManual.id, `Bearer ${internalApiSecret}`),
      { params: Promise.resolve({ id: hermesManual.id }) },
    );
    assert.equal(promoteResponse.status, 200, await promoteResponse.text());

    const promoted = await prisma.mission.findUniqueOrThrow({
      where: { id: hermesManual.id },
      include: { executions: true },
    });
    assert.equal(promoted.executionMode, "AUTO");
    assert.equal(promoted.executions.length, 1);
    assert.equal(promoted.executions[0]?.mode, "AUTO");
    assert.equal(promoted.executions[0]?.status, "queued");

    const duplicatePromotion = await PATCH(
      promotionRequest(hermesManual.id, `Bearer ${internalApiSecret}`),
      { params: Promise.resolve({ id: hermesManual.id }) },
    );
    assert.equal(duplicatePromotion.status, 409);
    assert.equal(await prisma.missionExecution.count({ where: { missionId: hermesManual.id } }), 1);
    console.log("PASS pending Manual promotion updates existing mission and execution exactly once");

    const executionId = `${marker}-promoted-execution`;
    const promotedClaim = await claimNextMission({
      workerId: `${marker}-promoted-worker`,
      executionId,
      concurrencyLimit: 1,
    });
    assert.equal(promotedClaim?.missionId, hermesManual.id);
    await markExecutionRunning(executionId);
    const active = await prisma.mission.findUniqueOrThrow({ where: { id: hermesManual.id } });
    assert.equal(active.status, "active");
    await finishExecution(executionId, {
      status: "completed",
      result: "promoted mission complete",
      debriefPath: "Memory/debriefs/test.md",
    });
    const awaitingReview = await prisma.mission.findUniqueOrThrow({
      where: { id: hermesManual.id },
      include: { executions: true },
    });
    assert.equal(awaitingReview.status, "completed");
    assert.equal(awaitingReview.executions.length, 1);
    assert.equal(awaitingReview.executions[0]?.status, "completed");
    console.log("PASS promoted mission follows existing pending -> active -> awaiting review path without duplicates");

    assert.equal(missionQueueTimingLabel("AUTO", "5m", false), "Queued for automatic dispatch · 5m");
    assert.equal(missionQueueTimingLabel("MANUAL", "5m", true), "Waiting for manual launch · 5m");
    console.log("PASS truthful mission labels: AUTO queued, MANUAL waiting without stalled warning");

    assert.equal(legacyWorkerNextRunLabel(false, "2026-07-21T00:00:00Z", () => "misleading"), "Disabled");
    assert.equal(dispatcherStatusLabel("up"), "Active");
    console.log("PASS truthful processor banner: dispatcher active, disabled legacy next run suppressed");
  } finally {
    try {
      if (fixtureMissionIds.size > 0) {
        await prisma.mission.deleteMany({
          where: { id: { in: Array.from(fixtureMissionIds) } },
        });
      }
      if (isolationVerified) {
        const [remainingMissions, remainingExecutions] = await Promise.all([
          prisma.mission.count(),
          prisma.missionExecution.count(),
        ]);
        assert.equal(remainingMissions, 0, "Fixture Mission cleanup must leave the isolated database empty");
        assert.equal(remainingExecutions, 0, "Fixture execution cleanup must leave the isolated database empty");
        console.log("PASS isolated cleanup: zero fixture missions and executions remain");
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
