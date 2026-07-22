/* agent: codex | model: gpt-5 | date: 2026-07-21 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import { beginCaptureEdit, cancelCaptureEdit, saveCaptureEdit } from "../src/lib/capture-edit";

const testDatabaseUrl = process.env.DISPATCHER_TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error("DISPATCHER_TEST_DATABASE_URL is required");
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!databaseName.endsWith("_test")) throw new Error("Idea edit tests require a database ending in _test");
if (process.env.DATABASE_URL === testDatabaseUrl) throw new Error("Test database must differ from the normal DATABASE_URL");
process.env.DATABASE_URL = testDatabaseUrl;

const prismaBin = path.resolve("node_modules/.bin/prisma");
const schemaSync = spawnSync(prismaBin, ["db", "push", "--skip-generate"], {
  cwd: process.cwd(), env: process.env, encoding: "utf8",
});
if (schemaSync.status !== 0) throw new Error(schemaSync.stderr || schemaSync.stdout);

const marker = `idea-edit-${Date.now()}`;
const createdAt = new Date("2026-01-01T00:00:00.000Z");

async function patchIdea(id: string, body: Record<string, unknown>) {
  const { PATCH } = await import("../src/app/api/ideas/[id]/route");
  const response = await PATCH(new NextRequest(`http://localhost/api/ideas/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) };
}

async function routeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input), "http://localhost");
  const id = url.pathname.split("/").pop() ?? "";
  const { PATCH } = await import("../src/app/api/ideas/[id]/route");
  return PATCH(new NextRequest(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body as BodyInit | null | undefined,
  }), { params: Promise.resolve({ id }) });
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const createdIds: string[] = [];
  try {
    const idea = await prisma.idea.create({
      data: {
        title: `${marker}-idea`, description: "idea description", category: "uncategorized",
        source: "test", type: "idea", status: "pending", timestamp: createdAt, updatedAt: createdAt,
      },
    });
    const todo = await prisma.idea.create({
      data: { title: `${marker}-todo`, type: "todo", status: "pending", timestamp: createdAt, updatedAt: createdAt },
    });
    const promoted = await prisma.idea.create({
      data: { title: `${marker}-promoted`, type: "todo", status: "promoted", timestamp: createdAt, updatedAt: createdAt },
    });
    createdIds.push(idea.id, todo.id, promoted.id);

    const firstState = { ...beginCaptureEdit(idea.id, "  Edited Idea  "), draft: "  Edited Idea  " };
    const firstEdit = await saveCaptureEdit(firstState, {
      ...idea, updatedAt: idea.updatedAt.toISOString(), timestamp: idea.timestamp.toISOString(),
    }, routeRequest);
    assert(firstEdit.capture);
    assert.equal(firstEdit.capture.id, idea.id);
    assert.equal(firstEdit.capture.type, "idea");
    assert.equal(firstEdit.capture.status, "pending");
    assert.equal(firstEdit.capture.description, "idea description");
    assert.equal(firstEdit.capture.category, "uncategorized");
    assert.equal(firstEdit.capture.source, "test");
    assert.equal(firstEdit.capture.title, "Edited Idea");
    assert.equal(new Date(String(firstEdit.capture.timestamp)).toISOString(), createdAt.toISOString());
    assert(new Date(firstEdit.capture.updatedAt).getTime() > createdAt.getTime());
    console.log("PASS first edit with current updatedAt succeeds and advances the version");

    const staleDraft = beginCaptureEdit(idea.id, "Stale client draft");
    const staleEdit = await saveCaptureEdit(staleDraft, {
      ...idea, updatedAt: idea.updatedAt.toISOString(), timestamp: idea.timestamp.toISOString(),
    }, routeRequest);
    assert.equal(staleEdit.capture, null);
    assert.equal(staleEdit.state.draft, "Stale client draft");
    assert.equal(staleEdit.state.editingId, idea.id);
    assert.match(staleEdit.state.error ?? "", /changed elsewhere/);
    assert.equal((await prisma.idea.findUniqueOrThrow({ where: { id: idea.id } })).title, "Edited Idea");
    console.log("PASS stale HTTP save returns conflict, preserves draft/error, and does not overwrite persisted value");

    const freshRetry = await saveCaptureEdit(staleEdit.state, firstEdit.capture, routeRequest);
    assert(freshRetry.capture);
    assert.equal(freshRetry.capture.title, "Stale client draft");
    console.log("PASS fresh retry with latest updatedAt succeeds");

    const editedTodo = await patchIdea(todo.id, {
      action: "edit", title: "Edited To-Do", expectedUpdatedAt: todo.updatedAt.toISOString(),
    });
    assert.equal(editedTodo.status, 200);
    assert.equal(editedTodo.body.id, todo.id);
    assert.equal(editedTodo.body.type, "todo");
    assert.equal(editedTodo.body.title, "Edited To-Do");
    console.log("PASS Idea and To-Do text edit in place with ID/type/state/created timestamp preserved");

    const unsavedEdit = beginCaptureEdit(todo.id, "Unsaved replacement text");
    assert.equal(unsavedEdit.draft, "Unsaved replacement text");
    const cancelState = cancelCaptureEdit();
    const cancelRow = await prisma.idea.findUniqueOrThrow({ where: { id: todo.id } });
    assert.equal(cancelState.editingId, null);
    assert.equal(cancelRow.title, "Edited To-Do");
    console.log("PASS Cancel leaves persisted record unchanged");

    const currentIdea = await prisma.idea.findUniqueOrThrow({ where: { id: idea.id } });
    const blank = await patchIdea(idea.id, {
      action: "edit", title: "   ", expectedUpdatedAt: currentIdea.updatedAt.toISOString(),
    });
    assert.equal(blank.status, 400);
    assert.equal((await prisma.idea.findUniqueOrThrow({ where: { id: idea.id } })).title, "Stale client draft");
    console.log("PASS blank edit rejected without persistence");

    const promotedEdit = await patchIdea(promoted.id, {
      action: "edit", title: "Must not change", expectedUpdatedAt: promoted.updatedAt.toISOString(),
    });
    assert.equal(promotedEdit.status, 409);
    assert.equal((await prisma.idea.findUniqueOrThrow({ where: { id: promoted.id } })).title, `${marker}-promoted`);
    console.log("PASS promoted record is not editable");
  } finally {
    await prisma.idea.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
