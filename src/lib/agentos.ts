import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const AGENTOS_ROOT =
  process.env.AGENTOS_ROOT ?? "/home/oggie/AI/AgentOS";
const HERMES_CRON_JOBS =
  process.env.HERMES_CRON_JOBS ?? "/home/oggie/.hermes/cron/jobs.json";

// ---------------------------------------------------------------------------
// Path guard — every disk read goes through this one helper
// ---------------------------------------------------------------------------

/** Resolve `relPath` inside AGENTOS_ROOT and throw if it escapes. */
function safeResolve(relPath: string): string {
  const target = path.resolve(AGENTOS_ROOT, relPath);
  if (!target.startsWith(AGENTOS_ROOT + path.sep)) {
    throw new Error(
      `Path traversal blocked: ${relPath} resolves outside AGENTOS_ROOT`,
    );
  }
  return target;
}

/** Async read of a guarded path. Returns null on any error. */
async function safeRead<T>(
  relPath: string,
  parser: (raw: string) => T,
): Promise<T | null> {
  try {
    const full = safeResolve(relPath);
    const raw = await readFile(full, "utf-8");
    return parser(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentEntry {
  name: string;
  role: string;
  strengths: string[];
  weaknesses: string[];
  preferred_model: string | null;
  fallback_model: string | null;
  available_toolsets: string[];
  current_projects: string[];
  platforms: string[];
  permissions: Record<string, string>;
  state: string;
  last_active: string | null;
}

export interface AgentRegistry {
  version: number;
  last_updated: string;
  agents: Record<string, AgentEntry>;
}

export interface ProjectEntry {
  name: string;
  path: string;
  type: string;
  status: string;
  primary_agent: string;
  created: string;
  last_activity: string;
  description: string;
}

export interface ProjectIndex {
  version: number;
  last_updated: string;
  projects: ProjectEntry[];
}

export interface LedgerRow {
  project: string;
  type: string;
  contributors: string;
  created: string;
  lastUpdated: string;
  status: string;
  notes: string;
}

export interface LedgerResult {
  rows: LedgerRow[];
  skippedRows: number;
}

export interface QueueFile {
  version: number;
  last_updated: string;
  items: unknown[];
}

export interface CronJob {
  id: string;
  name: string;
  schedule?: { kind?: string; expr?: string; display?: string };
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  deliver: string | null;
}

export interface DeviceEntry {
  name: string;
  hostname: string;
  os: string;
  role: string;
  cpu: string | null;
  ram: string | null;
  gpu: string | null;
  local_ai: string[];
  tailscale_ip: string | null;
  hermes_profile: string | null;
  notes: string;
}

export interface DeviceRegistry {
  version: number;
  devices: DeviceEntry[];
}

export interface ServiceEntry {
  name: string;
  type: string;
  host: string | null;
  check_type: string;
  url: string | null;
  port: number | null;
  notes: string;
}

export interface ServiceRegistry {
  version: number;
  services: ServiceEntry[];
}

export interface DecisionFile {
  file: string;
  headings: string[];
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export async function getAgents(): Promise<AgentRegistry | null> {
  return safeRead("Agents/registry.json", (raw) => JSON.parse(raw));
}

export async function getProjectsIndex(): Promise<ProjectIndex | null> {
  return safeRead("Projects/index.json", (raw) => JSON.parse(raw));
}

export async function getProjectLedger(): Promise<LedgerResult | null> {
  return safeRead("Memory/project-ledger.md", parseLedgerMarkdown);
}

export async function getDecisions(
  limit?: number,
): Promise<DecisionFile[]> {
  const dir = path.join(AGENTOS_ROOT, "Memory", "decisions");
  let files: string[];
  try {
    files = (await readdir(dir)).filter(
      (f) => f.endsWith(".md") && !f.startsWith("index"),
    );
  } catch {
    return [];
  }
  // Sort newest-first by filename convention YYYY/MM/DD-decisions.md
  files.sort().reverse();
  if (limit && limit > 0) files = files.slice(0, limit);

  const results: DecisionFile[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const headings: string[] = [];
      for (const line of raw.split("\n")) {
        const m = line.match(/^#{2,3}\s+(.+)/);
        if (m) headings.push(m[1]!);
      }
      results.push({ file, headings });
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

export async function getQueues(): Promise<Record<string, QueueFile | null>> {
  const names = ["inbox", "active", "scheduled", "completed"];
  const result: Record<string, QueueFile | null> = {};
  for (const name of names) {
    result[name] = await safeRead(`Tasks/queues/${name}.json`, (raw) =>
      JSON.parse(raw),
    );
  }
  return result;
}

export async function getCronJobs(): Promise<CronJob[] | null> {
  try {
    const raw = await readFile(HERMES_CRON_JOBS, "utf-8");
    const parsed = JSON.parse(raw);
    // jobs.json wraps jobs in a nested structure — extract the array
    const jobs: CronJob[] = parsed.jobs ?? parsed ?? [];
    return jobs;
  } catch {
    return null;
  }
}

export async function getRegistryDevices(): Promise<DeviceRegistry | null> {
  return safeRead("Registry/devices.json", (raw) => JSON.parse(raw));
}

export async function getRegistryServices(): Promise<ServiceRegistry | null> {
  return safeRead("Registry/services.json", (raw) => JSON.parse(raw));
}

export async function getKnowledgeTree(): Promise<
  { path: string; isDir: boolean }[]
> {
  const root = path.join(AGENTOS_ROOT, "Knowledge");
  const results: { path: string; isDir: boolean }[] = [];
  try {
    await walkDir(root, "Knowledge", results);
  } catch {
    // return partial results
  }
  // Filter to markdown files and directories only
  return results.filter(
    (r) => r.path.endsWith(".md") || r.isDir,
  );
}

async function walkDir(
  dir: string,
  prefix: string,
  acc: { path: string; isDir: boolean }[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      acc.push({ path: rel, isDir: true });
      await walkDir(path.join(dir, entry.name), rel, acc);
    } else {
      acc.push({ path: rel, isDir: false });
    }
  }
}

export async function getDocFile(
  relPath: string,
): Promise<string | null> {
  if (!relPath.endsWith(".md")) return null;
  return safeRead(relPath, (raw) => raw);
}

// ---------------------------------------------------------------------------
// Graphify reader
// ---------------------------------------------------------------------------

export interface GraphifyMetadata {
  project: string;
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  lastUpdated: string;
  reportSummary: string;
  hasGraphHtml: boolean;
  hasGraphTreeHtml: boolean;
  graphPath: string;
}

export async function getGraphifyData(): Promise<GraphifyMetadata[]> {
  const ledger = await getProjectLedger();
  if (!ledger) return [];

  const results: GraphifyMetadata[] = [];

  for (const row of ledger.rows) {
    if (row.status !== "active") continue;

    // Resolve project path from Projects/index.json for full path
    const index = await getProjectsIndex();
    if (!index) continue;

    const entry = index.projects.find(
      (p) => p.name === row.project,
    );
    if (!entry) continue;

    // Resolve ~/ paths to absolute
    const resolvedPath = entry.path.startsWith("~")
      ? path.join(homeDir(), entry.path.slice(2))
      : entry.path;

    const graphDir = path.join(resolvedPath, "graphify-out");
    const graphJsonPath = path.join(graphDir, "graph.json");
    const reportPath = path.join(graphDir, "GRAPH_REPORT.md");
    const graphHtmlPath = path.join(graphDir, "graph.html");
    const graphTreeHtmlPath = path.join(graphDir, "GRAPH_TREE.html");

    if (!fs.existsSync(graphJsonPath)) continue;

    try {
      const raw = await readFile(graphJsonPath, "utf-8");
      const graph = JSON.parse(raw);
      const nodes = graph.nodes ?? [];
      const communities = new Set(nodes.map((n: any) => n.community).filter((c: any) => c !== undefined));

      // Count edges: nodes with community > 0 and edges array
      // Edges are implicit via hyperedges and community co-membership
      // Count explicit hyperedge connections
      const hyperedgeConnections = (graph.graph?.hyperedges ?? []).reduce(
        (sum: number, h: any) => sum + (h.nodes?.length ?? 0),
        0,
      );

      let reportSummary = "";
      try {
        const reportRaw = await readFile(reportPath, "utf-8");
        // Extract the summary line: "58 nodes · 22 edges · 39 communities"
        const summaryMatch = reportRaw.match(
          /(\d+)\s*nodes?\s*·\s*(\d+)\s*edges?\s*·\s*(\d+)\s*communities?/,
        );
        if (summaryMatch) {
          reportSummary = `${summaryMatch[1]} nodes · ${summaryMatch[2]} edges · ${summaryMatch[3]} communities`;
        }
        // Grab the first line of the Knowledge Gaps section as extra context
        const gapsMatch = reportRaw.match(/## Knowledge Gaps[\s\S]*?-\s*(.+)/);
        if (gapsMatch) {
          const gap = gapsMatch[1].trim();
          if (reportSummary) reportSummary += ` — ${gap}`;
        }
      } catch {
        // report file optional
      }

      const stats = await stat(graphJsonPath);
      const lastUpdated = stats.mtime.toISOString();

      results.push({
        project: row.project,
        nodeCount: nodes.length,
        edgeCount: hyperedgeConnections,
        communityCount: communities.size,
        lastUpdated,
        reportSummary,
        hasGraphHtml: fs.existsSync(graphHtmlPath),
        hasGraphTreeHtml: fs.existsSync(graphTreeHtmlPath),
        graphPath: graphDir,
      });
    } catch {
      // skip unreadable graphs
    }
  }

  return results;
}

function homeDir(): string {
  return process.env.HOME || "/home/oggie";
}

// ---------------------------------------------------------------------------
// Markdown ledger parser
// ---------------------------------------------------------------------------

function parseLedgerMarkdown(raw: string): LedgerResult {
  const lines = raw.split("\n");
  const rows: LedgerRow[] = [];
  let skippedRows = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, headers, and separator rows
    if (
      !trimmed.startsWith("|") ||
      trimmed.startsWith("| -") ||
      trimmed.startsWith("|-") ||
      trimmed.startsWith("| Project")
    ) {
      continue;
    }

    const cols = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cols.length < 7) {
      skippedRows++;
      continue;
    }

    rows.push({
      project: cols[0] ?? "",
      type: cols[1] ?? "",
      contributors: cols[2] ?? "",
      created: cols[3] ?? "",
      lastUpdated: cols[4] ?? "",
      status: cols[5] ?? "",
      notes: cols[6] ?? "",
    });
  }

  return { rows, skippedRows };
}
