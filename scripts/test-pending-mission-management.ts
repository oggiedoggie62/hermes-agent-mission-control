/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

const testDatabaseUrl = process.env.DISPATCHER_TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error("DISPATCHER_TEST_DATABASE_URL is required");
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!databaseName.endsWith("_test")) throw new Error("Pending Mission tests require a database ending in _test");
if (process.env.DATABASE_URL === testDatabaseUrl) throw new Error("Test database must differ from normal Mission Control");
process.env.DATABASE_URL = testDatabaseUrl;
process.env.INTERNAL_API_SECRET = `pending-mission-secret-${Date.now()}`;

const fixtureIds = new Set<string>();
const marker = `pending-mission-management-${Date.now()}`;

function request(id: string, body: Record<string, unknown>, credential = `Bearer ${process.env.INTERNAL_API_SECRET}`) {
  return new NextRequest(`http://localhost/api/missions/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { "Authorization": credential } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const schemaSync = spawnSync(
    path.resolve("node_modules/.bin/prisma"),
    ["db", "push", "--skip-generate"],
    { cwd: process.cwd(), env: process.env, encoding: "utf8" },
  );
  if (schemaSync.status !== 0) throw new Error(schemaSync.stderr || schemaSync.stdout);

  const { prisma } = await import("../src/lib/prisma");
  const { POST } = await import("../src/app/api/missions/route");
  const { PATCH } = await import("../src/app/api/missions/[id]/route");
  const { claimNextMission, finishExecution } = await import("../src/lib/mission-execution");
  const {
    changePendingMissionEdit,
    closePendingMissionEdit,
    failPendingMissionEdit,
    openPendingMissionEdit,
    succeedPendingMissionEdit,
  } = await import("../src/lib/pending-mission-edit-state");
  const { MissionCardActionError, PendingMissionEditError } = await import("../src/app/missions/mission-card");

  const create = async (suffix: string, agentId = "hermes", executionMode = "MANUAL") => {
    const response = await POST(new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${marker}-${suffix}`,
        description: `${suffix} description`,
        agentId,
        priority: "medium",
        executionMode,
      }),
    }));
    const text = await response.text();
    assert.equal(response.status, 200, text);
    const mission = JSON.parse(text) as { id: string };
    fixtureIds.add(mission.id);
    return mission;
  };

  try {
    assert.equal(await prisma.mission.count(), 0);
    assert.equal(await prisma.missionExecution.count(), 0);

    const enteredDraft = {
      title: "Operator entered title",
      description: "Operator entered description",
      agentId: "hermes",
      priority: "high",
      executionMode: "AUTO" as const,
    };
    let editUi = openPendingMissionEdit(enteredDraft);
    editUi = failPendingMissionEdit(editUi, "Authorization failed");
    assert.equal(editUi.open, true);
    assert.deepEqual(editUi.draft, enteredDraft);
    assert.equal(editUi.error, "Authorization failed");
    const modalErrorMarkup = renderToStaticMarkup(
      React.createElement(PendingMissionEditError, { error: editUi.error }),
    );
    assert.match(modalErrorMarkup, /role="alert"/);
    assert.match(modalErrorMarkup, /Authorization failed/);
    editUi = changePendingMissionEdit(editUi, { title: "Corrected title" });
    assert.equal(editUi.error, null);
    assert.equal(editUi.open, true);
    assert.equal(editUi.draft.description, "Operator entered description");
    editUi = failPendingMissionEdit(editUi, "Mission was claimed before the edit could be saved");
    editUi = succeedPendingMissionEdit(editUi);
    assert.equal(editUi.open, false);
    assert.equal(editUi.error, null);
    assert.equal(editUi.draft.title, "Corrected title");
    const reopened = openPendingMissionEdit(enteredDraft);
    assert.equal(reopened.error, null);
    assert.equal(closePendingMissionEdit(failPendingMissionEdit(reopened, "Validation failed")).error, null);
    const cancelErrorMarkup = renderToStaticMarkup(
      React.createElement(MissionCardActionError, { error: "Failed to cancel mission" }),
    );
    assert.match(cancelErrorMarkup, /role="alert"/);
    assert.match(cancelErrorMarkup, /Failed to cancel mission/);
    console.log("PASS edit UI error state: visible in modal, draft/open preserved, change/success/close clear, card cancel error retained");

    const editable = await create("editable");
    for (const [credential, expected] of [["", 401], ["Bearer invalid", 403]] as const) {
      const response = await PATCH(
        request(editable.id, { action: "editPending", title: "Unauthorized", description: "", agentId: "hermes", priority: "high", executionMode: "AUTO" }, credential),
        { params: Promise.resolve({ id: editable.id }) },
      );
      assert.equal(response.status, expected);
    }
    let row = await prisma.mission.findUniqueOrThrow({ where: { id: editable.id }, include: { executions: true } });
    assert.equal(row.title, `${marker}-editable`);
    assert.equal(row.executionMode, "MANUAL");
    assert.equal(row.executions[0]?.mode, "MANUAL");

    const writerEdit = await PATCH(
      request(editable.id, { action: "editPending", title: "Edited writer mission", description: "updated", agentId: "writer-bot", priority: "high", executionMode: "AUTO" }),
      { params: Promise.resolve({ id: editable.id }) },
    );
    assert.equal(writerEdit.status, 200, await writerEdit.text());
    row = await prisma.mission.findUniqueOrThrow({ where: { id: editable.id }, include: { executions: true } });
    assert.equal(row.title, "Edited writer mission");
    assert.equal(row.agentId, "writer-bot");
    assert.equal(row.priority, "high");
    assert.equal(row.executionMode, "MANUAL");
    assert.equal(row.executions[0]?.mode, "MANUAL");
    console.log("PASS edit pending: fields update in place and unsupported AUTO resolves to MANUAL");

    const blankEdit = await PATCH(
      request(editable.id, { action: "editPending", title: "   ", description: "", agentId: "writer-bot", priority: "high", executionMode: "MANUAL" }),
      { params: Promise.resolve({ id: editable.id }) },
    );
    assert.equal(blankEdit.status, 400);
    assert.equal((await prisma.mission.findUniqueOrThrow({ where: { id: editable.id } })).title, "Edited writer mission");
    console.log("PASS edit validation: blank title rejected without mutation");

    const automaticEdit = await create("automatic-edit");
    const automaticEditResponse = await PATCH(
      request(automaticEdit.id, { action: "editPending", title: "Eligible Automatic edit", description: "auto", agentId: "hermes", priority: "high", executionMode: "AUTO" }),
      { params: Promise.resolve({ id: automaticEdit.id }) },
    );
    assert.equal(automaticEditResponse.status, 200, await automaticEditResponse.text());
    const automaticEdited = await prisma.mission.findUniqueOrThrow({ where: { id: automaticEdit.id }, include: { executions: true } });
    assert.equal(automaticEdited.executionMode, "AUTO");
    assert.equal(automaticEdited.executions[0]?.mode, "AUTO");
    const automaticEditedClaim = await claimNextMission({ workerId: `${marker}-edited-auto`, executionId: `${marker}-edited-auto-exec` });
    assert.equal(automaticEditedClaim?.missionId, automaticEdit.id);
    await finishExecution(`${marker}-edited-auto-exec`, { status: "failed", error: "Controlled test release" });
    console.log("PASS eligible edit: shared Hermes AUTO policy updates both rows and remains atomically claimable");

    const cancellable = await create("cancellable", "writer-bot");
    const missingCancel = await PATCH(
      request(cancellable.id, { action: "cancelPending" }, ""),
      { params: Promise.resolve({ id: cancellable.id }) },
    );
    assert.equal(missingCancel.status, 401);
    const invalidCancel = await PATCH(
      request(cancellable.id, { action: "cancelPending" }, "Bearer invalid"),
      { params: Promise.resolve({ id: cancellable.id }) },
    );
    assert.equal(invalidCancel.status, 403);
    const cancelResponse = await PATCH(
      request(cancellable.id, { action: "cancelPending" }),
      { params: Promise.resolve({ id: cancellable.id }) },
    );
    assert.equal(cancelResponse.status, 200, await cancelResponse.text());
    const cancelled = await prisma.mission.findUniqueOrThrow({ where: { id: cancellable.id }, include: { executions: true } });
    assert.equal(cancelled.status, "cancelled");
    assert(cancelled.completedAt);
    assert.equal(cancelled.executions.length, 1);
    assert.equal(cancelled.executions[0]?.status, "cancelled");
    assert(cancelled.executions[0]?.completedAt);
    assert.notEqual(cancelled.status, "failed");
    assert.equal(await claimNextMission({ workerId: `${marker}-cancelled`, executionId: `${marker}-cancelled-exec` }), null);
    const repeatCancel = await PATCH(
      request(cancellable.id, { action: "cancelPending" }),
      { params: Promise.resolve({ id: cancellable.id }) },
    );
    assert.equal(repeatCancel.status, 409);
    const editCancelled = await PATCH(
      request(cancellable.id, { action: "editPending", title: "Too late", description: "", agentId: "writer-bot", priority: "low", executionMode: "MANUAL" }),
      { params: Promise.resolve({ id: cancellable.id }) },
    );
    assert.equal(editCancelled.status, 409);
    console.log("PASS cancel pending: audit rows retained as Cancelled, unclaimable, repeat rejected");

    const claimed = await create("claimed", "hermes", "AUTO");
    const claimedResult = await claimNextMission({ workerId: `${marker}-claimed`, executionId: `${marker}-claimed-exec` });
    assert.equal(claimedResult?.missionId, claimed.id);
    const claimedEdit = await PATCH(
      request(claimed.id, { action: "editPending", title: "Too late", description: "", agentId: "hermes", priority: "low", executionMode: "AUTO" }),
      { params: Promise.resolve({ id: claimed.id }) },
    );
    const claimedCancel = await PATCH(
      request(claimed.id, { action: "cancelPending" }),
      { params: Promise.resolve({ id: claimed.id }) },
    );
    assert.equal(claimedEdit.status, 409);
    assert.equal(claimedCancel.status, 409);
    const stillClaimed = await prisma.mission.findUniqueOrThrow({ where: { id: claimed.id }, include: { executions: true } });
    assert.equal(stillClaimed.status, "active");
    assert.equal(stillClaimed.executions[0]?.status, "claimed");
    console.log("PASS claimed rejection: edit and cancel cannot mutate active/claimed rows");
    await finishExecution(`${marker}-claimed-exec`, { status: "failed", error: "Controlled test release" });

    const editRace = await create("edit-race", "hermes", "AUTO");
    const [raceEditResponse, raceEditClaim] = await Promise.all([
      PATCH(
        request(editRace.id, { action: "editPending", title: "Atomic edited title", description: "race", agentId: "hermes", priority: "high", executionMode: "AUTO" }),
        { params: Promise.resolve({ id: editRace.id }) },
      ),
      claimNextMission({ workerId: `${marker}-edit-race`, executionId: `${marker}-edit-race-exec` }),
    ]);
    const editRaceRow = await prisma.mission.findUniqueOrThrow({ where: { id: editRace.id }, include: { executions: true } });
    if (raceEditResponse.status === 200) {
      assert.equal(raceEditClaim?.missionId, editRace.id);
      assert.equal(editRaceRow.title, "Atomic edited title");
      assert.equal(editRaceRow.status, "active");
    } else {
      assert.equal(raceEditResponse.status, 409);
      assert.equal(raceEditClaim?.missionId, editRace.id);
      assert.equal(editRaceRow.title, `${marker}-edit-race`);
    }
    assert.equal(editRaceRow.executions[0]?.status, "claimed");
    console.log("PASS edit/claim race: serialized outcome has no partial Mission/execution update");
    await finishExecution(`${marker}-edit-race-exec`, { status: "failed", error: "Controlled test release" });

    const cancelRace = await create("cancel-race", "hermes", "AUTO");
    const [raceCancelResponse, raceCancelClaim] = await Promise.all([
      PATCH(request(cancelRace.id, { action: "cancelPending" }), { params: Promise.resolve({ id: cancelRace.id }) }),
      claimNextMission({ workerId: `${marker}-cancel-race`, executionId: `${marker}-cancel-race-exec` }),
    ]);
    const cancelRaceRow = await prisma.mission.findUniqueOrThrow({ where: { id: cancelRace.id }, include: { executions: true } });
    if (raceCancelResponse.status === 200) {
      assert.equal(raceCancelClaim, null);
      assert.equal(cancelRaceRow.status, "cancelled");
      assert.equal(cancelRaceRow.executions[0]?.status, "cancelled");
    } else {
      assert.equal(raceCancelResponse.status, 409);
      assert.equal(raceCancelClaim?.missionId, cancelRace.id);
      assert.equal(cancelRaceRow.status, "active");
      assert.equal(cancelRaceRow.executions[0]?.status, "claimed");
    }
    console.log("PASS cancel/claim race: exactly one terminal claim-or-cancel outcome");
  } finally {
    try {
      if (fixtureIds.size) await prisma.mission.deleteMany({ where: { id: { in: [...fixtureIds] } } });
      assert.equal(await prisma.mission.count(), 0);
      assert.equal(await prisma.missionExecution.count(), 0);
      console.log(`PASS isolated cleanup: ${databaseName} has zero fixture rows`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
