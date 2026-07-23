/* agent: codex | model: gpt-5 | date: 2026-07-22 */
import { prisma } from "@/lib/prisma";
import { resolveMissionExecutionMode, type MissionExecutionMode } from "@/lib/mission-dispatch-ux";

export interface PendingMissionEditInput {
  title: unknown;
  description: unknown;
  agentId: unknown;
  priority: unknown;
  executionMode: unknown;
}

export class PendingMissionConflictError extends Error {}
export class PendingMissionValidationError extends Error {}

function validatedEdit(input: PendingMissionEditInput) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const agentId = typeof input.agentId === "string" ? input.agentId.trim() : "";
  const priority = typeof input.priority === "string" ? input.priority : "";
  const requestedMode = typeof input.executionMode === "string" ? input.executionMode : null;

  if (!title) throw new PendingMissionValidationError("Mission title is required");
  if (!agentId) throw new PendingMissionValidationError("Mission agent is required");
  if (!["low", "medium", "high"].includes(priority)) {
    throw new PendingMissionValidationError("Mission priority must be low, medium, or high");
  }

  let executionMode: MissionExecutionMode;
  try {
    executionMode = resolveMissionExecutionMode(agentId, requestedMode);
  } catch (error) {
    throw new PendingMissionValidationError(
      error instanceof Error ? error.message : "Invalid execution mode",
    );
  }

  return { title, description, agentId, priority, executionMode };
}

function isUnclaimedQueuedExecution(execution: {
  status: string;
  claimedAt: Date | null;
  startedAt: Date | null;
  executionId: string | null;
  workerId: string | null;
}) {
  return execution.status === "queued"
    && execution.claimedAt === null
    && execution.startedAt === null
    && execution.executionId === null
    && execution.workerId === null;
}

export async function editPendingMission(id: string, input: PendingMissionEditInput) {
  const edit = validatedEdit(input);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260715, 1)`;
    const candidate = await tx.mission.findUnique({
      where: { id },
      include: { executions: { orderBy: { attempt: "asc" } } },
    });
    const execution = candidate?.executions[0];
    if (
      !candidate
      || candidate.status !== "pending"
      || candidate.isArchived
      || candidate.executions.length !== 1
      || !execution
      || execution.provider !== candidate.executionProvider
      || execution.mode !== candidate.executionMode
      || !isUnclaimedQueuedExecution(execution)
    ) {
      throw new PendingMissionConflictError("Only pending, unclaimed missions can be edited");
    }

    const updatedMission = await tx.mission.updateMany({
      where: {
        id,
        status: "pending",
        isArchived: false,
        executionMode: candidate.executionMode,
      },
      data: edit,
    });
    if (updatedMission.count !== 1) {
      throw new PendingMissionConflictError("Mission changed before the edit could be saved");
    }

    const updatedExecution = await tx.missionExecution.updateMany({
      where: {
        id: execution.id,
        missionId: id,
        status: "queued",
        provider: candidate.executionProvider,
        mode: candidate.executionMode,
        claimedAt: null,
        startedAt: null,
        executionId: null,
        workerId: null,
      },
      data: { mode: edit.executionMode },
    });
    if (updatedExecution.count !== 1) {
      throw new PendingMissionConflictError("Mission was claimed before the edit could be saved");
    }

    return tx.mission.findUniqueOrThrow({
      where: { id },
      include: { executions: { orderBy: { attempt: "desc" }, take: 1 } },
    });
  });
}

export async function cancelPendingMission(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260715, 1)`;
    const candidate = await tx.mission.findUnique({
      where: { id },
      include: { executions: { orderBy: { attempt: "asc" } } },
    });
    const execution = candidate?.executions[0];
    if (
      !candidate
      || candidate.status !== "pending"
      || candidate.isArchived
      || candidate.executions.length !== 1
      || !execution
      || execution.provider !== candidate.executionProvider
      || execution.mode !== candidate.executionMode
      || !isUnclaimedQueuedExecution(execution)
    ) {
      throw new PendingMissionConflictError("Only pending, unclaimed missions can be cancelled");
    }

    const cancelledAt = new Date();
    const updatedExecution = await tx.missionExecution.updateMany({
      where: {
        id: execution.id,
        missionId: id,
        status: "queued",
        provider: candidate.executionProvider,
        mode: candidate.executionMode,
        claimedAt: null,
        startedAt: null,
        executionId: null,
        workerId: null,
      },
      data: {
        status: "cancelled",
        completedAt: cancelledAt,
      },
    });
    if (updatedExecution.count !== 1) {
      throw new PendingMissionConflictError("Mission was claimed before cancellation completed");
    }

    const updatedMission = await tx.mission.updateMany({
      where: {
        id,
        status: "pending",
        isArchived: false,
      },
      data: {
        status: "cancelled",
        completedAt: cancelledAt,
      },
    });
    if (updatedMission.count !== 1) {
      throw new PendingMissionConflictError("Mission changed before cancellation completed");
    }

    return tx.mission.findUniqueOrThrow({
      where: { id },
      include: { executions: { orderBy: { attempt: "desc" }, take: 1 } },
    });
  });
}
