/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveClient } from "../src/app/missions/archive/archive-client";
import { MissionCard } from "../src/app/missions/mission-card";
import {
  buildHermesMissionPrompt,
  completionAcknowledgement,
  executionContractFailure,
  HERMES_DIAGNOSTIC_EXCERPT_LIMIT,
  validateCompletionAcknowledgement,
  validateDebrief,
} from "../src/lib/hermes-debrief-contract";

const fixture = {
  missionId: "mission-contract-fixture",
  executionId: "execution-contract-fixture",
  absoluteDebriefPath: "/tmp/AgentOS/Logs/missions/mission-contract-fixture.debrief.md",
};
const meaningfulResult = "Completed the harmless verification and confirmed the artifact.";

const validDebrief = [
  "## Summary",
  "Completed the controlled task.",
  "## Work Performed",
  "Performed only the requested work.",
  "## Evidence",
  "Verified the exact debrief path.",
  "## Decisions Made",
  "No unrelated changes were made.",
].join("\n");

const acknowledgement = completionAcknowledgement({
  ...fixture,
  resultSummary: meaningfulResult,
});
const parsedAcknowledgement = validateCompletionAcknowledgement(acknowledgement, fixture);
assert.equal(parsedAcknowledgement.error, null);
assert.equal(parsedAcknowledgement.resultSummary, meaningfulResult);
assert.equal(validateDebrief(validDebrief), null);
console.log("PASS valid acknowledgement exposes one concise meaningful result summary");

assert.match(
  validateCompletionAcknowledgement("Controlled result", fixture).error ?? "",
  /missing, malformed, or did not match/,
);
console.log("PASS file without valid acknowledgement fails");

assert.match(
  validateCompletionAcknowledgement(
    completionAcknowledgement({
      ...fixture,
      absoluteDebriefPath: `${fixture.absoluteDebriefPath}.wrong`,
      resultSummary: meaningfulResult,
    }),
    fixture,
  ).error ?? "",
  /exact debrief path/,
);
console.log("PASS acknowledgement with the wrong path fails");

for (const mismatched of [
  completionAcknowledgement({ ...fixture, missionId: "wrong-mission", resultSummary: meaningfulResult }),
  completionAcknowledgement({ ...fixture, executionId: "wrong-execution", resultSummary: meaningfulResult }),
]) {
  assert.match(
    validateCompletionAcknowledgement(mismatched, fixture).error ?? "",
    /did not match the claimed mission, execution, and exact debrief path/,
  );
}
console.log("PASS mission ID, execution ID, and exact path mismatches still fail");

for (const invalidSummary of [
  acknowledgement.replace(`Result Summary: ${meaningfulResult}`, "Result Summary:"),
  acknowledgement.replace(`Result Summary: ${meaningfulResult}`, "Result Summary:    "),
  acknowledgement.replace(`Result Summary: ${meaningfulResult}`, ""),
]) {
  const validation = validateCompletionAcknowledgement(invalidSummary, fixture);
  assert(validation.error);
  assert.equal(validation.resultSummary, null);
}
console.log("PASS missing and empty result summaries fail closed");

assert.match(validateDebrief("## Summary\nOnly one section.") ?? "", /Work Performed/);
console.log("PASS malformed debrief fails");

const prompt = buildHermesMissionPrompt({
  ...fixture,
  title: "Harmless contract fixture",
  priority: "low",
  description: "Do nothing outside the fixture.",
});
assert.match(prompt, /MUST write the debrief to this exact absolute path/);
assert.match(prompt, /MUST verify that the exact file/);
assert.match(prompt, /MUST NOT report success/);
assert.match(prompt, /A stdout claim alone never completes/);
assert.match(prompt, /## Summary/);
assert.match(prompt, /## Work Performed/);
assert.match(prompt, /## Evidence/);
assert.match(prompt, /## Decisions Made/);
assert.match(prompt, /MISSION CONTROL COMPLETION/);
assert.match(prompt, /Result Summary: <concise non-empty single-line outcome summary>/);
console.log("PASS prompt makes artifact creation, verification, sections, and acknowledgement mandatory");

const completedMission = {
  id: fixture.missionId,
  agentId: "hermes",
  title: "Completed contract fixture",
  description: "Controlled fixture",
  status: "completed",
  priority: "low",
  result: parsedAcknowledgement.resultSummary,
  debriefPath: "Logs/missions/completed-contract-fixture.debrief.md",
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  executionMode: "AUTO",
  executions: [],
};
const missionCardMarkup = renderToStaticMarkup(React.createElement(MissionCard, {
  m: completedMission,
  agents: [],
  colIcon: null,
  onArchive: async () => {},
  onEnableAutomatic: async () => {},
  onEdit: async () => {},
  onCancel: async () => {},
  now: Date.now(),
  stalledWarningMs: 45 * 60 * 1_000,
}));
const archiveMarkup = renderToStaticMarkup(React.createElement(ArchiveClient, {
  missions: [{
    id: completedMission.id,
    agentId: completedMission.agentId,
    title: completedMission.title,
    description: completedMission.description,
    result: completedMission.result,
    debriefPath: completedMission.debriefPath,
    completedAt: completedMission.completedAt,
  }],
}));
for (const markup of [missionCardMarkup, archiveMarkup]) {
  assert.match(markup, new RegExp(meaningfulResult.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert(!markup.includes("MISSION CONTROL COMPLETION"));
}
console.log("PASS Mission card and archive render the meaningful summary without acknowledgement boilerplate");

const secret = "contract-secret-that-must-not-persist";
const oversized = `start-${"x".repeat(HERMES_DIAGNOSTIC_EXCERPT_LIMIT * 2)}-${secret}`;
const diagnostics = executionContractFailure(
  ["Expected debrief is missing"],
  oversized,
  `Bearer ${secret}`,
  { ...process.env, MISSION_TEST_SECRET: secret },
);
assert(!diagnostics.includes(secret));
assert.match(diagnostics, /\[REDACTED\]/);
assert.match(diagnostics, /\[truncated\]/);
assert(diagnostics.length < HERMES_DIAGNOSTIC_EXCERPT_LIMIT * 2 + 500);
console.log("PASS failure diagnostics are bounded and redact configured secrets");

const databaseUrl = "postgresql://user:secret@db.internal:5432/mission_control";
const databaseDiagnostics = executionContractFailure(
  ["Database connection failed"],
  `DATABASE_URL=${databaseUrl}`,
  "",
  { ...process.env, DATABASE_URL: databaseUrl },
);
assert(!databaseDiagnostics.includes("user:secret"));
assert.match(
  databaseDiagnostics,
  /postgresql:\/\/\[REDACTED\]@db\.internal:5432\/mission_control/,
);
console.log("PASS DATABASE_URL user-info is redacted while host, port, and database remain useful");

const genericUriDiagnostics = executionContractFailure(
  ["Connection failed"],
  "redis://cache-token@redis.internal:6379/0",
  "amqp://queue-user:queue-password@mq.internal:5672/events",
  process.env,
);
assert(!genericUriDiagnostics.includes("cache-token"));
assert(!genericUriDiagnostics.includes("queue-user:queue-password"));
assert.match(genericUriDiagnostics, /redis:\/\/\[REDACTED\]@redis\.internal:6379\/0/);
assert.match(genericUriDiagnostics, /amqp:\/\/\[REDACTED\]@mq\.internal:5672\/events/);
console.log("PASS generic URI username/password and token user-info are redacted in ordinary output");

const publicUrl = "https://status.internal:8443/health/details";
const credentialFreeRedisUrl = "redis://redis.internal:6379/0";
const publicUrlDiagnostics = executionContractFailure(
  ["Health probe failed"],
  `Probe URL: ${publicUrl}\nREDIS_URL=${credentialFreeRedisUrl}`,
  "",
  { ...process.env, REDIS_URL: credentialFreeRedisUrl },
);
assert.match(publicUrlDiagnostics, new RegExp(publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(publicUrlDiagnostics, /redis:\/\/redis\.internal:6379\/0/);
console.log("PASS URLs without credentials retain useful scheme, host, port, and path structure");

const existingCredentialDiagnostics = executionContractFailure(
  ["Authentication failed"],
  "api_key=plain-api-key token:plain-token",
  "Authorization: Bearer plain-bearer-token",
  {
    ...process.env,
    SERVICE_API_KEY: "plain-api-key",
    SERVICE_TOKEN: "plain-token",
  },
);
for (const credential of ["plain-api-key", "plain-token", "plain-bearer-token"]) {
  assert(!existingCredentialDiagnostics.includes(credential));
}
assert.match(existingCredentialDiagnostics, /api_key=\[REDACTED\]/);
assert.match(existingCredentialDiagnostics, /token=\[REDACTED\]/);
assert.match(existingCredentialDiagnostics, /Bearer \[REDACTED\]/);
console.log("PASS existing API-key, token, and authorization-header redaction remains effective");
