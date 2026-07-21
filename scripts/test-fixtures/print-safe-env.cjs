#!/usr/bin/env node
/* agent: hermes | model: grok-4.5 | date: 2026-07-20 */
// Prints selected SAFE_* env keys as JSON. No secrets.
const keys = [
  "SAFE_DOLLAR",
  "SAFE_SUBSTITUTION",
  "SAFE_BACKTICK",
  "SAFE_SPACES",
  "SAFE_EQUALS",
  "SAFE_HASH_IN_QUOTES",
];
const out = {};
for (const k of keys) out[k] = process.env[k] ?? null;
process.stdout.write(`${JSON.stringify(out)}\n`);
