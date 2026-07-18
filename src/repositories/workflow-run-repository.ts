/*
 * What this file does:
 * Encapsulates workflow run, step, and event persistence with explicit visibility scoping for readers.
 * What calls it:
 * src/services/workflow-run-service.ts, src/services/workflow-engine-service.ts, and src/services/approval-service.ts.
 * What it calls:
 * src/lib/db.ts, src/lib/auth/permissions.ts, and Prisma transaction clients.
 * What a junior engineer would likely get wrong:
 * Forgetting to apply ownership scoping on read queries, which quietly leaks run data to low-privilege users.
 */
import type { ActorType, ExecutionEventType, Prisma, RunStatus, StepRunStatus, StepType, User } from "@prisma/client";

import { canReadAllRuns } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";

export function buildRunVisibilityWhere(user: Pick<User, "id" | "role">): Prisma.WorkflowRunWhereInput {
  if (canReadAllRuns(user.role)) {
    return {};
  }

  // ⚠️ SENIOR NOTE: VIEWER users only see runs they started; dropping this filter is a direct data leak.
  return { startedById: user.id };
}

export async function listWorkflowRuns(user: User) {
  return db.workflowRun.findMany({
    where: buildRunVisibilityWhere(user),
    orderBy: { createdAt: "desc" },
    include: {
      workflowVersion: {
        include: {
          workflowDefinition: true,
        },
      },
      startedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      approvals: {
        where: { status: "PENDING" },
        take: 1,
      },
    },
  });
}

export async function findWorkflowRunById(runId: string, user: User) {
  return db.workflowRun.findFirst({
    where: {
      id: runId,
      ...buildRunVisibilityWhere(user),
    },
    include: {
      workflowVersion: {
        include: {
          workflowDefinition: true,
        },
      },
      startedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      steps: {
        orderBy: { createdAt: "asc" },
        include: {
          task: true,
          approval: {
            include: {
              decisions: {
                include: {
                  actorUser: {
                    select: { id: true, name: true, email: true, role: true },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function findWorkflowRunByIdempotencyKey(idempotencyKey: string) {
  return db.workflowRun.findUnique({
    where: { idempotencyKey },
    include: {
      workflowVersion: {
        include: { workflowDefinition: true },
      },
      steps: true,
      approvals: true,
      events: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createWorkflowRun(
  tx: DbClient,
  data: {
    workflowVersionId: string;
    startedById: string;
    displayName: string;
    idempotencyKey: string;
    input: Prisma.InputJsonValue;
    context: Prisma.InputJsonValue;
    status: RunStatus;
    currentStepKey?: string | null;
  },
) {
  return tx.workflowRun.create({ data });
}

export async function updateWorkflowRun(
  tx: DbClient,
  workflowRunId: string,
  data: Prisma.WorkflowRunUpdateInput,
) {
  return tx.workflowRun.update({
    where: { id: workflowRunId },
    data,
  });
}

export async function findWorkflowRunAggregateById(workflowRunId: string) {
  return db.workflowRun.findUnique({
    where: { id: workflowRunId },
    include: {
      workflowVersion: {
        include: {
          workflowDefinition: true,
        },
      },
      steps: {
        include: {
          task: true,
          approval: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createWorkflowStepRun(
  tx: DbClient,
  data: {
    workflowRunId: string;
    stepKey: string;
    stepName: string;
    stepType: StepType;
    status: StepRunStatus;
    handlerKey?: string | null;
    conditionExpression?: string | null;
    attemptCount?: number;
    maxAttempts: number;
    backoffMs: number;
    idempotencyKey: string;
    input: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
    availableAt?: Date | null;
    workerId?: string | null;
  },
) {
  return tx.workflowStepRun.create({ data });
}

export async function updateWorkflowStepRun(
  tx: DbClient,
  stepRunId: string,
  data: Prisma.WorkflowStepRunUpdateInput,
) {
  return tx.workflowStepRun.update({
    where: { id: stepRunId },
    data,
  });
}

export async function findWorkflowStepRunById(stepRunId: string) {
  return db.workflowStepRun.findUnique({
    where: { id: stepRunId },
    include: {
      workflowRun: {
        include: {
          workflowVersion: {
            include: {
              workflowDefinition: true,
            },
          },
        },
      },
      task: true,
      approval: true,
    },
  });
}

export async function findWorkflowStepRunByRunAndKey(workflowRunId: string, stepKey: string) {
  return db.workflowStepRun.findUnique({
    where: {
      workflowRunId_stepKey: {
        workflowRunId,
        stepKey,
      },
    },
    include: {
      workflowRun: {
        include: {
          workflowVersion: true,
        },
      },
      task: true,
      approval: true,
    },
  });
}

export async function appendExecutionEvent(
  tx: DbClient,
  data: {
    workflowRunId: string;
    stepRunId?: string;
    actorType: ActorType;
    actorUserId?: string;
    eventType: ExecutionEventType;
    fromStatus?: string;
    toStatus?: string;
    message: string;
    payload?: Prisma.InputJsonValue;
  },
) {
  return tx.executionEvent.create({
    data,
  });
}
