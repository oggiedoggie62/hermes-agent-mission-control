/* agent: codex | model: gpt-5 | date: 2026-07-23 */
import assert from "node:assert/strict";
import path from "node:path";
import {
  MISSION_DEBRIEF_FILENAME_LIMIT,
  selectMissionDebriefPath,
  slugifyMissionTitle,
} from "../src/lib/mission-debrief-filename";

const agentosRoot = "/tmp/AgentOS";
const executionId = "12345678-abcd-4abc-9def-1234567890ab";

async function main() {
const normal = await selectMissionDebriefPath({
  title: "Audit and Repair Hermes Scheduled Jobs",
  executionId,
  agentosRoot,
  pathExists: async () => false,
});
assert.equal(normal.filename, "audit-and-repair-hermes-scheduled-jobs.debrief.md");
assert.equal(normal.debriefPath, `Logs/missions/${normal.filename}`);
assert.equal(normal.absoluteDebriefPath, path.join(agentosRoot, normal.debriefPath));
console.log("PASS normal title produces a readable slugged debrief filename");

const collision = await selectMissionDebriefPath({
  title: "Audit and Repair Hermes Scheduled Jobs",
  executionId,
  agentosRoot,
  pathExists: async (candidate) => candidate.endsWith(
    "/audit-and-repair-hermes-scheduled-jobs.debrief.md",
  ),
});
assert.equal(
  collision.filename,
  "audit-and-repair-hermes-scheduled-jobs-12345678.debrief.md",
);
console.log("PASS existing readable path uses the short execution ID without overwriting");

const occupied = new Set([
  path.join(agentosRoot, "Logs/missions/retry-safe.debrief.md"),
  path.join(agentosRoot, "Logs/missions/retry-safe-12345678.debrief.md"),
]);
const retry = await selectMissionDebriefPath({
  title: "Retry Safe",
  executionId,
  agentosRoot,
  pathExists: async (candidate) => occupied.has(candidate),
});
assert.equal(retry.filename, "retry-safe-12345678abcd.debrief.md");
assert(!occupied.has(retry.absoluteDebriefPath));
console.log("PASS retry collision extends the execution suffix to remain unique");

const unsafe = await selectMissionDebriefPath({
  title: "../../Secrets / Audit?! 🔥 ..\\..",
  executionId,
  agentosRoot,
  pathExists: async () => false,
});
assert.equal(unsafe.filename, "secrets-audit.debrief.md");
assert(!unsafe.filename.includes(".."));
assert(!unsafe.filename.includes("/"));
assert(!unsafe.filename.includes("\\"));
assert(unsafe.absoluteDebriefPath.startsWith(`${agentosRoot}/Logs/missions/`));
assert.equal(slugifyMissionTitle("!!!"), "mission");
console.log("PASS punctuation and path-traversal input cannot escape Logs/missions");

const longTitle = "Extremely Long Mission Title ".repeat(30);
const longFirst = await selectMissionDebriefPath({
  title: longTitle,
  executionId,
  agentosRoot,
  pathExists: async () => false,
});
assert(longFirst.filename.length <= MISSION_DEBRIEF_FILENAME_LIMIT);
assert(longFirst.filename.endsWith(".debrief.md"));
const longCollision = await selectMissionDebriefPath({
  title: longTitle,
  executionId,
  agentosRoot,
  pathExists: async (candidate) => candidate === longFirst.absoluteDebriefPath,
});
assert(longCollision.filename.length <= MISSION_DEBRIEF_FILENAME_LIMIT);
assert(longCollision.filename.endsWith("-12345678.debrief.md"));
console.log("PASS long filenames remain capped with extension and uniqueness suffix intact");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
