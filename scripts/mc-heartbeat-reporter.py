#!/usr/bin/env python3
"""
Mission Control Heartbeat Reporter

Reports system health and agent state to the Mission Control dashboard.
Runs as a cron job every 10 minutes.

Usage:
    python3 scripts/mc-heartbeat-reporter.py [--dry-run]

API endpoints:
    POST /api/host/health  — Mint workstation health (CPU, GPU, RAM, NAS)
    POST /api/agents/state — Agent state from AgentOS registry
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

# ── Config ──────────────────────────────────────────────────────────────────
MISSION_CONTROL_URL = os.environ.get("MC_URL", "http://localhost:3000")
API_SECRET = os.environ.get("MC_API_SECRET", "05075888cc8a813dcb4faa766ccb017c930a7eb51cf829a48238eb6bd12b5f84")
AGENTOS_ROOT = os.environ.get("AGENTOS_ROOT", os.path.expanduser("~/AI/AgentOS"))

DRY_RUN = "--dry-run" in sys.argv


# ── Helpers ─────────────────────────────────────────────────────────────────

def log(msg: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")


def post_json(endpoint: str, data: dict) -> dict | None:
    """POST JSON to Mission Control API. Returns response or None."""
    url = f"{MISSION_CONTROL_URL}{endpoint}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_SECRET}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log(f"  HTTP {e.code} from {endpoint}: {e.read().decode()[:200]}")
        return None
    except Exception as e:
        log(f"  Error POSTing to {endpoint}: {e}")
        return None


def read_json(path: str) -> dict | list | None:
    """Safely read a JSON file."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        log(f"  Warning: could not read {path}: {e}")
        return None


def run_cmd(cmd: list[str], timeout: int = 10) -> str:
    """Run a shell command and return stdout, or empty string on failure."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ""


# ── Data Collectors ─────────────────────────────────────────────────────────

def collect_host_health() -> dict:
    """Gather Mint workstation health metrics."""
    health = {
        "hostname": "Mint-Hub",
        "cpuUsage": 0.0,
        "ramUsage": 0.0,
        "diskUsage": 0.0,
        "gpuTemp": None,
        "nasConnected": False,
        "nasAvailable": 0.0,
    }

    # CPU load (1-min average as percentage of cores)
    try:
        loadavg = open("/proc/loadavg").read().split()
        cores = os.cpu_count() or 1
        health["cpuUsage"] = round(float(loadavg[0]) / cores * 100, 1)
    except Exception:
        pass

    # RAM usage
    try:
        meminfo = {}
        for line in open("/proc/meminfo"):
            parts = line.split()
            if parts[0].rstrip(":") in ("MemTotal", "MemAvailable"):
                meminfo[parts[0].rstrip(":")] = int(parts[1])
        if "MemTotal" in meminfo and "MemAvailable" in meminfo:
            used = meminfo["MemTotal"] - meminfo["MemAvailable"]
            health["ramUsage"] = round(used / meminfo["MemTotal"] * 100, 1)
    except Exception:
        pass

    # Disk usage on root
    try:
        r = run_cmd(["df", "--output=pcent", "/"])
        if r:
            health["diskUsage"] = float(r.split("\n")[-1].strip().rstrip("%"))
    except Exception:
        pass

    # GPU temp (NVIDIA)
    gpu_temp = run_cmd(
        ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader"]
    )
    if gpu_temp:
        try:
            health["gpuTemp"] = int(gpu_temp.split("\n")[0].strip())
        except ValueError:
            pass

    # NAS connectivity — check if any CIFS mount is active
    try:
        mount_out = run_cmd(["mount", "-t", "cifs"])
        cifs_mounts = [l for l in mount_out.split("\n") if l.strip()]
        health["nasConnected"] = len(cifs_mounts) > 0

        # Total NAS free space (sum of all CIFS mounts)
        total_free = 0.0
        for mnt in cifs_mounts:
            parts = mnt.split()
            if len(parts) >= 3:
                mnt_point = parts[2]
                df_out = run_cmd(["df", "--output=avail", mnt_point])
                if df_out:
                    lines = [l.strip() for l in df_out.split("\n") if l.strip()]
                    if len(lines) >= 2:
                        try:
                            total_free += int(lines[-1]) / (1024**3)  # KB → GB
                        except ValueError:
                            pass
        health["nasAvailable"] = round(total_free, 1)
    except Exception:
        pass

    return health


def get_agent_states() -> list[dict]:
    """Read AgentOS registry and return agent state payloads for Mission Control."""
    registry = read_json(os.path.join(AGENTOS_ROOT, "Agents", "registry.json"))
    if not registry or "agents" not in registry:
        log("  AgentOS registry not found or invalid")
        return []

    agents = []
    for agent_id, info in registry["agents"].items():
        # Map AgentOS state → Mission Control status
        raw_state = info.get("state", "inactive")
        status_map = {
            "active": "online",
            "inactive": "offline",
            "idle": "idle",
        }
        status = status_map.get(raw_state, "offline")

        # Agent-specific emojis
        emoji_map = {
            "hermes": "🔺",
            "claude-code": "🟣",
            "opencode": "🟢",
            "grok-build": "⚡",
            "gemini-cli": "🔵",
        }
        emoji = emoji_map.get(agent_id, "🤖")

        agents.append({
            "id": agent_id,
            "name": info.get("name", agent_id),
            "emoji": emoji,
            "role": info.get("role", ""),
            "status": status,
            "tasksCompleted": 0,
            "totalCost": 0,
            "currentTask": info.get("current_projects", [None])[0] if info.get("current_projects") else None,
            "recentActivity": [],
        })

    return agents


def get_cron_stats() -> dict:
    """Read Hermes cron jobs.json and return counts."""
    cron_path = os.path.expanduser("~/.hermes/cron/jobs.json")
    jobs_data = read_json(cron_path)
    if not jobs_data:
        return {"total": 0, "failing": 0}

    if isinstance(jobs_data, dict):
        jobs = jobs_data.get("jobs", list(jobs_data.values()))
    else:
        jobs = jobs_data
    if isinstance(jobs, dict):
        jobs = list(jobs.values())

    total = len(jobs)
    failing = sum(
        1 for j in jobs
        if isinstance(j, dict) and j.get("enabled") and j.get("last_status") == "error"
    )
    return {"total": total, "failing": failing}


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    log("Mission Control Heartbeat Reporter starting")

    # Step 1: Collect host health
    log("  Collecting host health...")
    health = collect_host_health()
    log(f"    CPU: {health['cpuUsage']}%  GPU: {health['gpuTemp']}°C  RAM: {health['ramUsage']}%")
    log(f"    NAS: {'connected' if health['nasConnected'] else 'disconnected'} ({health['nasAvailable']} GB free)")

    if not DRY_RUN:
        result = post_json("/api/host/health", health)
        if result:
            log(f"    ✓ Host health reported: {result.get('host', {}).get('hostname', '?')}")
        else:
            log("    ✗ Failed to report host health")
    else:
        log(f"    [DRY RUN] Would POST: {json.dumps(health, indent=2)[:300]}")

    # Step 2: Report agent states from AgentOS
    log("  Reporting agent states...")
    agents = get_agent_states()
    log(f"    Found {len(agents)} agents in AgentOS registry")

    if agents:
        for agent in agents:
            if DRY_RUN:
                log(f"    [DRY RUN] Would POST agent {agent['id']}: {agent['name']} ({agent['status']})")
            else:
                result = post_json("/api/agents/state", agent)
                if result:
                    log(f"    ✓ {agent['name']} → {agent['status']}")
                else:
                    log(f"    ✗ Failed to report {agent['name']}")
    else:
        log("    No agents to report")

    # Step 3: Optional — write a local manifest for debugging
    manifest = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "host": health,
        "agent_count": len(agents),
        "agents": [a["id"] for a in agents],
    }

    manifest_path = os.path.join(os.path.dirname(__file__), "..", "data", "heartbeat-manifest.json")
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    log(f"  Manifest written to {manifest_path}")

    # Summary
    success = not DRY_RUN
    if success:
        log(f"✓ Complete — {len(agents)} agents, host health reported")
    else:
        log(f"✓ Dry run complete — no data sent to Mission Control")


if __name__ == "__main__":
    main()