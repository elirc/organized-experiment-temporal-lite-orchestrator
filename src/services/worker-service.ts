/*
 * What this file does:
 * Claims durable tasks, invokes registered handlers, and feeds results back into the workflow engine.
 * What calls it:
 * src/worker/index.ts.
 * What it calls:
 * src/repositories/task-repository.ts, src/repositories/idempotency-repository.ts, and src/services/workflow-engine-service.ts.
 * What a junior engineer would likely get wrong:
 * Executing handlers directly from the HTTP process instead of isolating worker concerns behind a durable queue boundary.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  createIdempotencyRecord,
  findIdempotencyRecord,
} from "@/repositories/idempotency-repository";
import { claimNextAvailableTask, findWorkflowTaskById } from "@/repositories/task-repository";
import {
  completeTaskStep,
  failTaskStep,
  markTaskExecutionStarted,
} from "@/services/workflow-engine-service";
import type { RegisteredTaskHandler } from "@/worker/handlers";

type WorkerDependencies = {
  handlers: Record<string, RegisteredTaskHandler>;
  workerId: string;
  leaseMs?: number;
};

async function runIdempotentAction<T extends Prisma.InputJsonValue>(
  stepRunId: string,
  actionType: string,
  factory: () => Promise<T>,
) {
  const key = `${stepRunId}:${actionType}`;
  const existing = await findIdempotencyRecord(key);

  if (existing?.response) {
    return existing.response as T;
  }

  // ⚠️ SENIOR NOTE: This protects retries across worker restarts, but truly-external APIs still need their own idempotency keys on the remote side.
  const response = await factory();

  try {
    await db.$transaction(async (tx) => {
      await createIdempotencyRecord(tx, {
        key,
        stepRunId,
        actionType,
        response,
      });
    });
  } catch (error) {
    const recovered = await findIdempotencyRecord(key);

    if (recovered?.response) {
      return recovered.response as T;
    }

    throw error;
  }

  return response;
}

export async function processNextTask(deps: WorkerDependencies) {
  const claimedTask = await claimNextAvailableTask(deps.workerId, deps.leaseMs ?? 30_000);

  if (!claimedTask) {
    return { status: "idle" as const };
  }

  const hydratedTask = await findWorkflowTaskById(claimedTask.id);

  if (!hydratedTask) {
    return { status: "idle" as const };
  }

  const handler = deps.handlers[hydratedTask.handlerKey];

  if (!handler) {
    await failTaskStep({
      taskId: hydratedTask.id,
      workerId: deps.workerId,
      errorMessage: `No handler registered for ${hydratedTask.handlerKey}.`,
    });

    return { status: "failed" as const, taskId: hydratedTask.id };
  }

  await markTaskExecutionStarted(hydratedTask.id, deps.workerId);

  try {
    // The worker never mutates orchestration state directly from the handler; it hands structured output back to the engine service.
    const result = await handler({
      task: hydratedTask,
      run: hydratedTask.stepRun.workflowRun,
      stepRun: hydratedTask.stepRun,
      runOnce: (actionType, factory) => runIdempotentAction(hydratedTask.stepRun.id, actionType, factory),
    });

    await completeTaskStep({
      taskId: hydratedTask.id,
      workerId: deps.workerId,
      output: result.output,
      contextPatch: result.contextPatch,
    });

    return { status: "processed" as const, taskId: hydratedTask.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown worker error.";

    await failTaskStep({
      taskId: hydratedTask.id,
      workerId: deps.workerId,
      errorMessage,
    });

    return { status: "failed" as const, taskId: hydratedTask.id, errorMessage };
  }
}
