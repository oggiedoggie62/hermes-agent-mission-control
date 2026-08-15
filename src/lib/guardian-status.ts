export const GUARDIAN_MAX_AGE_MS = 35 * 60 * 1000;
const GUARDIAN_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type GuardianAvailability = "available" | "missing" | "stale" | "invalid" | "error";

export interface GuardianRecovery {
  attempted: boolean;
  status: "not_needed" | "succeeded" | "failed" | "unavailable";
  message: string;
  method?: string;
  lanHost?: string;
  detail?: string;
}

export interface GuardianStatus {
  hostname: string;
  status: "online" | "partial" | "offline";
  lastProbed: string;
  summary: string;
  tailscale: "relay" | "no" | "unknown";
  recovery: GuardianRecovery;
}

export interface GuardianStatusResponse {
  availability: GuardianAvailability;
  authoritative: boolean;
  status: GuardianStatus | null;
  lastKnownStatus: GuardianStatus | null;
  updatedAt: string | null;
}

interface ParseOptions {
  now?: () => number;
  requireFresh?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBoundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function parseGuardianTimestamp(value: unknown): { value: string; timestamp: number } {
  const timestampValue = requireBoundedString(value, "lastProbed", 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestampValue)) {
    throw new Error("lastProbed must be an ISO 8601 timestamp");
  }
  const timestamp = Date.parse(timestampValue);
  if (!Number.isFinite(timestamp)) throw new Error("lastProbed is invalid");
  return { value: timestampValue, timestamp };
}

export function parseGuardianPayload(
  input: unknown,
  options: ParseOptions = {},
): GuardianStatus {
  if (!isRecord(input) || !isRecord(input.recovery)) {
    throw new Error("Invalid Guardian payload");
  }
  const hostname = requireBoundedString(input.hostname, "hostname", 128);
  const summary = requireBoundedString(input.summary, "summary", 1000);
  const { value: lastProbed, timestamp } = parseGuardianTimestamp(input.lastProbed);
  const now = (options.now ?? Date.now)();
  const age = now - timestamp;
  if (age < -GUARDIAN_FUTURE_SKEW_MS) throw new Error("Guardian payload is future-dated");
  if (options.requireFresh !== false && age > GUARDIAN_MAX_AGE_MS) {
    throw new Error("Guardian payload is stale");
  }
  if (!["online", "partial", "offline"].includes(String(input.status))) {
    throw new Error("Invalid Guardian status");
  }
  if (!["relay", "no", "unknown"].includes(String(input.tailscale))) {
    throw new Error("Invalid Guardian Tailscale state");
  }

  const recovery = input.recovery;
  if (typeof recovery.attempted !== "boolean"
    || !["not_needed", "succeeded", "failed", "unavailable"].includes(String(recovery.status))) {
    throw new Error("Invalid Guardian recovery state");
  }
  const optionalString = (value: unknown, label: string) => value === undefined
    ? undefined
    : requireBoundedString(value, label, 512);

  return {
    hostname,
    status: input.status as GuardianStatus["status"],
    lastProbed,
    summary,
    tailscale: input.tailscale as GuardianStatus["tailscale"],
    recovery: {
      attempted: recovery.attempted,
      status: recovery.status as GuardianRecovery["status"],
      message: requireBoundedString(recovery.message, "recovery.message", 1000),
      method: optionalString(recovery.method, "recovery.method"),
      lanHost: optionalString(recovery.lan_host, "recovery.lan_host"),
      detail: optionalString(recovery.detail, "recovery.detail"),
    },
  };
}

export function classifyGuardianRecord(
  record: { data: unknown; updatedAt: Date } | null,
  now: () => number = Date.now,
): GuardianStatusResponse {
  if (!record) {
    return {
      availability: "missing",
      authoritative: false,
      status: null,
      lastKnownStatus: null,
      updatedAt: null,
    };
  }
  const updatedAt = record.updatedAt.toISOString();
  try {
    const status = parseGuardianPayload(record.data, { now, requireFresh: false });
    const age = now() - Date.parse(status.lastProbed);
    if (age > GUARDIAN_MAX_AGE_MS) {
      return {
        availability: "stale",
        authoritative: false,
        status: null,
        lastKnownStatus: status,
        updatedAt,
      };
    }
    return {
      availability: "available",
      authoritative: true,
      status,
      lastKnownStatus: null,
      updatedAt,
    };
  } catch {
    return {
      availability: "invalid",
      authoritative: false,
      status: null,
      lastKnownStatus: null,
      updatedAt,
    };
  }
}

export function unavailableGuardianResponse(): GuardianStatusResponse {
  return {
    availability: "error",
    authoritative: false,
    status: null,
    lastKnownStatus: null,
    updatedAt: null,
  };
}
