import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const AGENTOS_ROOT = process.env.AGENTOS_ROOT ?? "/home/oggie/AI/AgentOS";
const HOME = process.env.HOME ?? "/home/oggie";

/**
 * GET /api/files?path=<absolute-path-to-html>
 *
 * Serves local HTML files (graph.html, GRAPH_TREE.html) from the filesystem
 * with proper Content-Type. Only allows:
 *  - Files ending in .html
 *  - Paths that start with HOME (so they're within ~/)
 */
export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return new NextResponse("Missing path parameter", { status: 400 });
  }

  // Only allow .html files
  if (!filePath.endsWith(".html")) {
    return new NextResponse("Only .html files are allowed", { status: 403 });
  }

  // Path guard: must be under HOME
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(HOME)) {
    return new NextResponse("Access denied", { status: 403 });
  }

  try {
    const content = await readFile(resolved, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404 });
  }
}