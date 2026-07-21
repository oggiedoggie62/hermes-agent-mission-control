/* agent: codex | model: gpt-5 | date: 2026-07-15 */
import { randomUUID } from "crypto";
import { Prisma, type MissionExecution } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ClaimMissionOptions {
  workerId: string;
  executionId?: string;
  concurrencyLimit?: number;
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
 * A transaction-scoped PostgreSQL advisory lock serializes the shared active
 * count and SKIP LOCKED claim in this one statement. Multiple dispatcher
 * processes therefore cannot collectively exceed the configured limit.
 */
export async function claimNextMission({
  workerId,
  executionId = randomUUID(),
  concurrencyLimit = 1,
}: ClaimMissionOptions): Promise<ClaimedMission | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(concurrencyLimit) || concurrencyLimit < 1) {
    throw new Error("concurrencyLimit must be a positive integer");
  }

  const rows = await prisma.$transaction(async (tx) => {
    // Acquire this before the claim statement so a waiter receives a fresh
    // READ COMMITTED snapshot after the previous lock holder commits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260715, 1)`;
    return tx.$queryRaw<ClaimRow[]>(Prisma.sql`
    WITH capacity AS MATERIALIZED (
      SELECT COUNT(*)::integer AS active_count
      FROM "MissionExecution" e
      WHERE e.provider = 'HERMES'::"ExecutionProvider"
        AND e.mode = 'AUTO'::"ExecutionMode"
        AND e.status IN (
          'claimed'::"MissionExecutionStatus",
          'running'::"MissionExecutionStatus"
        )
    ), candidate AS (
      SELECT m.id
      FROM "Mission" m
      JOIN "MissionExecution" e
        ON e."missionId" = m.id
       AND e.status = 'queued'::"MissionExecutionStatus"
      CROSS JOIN capacity
      WHERE m.status = 'pending'
        AND m."isArchived" = false
        AND m."executionProvider" = 'HERMES'::"ExecutionProvider"
        AND m."executionMode" = 'AUTO'::"ExecutionMode"
        AND e.provider = 'HERMES'::"ExecutionProvider"
        AND e.mode = 'AUTO'::"ExecutionMode"
        AND capacity.active_count < ${concurrencyLimit}
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
  });

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
  outcome: {
    status: "completed" | "failed";
    error?: string | null;
    result?: string | null;
    debriefPath?: string | null;
  },
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
        result: outcome.result ?? undefined,
        debriefPath: outcome.debriefPath ?? undefined,
      },
    });
    return execution;
  });
}
