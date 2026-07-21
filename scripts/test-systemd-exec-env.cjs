#!/usr/bin/env node
/* agent: hermes | model: grok-4.5 | date: 2026-07-20 */
/**
 * No-secret test for scripts/systemd-exec.cjs literal env loading.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const launcher = path.join(root, "scripts/systemd-exec.cjs");
const fixture = path.join(root, "scripts/test-fixtures/safe-env.env");
const probe = path.join(root, "scripts/test-fixtures/print-safe-env.cjs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-env-test-"));
const secureEnv = path.join(tmpDir, ".env");
const looseEnv = path.join(tmpDir, "loose.env");
fs.copyFileSync(fixture, secureEnv);
fs.copyFileSync(fixture, looseEnv);
fs.chmodSync(secureEnv, 0o600);
fs.chmodSync(looseEnv, 0o644);

// Ensure substitution targets do not exist before the run.
for (const p of ["/tmp/should-not-exist", "/tmp/should-not-exist-either"]) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* ok */
  }
}

function run(envFile) {
  return spawnSync(
    process.execPath,
    [launcher, process.execPath, probe],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        MISSION_CONTROL_ENV_FILE: envFile,
        PATH: process.env.PATH,
      },
    },
  );
}

const loose = run(looseEnv);
if (loose.status === 0) {
  console.error("FAIL: launcher accepted world/group-readable env file");
  process.exit(1);
}
if (!`${loose.stderr}${loose.stdout}`.includes("must be mode 0600")) {
  console.error("FAIL: expected mode 0600 fatal error, got:", loose.stderr || loose.stdout);
  process.exit(1);
}

const ok = run(secureEnv);
if (ok.status !== 0) {
  console.error("FAIL: secure env launch failed", ok.status, ok.stderr, ok.stdout);
  process.exit(1);
}

let reported;
try {
  reported = JSON.parse(ok.stdout.trim().split("\n").filter(Boolean).at(-1));
} catch (err) {
  console.error("FAIL: could not parse probe JSON", ok.stdout, err);
  process.exit(1);
}

const expected = {
  SAFE_DOLLAR: "$NOT_EXPANDED",
  SAFE_SUBSTITUTION: "$(touch /tmp/should-not-exist)",
  SAFE_BACKTICK: "`touch /tmp/should-not-exist-either`",
  SAFE_SPACES: "hello world",
  SAFE_EQUALS: "a=b=c",
  SAFE_HASH_IN_QUOTES: "value # not a comment",
};

for (const [key, value] of Object.entries(expected)) {
  if (reported[key] !== value) {
    console.error(`FAIL: ${key} expected ${JSON.stringify(value)} got ${JSON.stringify(reported[key])}`);
    process.exit(1);
  }
}

for (const p of ["/tmp/should-not-exist", "/tmp/should-not-exist-either"]) {
  if (fs.existsSync(p)) {
    console.error(`FAIL: side-effect file was created: ${p}`);
    process.exit(1);
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log("PASS systemd-exec literal env load + mode 0600 gate");
