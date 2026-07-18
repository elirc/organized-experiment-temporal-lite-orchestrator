/*
 * What this file does:
 * Owns workflow run reads and the API-facing start-run use case.
 * What calls it:
 * src/app/api/workflow-runs/route.ts and src/app/api/workflow-runs/[runId]/route.ts.
 * What it calls:
 * Repository functions for definitions and runs plus src/services/workflow-engine-service.ts.
 * What a junior engineer would likely get wrong:
 * Starting a run against mutable definition metadata instead of freezing it to an active version at start time.
 */
import type { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";

import { ApiError } from "@/lib/api/route-helpers";
import { db } from "@/lib/db";
import { workflowDefinitionSchema } from "@/lib/workflows/definition-schema";
import {
  findActiveWorkflowVersionForDefinition,
} from "@/repositories/workflow-definition-repository";
import {
  createWorkflowRun,
  findWorkflowRunById,
  findWorkflowRunByIdempotencyKey,
  listWorkflowRuns,
} from "@/repositories/workflow-run-repository";
import { seedRunExecution } from "@/services/workflow-engine-service";

export async function listRuns(user: User) {
  return listWorkflowRuns(user);
}

export async function getWorkflowRunDetail(runId: string, user: User) {
  const run = await findWorkflowRunById(runId, user);

  if (!run) {
    throw new ApiError(404, "Workflow run not found.");
  }

  return run;
}

export async function startWorkflowRun(
  user: User,
  input: {
    workflowDefinitionId: string;
    displayName: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
  },
) {
  const scopedIdempotencyKey = `${user.id}:${input.idempotencyKey}`;
  const existing = await findWorkflowRunByIdempotencyKey(scopedIdempotencyKey);

  if (existing) {
    return existing;
  }

  const activeVersion = await findActiveWorkflowVersionForDefinition(input.workflowDefinitionId);

  if (!activeVersion) {
    throw new ApiError(404, "No active workflow version found for this definition.");
  }

  const definition = workflowDefinitionSchema.parse(activeVersion.definition);

  const workflowRun = await db.$transaction(async (tx) => {
    return createWorkflowRun(tx, {
      workflowVersionId: activeVersion.id,
      startedById: user.id,
      displayName: input.displayName,
      idempotencyKey: scopedIdempotencyKey,
      input: input.input as Prisma.InputJsonValue,
      context: input.input as Prisma.InputJsonValue,
      status: "PENDING",
      currentStepKey: definition.initialStepKey,
    });
  });

  // ⚠️ SENIOR NOTE: The run is created before execution starts so a crash between creation and first-step scheduling still leaves a durable record to repair.
  await seedRunExecution({
    workflowRun,
    definition,
  });

  const createdRun = await findWorkflowRunById(workflowRun.id, user);

  if (!createdRun) {
    throw new ApiError(500, "Workflow run was created but could not be reloaded.");
  }

  return createdRun;
}
