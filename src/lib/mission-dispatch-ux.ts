/* agent: codex | model: gpt-5 | date: 2026-07-21 */
export type MissionExecutionMode = "AUTO" | "MANUAL";
export type DispatcherHealth = "up" | "down" | "unknown";

export function supportsAutomaticDispatch(agentId: string) {
  return agentId.trim().toLowerCase() === "hermes";
}

export function resolveMissionExecutionMode(
  agentId: string,
  requestedMode?: string | null,
): MissionExecutionMode {
  if (requestedMode && requestedMode !== "AUTO" && requestedMode !== "MANUAL") {
    throw new Error("executionMode must be AUTO or MANUAL");
  }
  if (!supportsAutomaticDispatch(agentId)) return "MANUAL";
  return requestedMode === "MANUAL" ? "MANUAL" : "AUTO";
}

export function missionQueueTimingLabel(
  mode: MissionExecutionMode,
  duration: string,
  isStalled: boolean,
) {
  if (mode === "MANUAL") return `Waiting for manual launch · ${duration}`;
  return `Queued for automatic dispatch · ${duration}${isStalled ? " · exceeds 45m warning threshold" : ""}`;
}

export function legacyWorkerNextRunLabel(
  enabled: boolean,
  nextRunAt: string | null,
  formatRelative: (value: string | null) => string,
) {
  return enabled ? formatRelative(nextRunAt) : "Disabled";
}

export function dispatcherStatusLabel(health: DispatcherHealth) {
  if (health === "up") return "Active";
  if (health === "down") return "Down";
  return "Status unavailable";
}
