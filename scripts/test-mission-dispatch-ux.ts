/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import assert from "node:assert/strict";
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

async function createMission(body: Record<string, unknown>) {
  const { POST } = await import("../src/app/api/missions/route");
  const response = await POST(new NextRequest("http://localhost/api/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text) as { id: string };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
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

    const rows = await prisma.mission.findMany({
      where: { id: { in: [hermesDefault.id, hermesManual.id, unsupportedDefault.id, unsupportedAuto.id] } },
      include: { executions: true },
    });
    const byId = new Map(rows.map((mission) => [mission.id, mission]));
    assert.equal(byId.get(hermesDefault.id)?.executionMode, "AUTO");
    assert.equal(byId.get(hermesDefault.id)?.executions[0]?.mode, "AUTO");
    assert.equal(byId.get(hermesManual.id)?.executionMode, "MANUAL");
    assert.equal(byId.get(hermesManual.id)?.executions[0]?.mode, "MANUAL");
    for (const id of [unsupportedDefault.id, unsupportedAuto.id]) {
      assert.equal(byId.get(id)?.executionMode, "MANUAL");
      assert.equal(byId.get(id)?.executions[0]?.mode, "MANUAL");
    }
    console.log("PASS mission creation policy: Hermes default AUTO, explicit Manual MANUAL, unsupported agents MANUAL");

    assert.equal(missionQueueTimingLabel("AUTO", "5m", false), "Queued for automatic dispatch · 5m");
    assert.equal(missionQueueTimingLabel("MANUAL", "5m", true), "Waiting for manual launch · 5m");
    console.log("PASS truthful mission labels: AUTO queued, MANUAL waiting without stalled warning");

    assert.equal(legacyWorkerNextRunLabel(false, "2026-07-21T00:00:00Z", () => "misleading"), "Disabled");
    assert.equal(dispatcherStatusLabel("up"), "Active");
    console.log("PASS truthful processor banner: dispatcher active, disabled legacy next run suppressed");
  } finally {
    await prisma.mission.deleteMany({ where: { title: { startsWith: marker } } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
