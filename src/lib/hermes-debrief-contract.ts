/* agent: codex | model: gpt-5 | date: 2026-07-22 */

const REQUIRED_DEBRIEF_SECTIONS = [
  "Summary",
  "Work Performed",
  "Evidence",
  "Decisions Made",
] as const;

const DIAGNOSTIC_EXCERPT_LIMIT = 2_000;
const SENSITIVE_ENV_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL)/i;
const CONNECTION_ENV_KEY = /(?:_URL|_URI|_DSN|CONNECTION_STRING)$/i;

interface MissionPromptInput {
  missionId: string;
  executionId: string;
  title: string;
  priority: string;
  description: string;
  absoluteDebriefPath: string;
}

interface CompletionAcknowledgementInput {
  missionId: string;
  executionId: string;
  absoluteDebriefPath: string;
}

interface CompletedAcknowledgementInput extends CompletionAcknowledgementInput {
  resultSummary: string;
}

const MAX_RESULT_SUMMARY_LENGTH = 500;

export function completionAcknowledgement(input: CompletedAcknowledgementInput) {
  return [
    "MISSION CONTROL COMPLETION",
    `Mission ID: ${input.missionId}`,
    `Execution ID: ${input.executionId}`,
    `Debrief Path: ${input.absoluteDebriefPath}`,
    "Debrief Written: yes",
    `Result Summary: ${input.resultSummary}`,
  ].join("\n");
}

export function buildHermesMissionPrompt(input: MissionPromptInput) {
  return [
    "You are a temporary Hermes execution for one claimed Mission Control mission.",
    `Mission ID: ${input.missionId}`,
    `Execution ID: ${input.executionId}`,
    `Title: ${input.title}`,
    `Priority: ${input.priority}`,
    `Description: ${input.description}`,
    "",
    "Complete only this mission.",
    "",
    "MANDATORY DEBRIEF CONTRACT:",
    `1. You MUST write the debrief to this exact absolute path: ${input.absoluteDebriefPath}`,
    "2. The debrief MUST be non-empty Markdown containing these exact level-two headings, each with non-empty content:",
    ...REQUIRED_DEBRIEF_SECTIONS.map((section) => `   - ## ${section}`),
    `3. Before returning, you MUST verify that the exact file ${input.absoluteDebriefPath} exists and is readable.`,
    "4. You MUST NOT report success until the debrief has been written and verified.",
    "5. Mission Control independently reads and validates the exact file. A stdout claim alone never completes the mission.",
    "",
    "After the work, debrief write, and file verification succeed, return exactly this concise acknowledgement and no other stdout text:",
    "MISSION CONTROL COMPLETION",
    `Mission ID: ${input.missionId}`,
    `Execution ID: ${input.executionId}`,
    `Debrief Path: ${input.absoluteDebriefPath}`,
    "Debrief Written: yes",
    "Result Summary: <concise non-empty single-line outcome summary>",
  ].join("\n");
}

export function validateDebrief(content: string) {
  for (const section of REQUIRED_DEBRIEF_SECTIONS) {
    const pattern = new RegExp(`^##\\s+${section}\\s*$`, "m");
    if (!pattern.test(content)) return `Debrief is missing required section: ${section}`;
    const body = content.match(
      new RegExp(`^##\\s+${section}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "m"),
    )?.[1].trim();
    if (!body) return `Debrief section is empty: ${section}`;
  }
  return null;
}

export function validateCompletionAcknowledgement(
  stdout: string,
  input: CompletionAcknowledgementInput,
) {
  if (!stdout.trim()) {
    return {
      error: "Hermes exited successfully but returned no completion acknowledgement",
      resultSummary: null,
    };
  }
  const lines = stdout.trim().split(/\r?\n/);
  const fixedLines = [
    "MISSION CONTROL COMPLETION",
    `Mission ID: ${input.missionId}`,
    `Execution ID: ${input.executionId}`,
    `Debrief Path: ${input.absoluteDebriefPath}`,
    "Debrief Written: yes",
  ];
  if (
    lines.length !== 6
    || fixedLines.some((line, index) => lines[index] !== line)
    || !lines[5].startsWith("Result Summary:")
  ) {
    return {
      error: "Hermes completion acknowledgement was missing, malformed, or did not match the claimed mission, execution, and exact debrief path",
      resultSummary: null,
    };
  }
  const resultSummary = lines[5].slice("Result Summary:".length).trim();
  if (!resultSummary || resultSummary.length > MAX_RESULT_SUMMARY_LENGTH) {
    return {
      error: `Hermes completion acknowledgement result summary must contain 1-${MAX_RESULT_SUMMARY_LENGTH} characters on one line`,
      resultSummary: null,
    };
  }
  return { error: null, resultSummary };
}

function redactUriUserInfo(value: string) {
  return value.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s?#@]+@)/gi,
    "$1[REDACTED]@",
  );
}

function redactDiagnostics(value: string, environment: NodeJS.ProcessEnv) {
  let redacted = value;
  for (const [key, secret] of Object.entries(environment)) {
    if (!secret || secret.length < 4) continue;
    if (CONNECTION_ENV_KEY.test(key)) {
      const sanitizedConnection = redactUriUserInfo(secret);
      if (sanitizedConnection !== secret) {
        redacted = redacted.split(secret).join(sanitizedConnection);
      }
    } else if (SENSITIVE_ENV_KEY.test(key)) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }
  return redactUriUserInfo(redacted)
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(api[_-]?key|token|password|secret|credential)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    );
}

function diagnosticExcerpt(label: "stdout" | "stderr", value: string, environment: NodeJS.ProcessEnv) {
  const normalized = redactDiagnostics(value, environment)
    .replace(/\u0000/g, "")
    .trim();
  const excerpt = normalized.length > DIAGNOSTIC_EXCERPT_LIMIT
    ? `${normalized.slice(0, DIAGNOSTIC_EXCERPT_LIMIT)}…[truncated]`
    : normalized || "<empty>";
  return `${label} excerpt (${Math.min(normalized.length, DIAGNOSTIC_EXCERPT_LIMIT)}/${normalized.length} chars): ${excerpt}`;
}

export function executionContractFailure(
  errors: string[],
  stdout: string,
  stderr: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return [
    errors.join("; "),
    diagnosticExcerpt("stdout", stdout, environment),
    diagnosticExcerpt("stderr", stderr, environment),
  ].join("\n");
}

export const HERMES_DIAGNOSTIC_EXCERPT_LIMIT = DIAGNOSTIC_EXCERPT_LIMIT;
