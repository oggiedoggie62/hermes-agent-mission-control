#!/usr/bin/env node
/* agent: hermes | model: grok-4.5 | date: 2026-07-20 */
/**
 * Safe Mission Control process launcher for systemd.
 * Loads .env with literal values only (no shell eval/expansion), enforces
 * mode 0600, then spawns the application with stdio inherited and signals
 * forwarded. Never logs secret values.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = "/home/oggie/mission-control";
const DEFAULT_ENV_FILE = path.join(ROOT, ".env");

function fatal(message) {
  console.error(`mission-control-launcher: ${message}`);
  process.exit(1);
}

/**
 * Minimal dotenv-style parser. Values are preserved literally.
 * - Unquoted values: trim trailing unescaped inline comments starting with " #"
 * - Double/single quoted values: no variable expansion, no command substitution
 * - Does not treat $(), ``, or $VAR as shell syntax
 */
function parseEnvFile(text) {
  const out = Object.create(null);
  const lines = text.split(/\n/);
  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    let line = lines[lineNo];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    // optional export prefix
    if (line.startsWith("export ")) line = line.slice(7);
    const eq = line.indexOf("=");
    if (eq <= 0) {
      fatal(`malformed .env at line ${lineNo + 1}: expected KEY=VALUE`);
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      fatal(`malformed .env at line ${lineNo + 1}: invalid key`);
    }
    let raw = line.slice(eq + 1);
    let value = "";
    if (raw.startsWith('"')) {
      let i = 1;
      let buf = "";
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "\\") {
          const next = raw[i + 1];
          if (next === undefined) fatal(`malformed .env at line ${lineNo + 1}: dangling escape`);
          // preserve common escapes literally as their characters; no expansion
          if (next === "n") buf += "\n";
          else if (next === "r") buf += "\r";
          else if (next === "t") buf += "\t";
          else buf += next;
          i += 2;
          continue;
        }
        if (ch === '"') break;
        buf += ch;
        i += 1;
      }
      if (i >= raw.length || raw[i] !== '"') {
        fatal(`malformed .env at line ${lineNo + 1}: unclosed double quote`);
      }
      value = buf;
    } else if (raw.startsWith("'")) {
      const end = raw.indexOf("'", 1);
      if (end < 0) fatal(`malformed .env at line ${lineNo + 1}: unclosed single quote`);
      value = raw.slice(1, end);
    } else {
      // unquoted: strip trailing spaces and unescaped " #comment"
      const hash = raw.search(/(^|[^\\])\s+#/);
      if (hash >= 0) {
        const cut = raw.search(/\s+#/);
        raw = cut >= 0 ? raw.slice(0, cut) : raw;
      }
      value = raw.trim();
    }
    out[key] = value;
  }
  return out;
}

function assertSecureEnvFile(envPath) {
  let st;
  try {
    st = fs.statSync(envPath);
  } catch (err) {
    fatal(`.env missing or unreadable: ${envPath}`);
  }
  if (!st.isFile()) fatal(`.env is not a regular file: ${envPath}`);
  const mode = st.mode & 0o777;
  if (mode & 0o077) {
    fatal(
      `${envPath} must be mode 0600 (owner read/write only); found ${mode.toString(8)}. Run: chmod 600 ${envPath}`,
    );
  }
  if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
    fatal(`${envPath} must be owned by the service user (uid ${process.getuid()})`);
  }
}

function loadEnv(envPath) {
  assertSecureEnvFile(envPath);
  const text = fs.readFileSync(envPath, "utf8");
  const parsed = parseEnvFile(text);
  // Apply literally onto process.env without logging values.
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
  return Object.keys(parsed).length;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fatal("usage: systemd-exec.mjs <absolute-command> [args...]");
  }

  const envFile = process.env.MISSION_CONTROL_ENV_FILE || DEFAULT_ENV_FILE;
  try {
    process.chdir(ROOT);
  } catch {
    fatal(`cannot chdir to ${ROOT}`);
  }

  const keyCount = loadEnv(envFile);
  // Intentionally log only counts/paths, never secret values.
  console.error(`mission-control-launcher: loaded ${keyCount} keys from ${envFile}`);

  const defaultPath =
    "/home/oggie/mission-control/node_modules/.bin:/home/oggie/.local/bin:/usr/local/bin:/usr/bin:/bin";
  process.env.PATH = process.env.PATH
    ? `${defaultPath}:${process.env.PATH}`
    : defaultPath;
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

  const command = args[0];
  if (!path.isAbsolute(command)) {
    fatal(`command must be an absolute path: ${command}`);
  }
  if (!fs.existsSync(command)) {
    fatal(`command not found: ${command}`);
  }

  const child = spawn(command, args.slice(1), {
    env: process.env,
    stdio: "inherit",
    cwd: ROOT,
  });

  const forward = (signal) => {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        /* ignore */
      }
    }
  };
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGHUP", () => forward("SIGHUP"));

  child.on("error", (err) => {
    fatal(`failed to spawn application: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      // Mirror child signal exit semantics approximately.
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

main();
