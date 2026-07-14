/* agent: codex | model: gpt-5 | date: 2026-07-14 */
import { randomUUID } from "crypto";
import { Prisma, type MissionExecution } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ClaimMissionOptions {
  workerId: string;
  executionId?: string;
}

export interface ClaimedMission {
  missionId: string;
  execution: MissionExecution;
}

interface ClaimRow {
  missionId: string;
  executionJson: Prisma.JsonValue;
}

/**
 * Atomically claims one explicit AUTO execution.
 *
 * PostgreSQL locks one eligible Mission row with SKIP LOCKED, then updates its
 * queued execution and legacy Mission status in the same statement. Concurrent
 * callers therefore cannot receive the same mission.
 */
export async function claimNextMission({
  workerId,
  executionId = randomUUID(),
}: ClaimMissionOptions): Promise<ClaimedMission | null> {
  if (!workerId.trim()) throw new Error("workerId is required");

  const rows = await prisma.$queryRaw<ClaimRow[]>(Prisma.sql`
    WITH candidate AS (
      SELECT m.id
      FROM "Mission" m
      JOIN "MissionExecution" e
        ON e."missionId" = m.id
       AND e.status = 'queued'::"MissionExecutionStatus"
      WHERE m.status = 'pending'
        AND m."isArchived" = false
        AND m."executionProvider" = 'HERMES'::"ExecutionProvider"
        AND m."executionMode" = 'AUTO'::"ExecutionMode"
        AND e.provider = 'HERMES'::"ExecutionProvider"
        AND e.mode = 'AUTO'::"ExecutionMode"
      ORDER BY
        CASE m.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        m."createdAt" ASC
      FOR UPDATE OF m SKIP LOCKED
      LIMIT 1
    ), claimed_execution AS (
      UPDATE "MissionExecution" e
      SET status = 'claimed'::"MissionExecutionStatus",
          "claimedAt" = NOW(),
          "heartbeatAt" = NOW(),
          "executionId" = ${executionId},
          "workerId" = ${workerId},
          "updatedAt" = NOW()
      FROM candidate c
      WHERE e."missionId" = c.id
        AND e.status = 'queued'::"MissionExecutionStatus"
      RETURNING e.*
    ), updated_mission AS (
      UPDATE "Mission" m
      SET status = 'active'
      FROM claimed_execution e
      WHERE m.id = e."missionId"
      RETURNING m.id
    )
    SELECT m.id AS "missionId", to_jsonb(e) AS "executionJson"
    FROM updated_mission m
    JOIN claimed_execution e ON e."missionId" = m.id
  `);

  const row = rows[0];
  if (!row) return null;

  return {
    missionId: row.missionId,
    execution: row.executionJson as unknown as MissionExecution,
  };
}

export async function markExecutionRunning(executionId: string) {
  return prisma.missionExecution.update({
    where: { executionId },
    data: {
      status: "running",
      startedAt: new Date(),
      heartbeatAt: new Date(),
    },
  });
}

export async function recordExecutionActivity(executionId: string) {
  return prisma.missionExecution.update({
    where: { executionId },
    data: { heartbeatAt: new Date() },
  });
}

export async function finishExecution(
  executionId: string,
  outcome: { status: "completed" | "failed"; error?: string | null },
) {
  const completedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const execution = await tx.missionExecution.update({
      where: { executionId },
      data: {
        status: outcome.status,
        heartbeatAt: completedAt,
        completedAt,
        error: outcome.error ?? null,
      },
    });
    await tx.mission.update({
      where: { id: execution.missionId },
      data: {
        status: outcome.status,
        completedAt,
      },
    });
    return execution;
  });
}
