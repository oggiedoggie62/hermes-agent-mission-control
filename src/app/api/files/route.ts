import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const AGENTOS_ROOT = process.env.AGENTOS_ROOT ?? "/home/oggie/AI/AgentOS";
const HOME = process.env.HOME ?? "/home/oggie";

/**
 * GET /api/files?path=<absolute-path-to-file>
 *
 * Serves local files from the filesystem with proper Content-Type.
 * Allows:
 *  - .html files (graph.html, GRAPH_TREE.html)
 *  - .md files (documentation, decisions)
 *  - Paths that start with HOME (path guard)
 */
export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return new NextResponse("Missing path parameter", { status: 400 });
  }

  // Only allow .html and .md files
  if (!filePath.endsWith(".html") && !filePath.endsWith(".md")) {
    return new NextResponse("Only .html and .md files are allowed", { status: 403 });
  }

  // Path guard: must be under HOME
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(HOME)) {
    return new NextResponse("Access denied", { status: 403 });
  }

  // Determine content type
  const contentType = filePath.endsWith(".md")
    ? "text/markdown; charset=utf-8"
    : "text/html; charset=utf-8";

  try {
    const content = await readFile(resolved, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404 });
  }
}