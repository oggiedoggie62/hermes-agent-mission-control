/* agent: codex | model: gpt-5 | date: 2026-07-23 */
import { lstat } from "node:fs/promises";
import path from "node:path";

const DEBRIEF_DIRECTORY = "Logs/missions";
const DEBRIEF_EXTENSION = ".debrief.md";
const MAX_DEBRIEF_FILENAME_LENGTH = 120;

type PathExists = (absolutePath: string) => Promise<boolean>;

function cappedSlug(slug: string, reservedLength: number) {
  const maximumSlugLength = MAX_DEBRIEF_FILENAME_LENGTH
    - DEBRIEF_EXTENSION.length
    - reservedLength;
  return slug.slice(0, maximumSlugLength).replace(/-+$/g, "") || "mission";
}

export function slugifyMissionTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mission";
}

async function filesystemPathExists(absolutePath: string) {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function selectMissionDebriefPath(input: {
  title: string;
  executionId: string;
  agentosRoot: string;
  pathExists?: PathExists;
}) {
  const pathExists = input.pathExists ?? filesystemPathExists;
  const slug = slugifyMissionTitle(input.title);
  const firstFilename = `${cappedSlug(slug, 0)}${DEBRIEF_EXTENSION}`;
  const firstRelativePath = `${DEBRIEF_DIRECTORY}/${firstFilename}`;
  const firstAbsolutePath = path.join(input.agentosRoot, firstRelativePath);
  if (!(await pathExists(firstAbsolutePath))) {
    return {
      filename: firstFilename,
      debriefPath: firstRelativePath,
      absoluteDebriefPath: firstAbsolutePath,
    };
  }

  const safeExecutionId = input.executionId.toLowerCase().replace(/[^a-z0-9]/g, "") || "execution";
  const suffixLengths = [8, 12, 16, 20, 24, 28, safeExecutionId.length]
    .filter((length, index, values) => length <= safeExecutionId.length && values.indexOf(length) === index);

  for (const suffixLength of suffixLengths) {
    const suffix = `-${safeExecutionId.slice(0, suffixLength)}`;
    const filename = `${cappedSlug(slug, suffix.length)}${suffix}${DEBRIEF_EXTENSION}`;
    const debriefPath = `${DEBRIEF_DIRECTORY}/${filename}`;
    const absoluteDebriefPath = path.join(input.agentosRoot, debriefPath);
    if (!(await pathExists(absoluteDebriefPath))) {
      return { filename, debriefPath, absoluteDebriefPath };
    }
  }

  throw new Error("Could not allocate a unique debrief filename for this execution");
}

export const MISSION_DEBRIEF_FILENAME_LIMIT = MAX_DEBRIEF_FILENAME_LENGTH;
