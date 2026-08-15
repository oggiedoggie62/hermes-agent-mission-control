import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { GuardianStatusCard } from "../src/components/guardian-status-card";
import {
  classifyGuardianRecord,
  GUARDIAN_MAX_AGE_MS,
  parseGuardianPayload,
  type GuardianStatus,
  type GuardianStatusResponse,
} from "../src/lib/guardian-status";
import { createGuardianStatusHandlers } from "../src/app/api/guardian/status/route";

const now = Date.parse("2026-08-14T20:30:00-06:00");
const secret = "guardian-integration-test-secret";
process.env.INTERNAL_API_SECRET = secret;

const validPayload = {
  hostname: "alans-mac-mini",
  status: "online",
  lastProbed: "2026-08-14T20:15:00-06:00",
  summary: "Tailscale reachable and SSH online",
  tailscale: "relay",
  recovery: {
    attempted: false,
    status: "not_needed",
    message: "Tailscale reachable",
  },
};

function request(body: unknown, authorization?: string) {
  return new NextRequest("http://localhost/api/guardian/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

async function main() {
  const parsed = parseGuardianPayload(validPayload, { now: () => now });
  assert.equal(parsed.hostname, "alans-mac-mini");
  assert.equal(parsed.recovery.status, "not_needed");
  assert.equal(GUARDIAN_MAX_AGE_MS, 35 * 60 * 1000);

  const localProducerTimestamp = parseGuardianPayload({
    ...validPayload,
    lastProbed: "2026-08-14T20:15:00.123456",
  }, { now: () => now });
  assert.equal(localProducerTimestamp.lastProbed, "2026-08-14T20:15:00.123456");

  assert.throws(
    () => parseGuardianPayload({ ...validPayload, status: "healthy" }, { now: () => now }),
    /Invalid Guardian status/,
  );
  assert.throws(
    () => parseGuardianPayload({ ...validPayload, recovery: { status: "not_needed" } }, { now: () => now }),
    /Invalid Guardian recovery state/,
  );
  assert.throws(
    () => parseGuardianPayload({ ...validPayload, lastProbed: "not-a-date" }, { now: () => now }),
    /ISO 8601/,
  );
  assert.throws(
    () => parseGuardianPayload({
      ...validPayload,
      lastProbed: "2026-08-14T19:54:59-06:00",
    }, { now: () => now }),
    /stale/,
  );
  assert.throws(
    () => parseGuardianPayload({
      ...validPayload,
      lastProbed: "2026-08-14T20:36:00-06:00",
    }, { now: () => now }),
    /future-dated/,
  );
  console.log("PASS Guardian consumer validates schema, producer timestamp format, freshness, and clock skew");

  const freshRecord = classifyGuardianRecord({ data: validPayload, updatedAt: new Date(now) }, () => now);
  assert.equal(freshRecord.availability, "available");
  assert.equal(freshRecord.authoritative, true);
  assert.equal(freshRecord.status?.status, "online");

  const staleRecord = classifyGuardianRecord({
    data: { ...validPayload, lastProbed: "2026-08-14T19:55:00-06:00" },
    updatedAt: new Date(now - GUARDIAN_MAX_AGE_MS),
  }, () => now + 1);
  assert.equal(staleRecord.availability, "stale");
  assert.equal(staleRecord.authoritative, false);
  assert.equal(staleRecord.status, null);
  assert.equal(staleRecord.lastKnownStatus?.hostname, "alans-mac-mini");
  assert.equal(classifyGuardianRecord(null, () => now).availability, "missing");
  assert.equal(classifyGuardianRecord({ data: {}, updatedAt: new Date(now) }, () => now).availability, "invalid");
  console.log("PASS Guardian records classify fresh, stale, missing, and invalid evidence without false authority");

  let stored: { data: GuardianStatus; updatedAt: Date } | null = null;
  const handlers = createGuardianStatusHandlers({
    findStatus: async () => stored,
    saveStatus: async (data) => {
      stored = { data, updatedAt: new Date(now) };
      return stored;
    },
    now: () => now,
  });

  assert.equal((await handlers.POST(request(validPayload))).status, 401);
  assert.equal((await handlers.POST(request(validPayload, "Bearer wrong"))).status, 403);
  assert.equal((await handlers.POST(request({ ...validPayload, tailscale: "maybe" }, `Bearer ${secret}`))).status, 400);
  assert.equal((await handlers.POST(request({
    ...validPayload,
    lastProbed: "2026-08-14T19:54:59-06:00",
  }, `Bearer ${secret}`))).status, 400);

  const saved = await handlers.POST(request(validPayload, `Bearer ${secret}`));
  assert.equal(saved.status, 200, await saved.text());
  assert.equal((await responseBody(await handlers.GET())).availability, "available");

  const missingHandlers = createGuardianStatusHandlers({
    findStatus: async () => null,
    saveStatus: async (data) => ({ data, updatedAt: new Date(now) }),
    now: () => now,
  });
  assert.equal((await responseBody(await missingHandlers.GET())).availability, "missing");

  const failedRead = createGuardianStatusHandlers({
    findStatus: async () => { throw new Error("database unavailable"); },
    saveStatus: async (data) => ({ data, updatedAt: new Date(now) }),
    now: () => now,
  });
  const failedReadResponse = await failedRead.GET();
  assert.equal(failedReadResponse.status, 503);
  assert.equal((await responseBody(failedReadResponse)).availability, "error");

  const failedWrite = createGuardianStatusHandlers({
    findStatus: async () => null,
    saveStatus: async () => { throw new Error("database unavailable"); },
    now: () => now,
  });
  const failedWriteResponse = await failedWrite.POST(request(validPayload, `Bearer ${secret}`));
  assert.equal(failedWriteResponse.status, 503);
  assert.equal((await responseBody(failedWriteResponse)).availability, "error");
  console.log("PASS Guardian API enforces shared 401/403 auth, validation, and clean DataStore failure responses");

  const staleMarkup = renderToStaticMarkup(React.createElement(GuardianStatusCard, {
    response: staleRecord,
  }));
  assert.match(staleMarkup, /Guardian report is stale/);
  assert.match(staleMarkup, /not authoritative/);
  assert.match(staleMarkup, /role="alert"/);

  const unavailable: GuardianStatusResponse = {
    availability: "error",
    authoritative: false,
    status: null,
    lastKnownStatus: null,
    updatedAt: null,
  };
  const unavailableMarkup = renderToStaticMarkup(React.createElement(GuardianStatusCard, {
    response: unavailable,
  }));
  assert.match(unavailableMarkup, /Guardian status unavailable/);
  assert.match(unavailableMarkup, /Current Guardian evidence is not available/);
  console.log("PASS Guardian card visibly renders stale and unavailable evidence states");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
