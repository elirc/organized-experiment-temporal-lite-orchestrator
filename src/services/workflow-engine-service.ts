/*
 * What this file does:
 * Owns workflow execution state transitions: creating steps, enqueuing tasks, handling conditions, approvals, retries, and terminal states.
 * What calls it:
 * src/services/workflow-run-service.ts, src/services/approval-service.ts, and src/services/worker-service.ts.
 * What it calls:
 * Repository functions for runs, steps, events, approvals, and tasks plus workflow validation helpers.
 * What a junior engineer would likely get wrong:
 * Mixing orchestration logic into handlers or routes until no one can tell which file is allowed to mutate run state.
 */
import type {
  ApprovalDecisionType,
  ApprovalStatus,
  Prisma,
  RunStatus,
  StepRunStatus,
  WorkflowRun,
  WorkflowStepRun,
} from "@prisma/client";

import { ApiError } from "@/lib/api/route-helpers";
import { db } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";
import { evaluateCondition } from "@/lib/workflows/expression";
import { calculateRetryDelayMs } from "@/lib/workflows/retry";
import { assertValidRunTransition, assertValidStepTransition } from "@/lib/workflows/run-state-machine";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@/lib/workflows/definition-schema";
import {
  createApprovalRequest,
  createApprovalDecision,
  findApprovalById,
  resolveApprovalRequest,
} from "@/repositories/approval-repository";
import {
  createWorkflowTask,
  findWorkflowTaskById,
  updateWorkflowTask,
} from "@/repositories/task-repository";
import {
  appendExecutionEvent,
  createWorkflowStepRun,
  findWorkflowRunAggregateById,
  updateWorkflowRun,
  updateWorkflowStepRun,
} from "@/repositories/workflow-run-repository";

function parseDefinition(definition: Prisma.JsonValue) {
  return workflowDefinitionSchema.parse(definition);
}

function findStep(definition: WorkflowDefinition, stepKey: string): WorkflowStep {
  const step = definition.steps.find((candidate) => candidate.key === stepKey);

  if (!step) {
    throw new Error(`Step ${stepKey} not found in workflow definition.`);
  }

  return step;
}

async function transitionRunStatus(
  tx: DbClient,
  workflowRun: WorkflowRun,
  toStatus: RunStatus,
  message: string,
  options?: { actorUserId?: string; payload?: Prisma.InputJsonValue; currentStepKey?: string | null },
) {
  if (workflowRun.status === toStatus) {
    if (typeof options?.currentStepKey !== "undefined") {
      return updateWorkflowRun(tx, workflowRun.id, {
        currentStepKey: options.currentStepKey,
      });
    }

    return workflowRun;
  }

  assertValidRunTransition(workflowRun.status, toStatus);

  const updatedRun = await updateWorkflowRun(tx, workflowRun.id, {
    status: toStatus,
    currentStepKey: options?.currentStepKey,
  });

  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    actorType: options?.actorUserId ? "USER" : "SYSTEM",
    actorUserId: options?.actorUserId,
    eventType: "RUN_STATUS_CHANGED",
    fromStatus: workflowRun.status,
    toStatus,
    message,
    payload: options?.payload,
  });

  return updatedRun;
}

async function transitionStepStatus(
  tx: DbClient,
  stepRun: WorkflowStepRun,
  toStatus: StepRunStatus,
  message: string,
  options?: {
    actorUserId?: string;
    payload?: Prisma.InputJsonValue;
    updates?: Prisma.WorkflowStepRunUpdateInput;
  },
) {
  if (stepRun.status !== toStatus) {
    assertValidStepTransition(stepRun.status, toStatus);
  }

  const updatedStep = await updateWorkflowStepRun(tx, stepRun.id, {
    status: toStatus,
    ...options?.updates,
  });

  await appendExecutionEvent(tx, {
    workflowRunId: stepRun.workflowRunId,
    stepRunId: stepRun.id,
    actorType: options?.actorUserId ? "USER" : "SYSTEM",
    actorUserId: options?.actorUserId,
    eventType: "STEP_STATUS_CHANGED",
    fromStatus: stepRun.status,
    toStatus,
    message,
    payload: options?.payload,
  });

  return updatedStep;
}

async function completeRun(tx: DbClient, workflowRun: WorkflowRun, payload?: Prisma.InputJsonValue) {
  const updatedRun = await transitionRunStatus(tx, workflowRun, "SUCCEEDED", "Workflow run completed.", {
    currentStepKey: null,
    payload,
  });

  return updateWorkflowRun(tx, updatedRun.id, {
    completedAt: new Date(),
    output: payload,
  });
}

async function failRun(
  tx: DbClient,
  workflowRun: WorkflowRun,
  stepRunId: string,
  errorMessage: string,
) {
  const updatedRun = await transitionRunStatus(tx, workflowRun, "FAILED", "Workflow run failed.", {
    payload: { errorMessage, stepRunId },
  });

  return updateWorkflowRun(tx, updatedRun.id, {
    completedAt: new Date(),
    lastError: errorMessage,
  });
}

async function createTaskStep(tx: DbClient, workflowRun: WorkflowRun, step: Extract<WorkflowStep, { type: "API_CALL" | "JOB" }>) {
  const stepRun = await createWorkflowStepRun(tx, {
    workflowRunId: workflowRun.id,
    stepKey: step.key,
    stepName: step.name,
    stepType: step.type,
    status: "QUEUED",
    handlerKey: step.handlerKey,
    maxAttempts: step.retry.maxAttempts,
    backoffMs: step.retry.initialDelayMs,
    idempotencyKey: `${workflowRun.id}:${step.key}`,
    input: workflowRun.context as Prisma.InputJsonValue,
    metadata: {
      queue: step.queue,
      next: step.next,
    },
    availableAt: new Date(),
  });

  // A step row exists separately from the task row so operators can inspect execution history even after the queue item is gone.
  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    actorType: "SYSTEM",
    eventType: "STEP_CREATED",
    message: `Created step ${step.key}.`,
  });

  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    actorType: "SYSTEM",
    eventType: "TASK_ENQUEUED",
    fromStatus: "PENDING",
    toStatus: "QUEUED",
    message: `Enqueued ${step.type.toLowerCase()} step ${step.key}.`,
  });

  await createWorkflowTask(tx, {
    stepRunId: stepRun.id,
    queue: step.queue,
    handlerKey: step.handlerKey,
    availableAt: new Date(),
    payload: {
      workflowRunId: workflowRun.id,
      stepRunId: stepRun.id,
      handlerKey: step.handlerKey,
    },
  });

  await transitionRunStatus(tx, workflowRun, "RUNNING", `Workflow advanced to ${step.key}.`, {
    currentStepKey: step.key,
  });

  return stepRun;
}

async function createApprovalStep(tx: DbClient, workflowRun: WorkflowRun, step: Extract<WorkflowStep, { type: "APPROVAL" }>) {
  const stepRun = await createWorkflowStepRun(tx, {
    workflowRunId: workflowRun.id,
    stepKey: step.key,
    stepName: step.name,
    stepType: step.type,
    status: "WAITING_APPROVAL",
    maxAttempts: 1,
    backoffMs: 0,
    idempotencyKey: `${workflowRun.id}:${step.key}`,
    input: workflowRun.context as Prisma.InputJsonValue,
    metadata: {
      next: step.next,
    },
  });

  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    actorType: "SYSTEM",
    eventType: "STEP_CREATED",
    message: `Created approval step ${step.key}.`,
  });

  await createApprovalRequest(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    requiredRole: step.approvalRole,
  });

  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    actorType: "SYSTEM",
    eventType: "APPROVAL_REQUESTED",
    fromStatus: "PENDING",
    toStatus: "WAITING_APPROVAL",
    message: `Approval requested for step ${step.key}.`,
  });

  await transitionRunStatus(tx, workflowRun, "WAITING_APPROVAL", `Workflow is waiting on approval for ${step.key}.`, {
    currentStepKey: step.key,
  });

  return stepRun;
}

async function createConditionStep(
  tx: DbClient,
  workflowRun: WorkflowRun,
  definition: WorkflowDefinition,
  step: Extract<WorkflowStep, { type: "CONDITION" }>,
) {
  const matched = evaluateCondition(step.condition, {
    input: workflowRun.input as Record<string, unknown>,
    context: workflowRun.context as Record<string, unknown>,
  });

  const stepRun = await createWorkflowStepRun(tx, {
    workflowRunId: workflowRun.id,
    stepKey: step.key,
    stepName: step.name,
    stepType: step.type,
    status: "SUCCEEDED",
    conditionExpression: JSON.stringify(step.condition),
    maxAttempts: 1,
    backoffMs: 0,
    idempotencyKey: `${workflowRun.id}:${step.key}`,
    input: workflowRun.context as Prisma.InputJsonValue,
    metadata: {
      branches: step.branches,
    },
  });

  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    actorType: "SYSTEM",
    eventType: "STEP_CREATED",
    message: `Created condition step ${step.key}.`,
  });

  await appendExecutionEvent(tx, {
    workflowRunId: workflowRun.id,
    stepRunId: stepRun.id,
    actorType: "SYSTEM",
    eventType: "STEP_STATUS_CHANGED",
    fromStatus: "PENDING",
    toStatus: "SUCCEEDED",
    message: `Condition ${step.key} evaluated to ${matched}.`,
    payload: {
      matched,
      condition: step.condition,
    },
  });

  const branch = step.branches.find((candidate) => candidate.match === matched);

  if (!branch) {
    throw new Error(`Condition step ${step.key} did not resolve a next branch.`);
  }

  if (!branch.nextStepKey) {
    await completeRun(tx, workflowRun, workflowRun.context as Prisma.InputJsonValue);
    return stepRun;
  }

  const refreshedRun = await updateWorkflowRun(tx, workflowRun.id, {
    currentStepKey: step.key,
  });

  await createNextExecutableStep(tx, refreshedRun, definition, branch.nextStepKey);

  return stepRun;
}

async function createNextExecutableStep(
  tx: DbClient,
  workflowRun: WorkflowRun,
  definition: WorkflowDefinition,
  stepKey: string | null,
) {
  if (!stepKey) {
    await completeRun(tx, workflowRun, workflowRun.context as Prisma.InputJsonValue);
    return null;
  }

  const step = findStep(definition, stepKey);

  switch (step.type) {
    case "API_CALL":
    case "JOB":
      return createTaskStep(tx, workflowRun, step);
    case "APPROVAL":
      return createApprovalStep(tx, workflowRun, step);
    case "CONDITION":
      return createConditionStep(tx, workflowRun, definition, step);
  }
}

export async function seedRunExecution(params: {
  workflowRun: WorkflowRun;
  definition: WorkflowDefinition;
}) {
  return db.$transaction(async (tx) => {
    await appendExecutionEvent(tx, {
      workflowRunId: params.workflowRun.id,
      actorType: "USER",
      actorUserId: params.workflowRun.startedById,
      eventType: "RUN_CREATED",
      toStatus: params.workflowRun.status,
      message: "Workflow run created.",
      payload: {
        currentStepKey: params.definition.initialStepKey,
      },
    });

    return createNextExecutableStep(tx, params.workflowRun, params.definition, params.definition.initialStepKey);
  });
}

export async function markTaskExecutionStarted(taskId: string, workerId: string) {
  const task = await findWorkflowTaskById(taskId);

  if (!task) {
    throw new ApiError(404, "Task not found.");
  }

  return db.$transaction(async (tx) => {
    await updateWorkflowTask(tx, task.id, {
      attemptCount: { increment: 1 },
    });

    const stepRun = await transitionStepStatus(tx, task.stepRun, "RUNNING", `Worker ${workerId} started the task.`, {
      updates: {
        attemptCount: { increment: 1 },
        workerId,
        availableAt: null,
        leaseExpiresAt: task.leaseExpiresAt,
      },
      payload: {
        workerId,
        taskId: task.id,
      },
    });

    await appendExecutionEvent(tx, {
      workflowRunId: task.stepRun.workflowRunId,
      stepRunId: task.stepRun.id,
      actorType: "WORKER",
      eventType: "TASK_LEASED",
      message: `Worker ${workerId} leased task ${task.id}.`,
      payload: {
        taskId: task.id,
        workerId,
        leaseExpiresAt: task.leaseExpiresAt?.toISOString(),
      },
    });

    return {
      task: {
        ...task,
        attemptCount: task.attemptCount + 1,
      },
      stepRun,
    };
  });
}

export async function completeTaskStep(params: {
  taskId: string;
  workerId: string;
  output: Prisma.InputJsonValue;
  contextPatch?: Record<string, unknown>;
}) {
  const task = await findWorkflowTaskById(params.taskId);

  if (!task) {
    throw new ApiError(404, "Task not found.");
  }

  const definition = parseDefinition(task.stepRun.workflowRun.workflowVersion.definition as Prisma.JsonValue);
  const step = findStep(definition, task.stepRun.stepKey);

  if (step.type !== "API_CALL" && step.type !== "JOB") {
    throw new Error(`Task completion called for non-task step ${task.stepRun.stepKey}.`);
  }

  return db.$transaction(async (tx) => {
    const refreshed = await findWorkflowRunAggregateById(task.stepRun.workflowRunId);

    if (!refreshed) {
      throw new ApiError(404, "Workflow run not found.");
    }

    const currentStep = refreshed.steps.find((candidate) => candidate.id === task.stepRun.id);

    if (!currentStep) {
      throw new ApiError(404, "Workflow step not found.");
    }

    const mergedContext = {
      ...(refreshed.context as Record<string, unknown>),
      ...(params.contextPatch ?? {}),
    };

    // ⚠️ SENIOR NOTE: Context is merged only after the step succeeds so failed attempts cannot partially mutate downstream workflow state.
    await updateWorkflowTask(tx, task.id, {
      status: "COMPLETED",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });

    await transitionStepStatus(tx, currentStep, "SUCCEEDED", `Worker ${params.workerId} completed the step.`, {
      updates: {
        output: params.output,
        metadata: {
          ...(currentStep.metadata as Record<string, unknown> | null),
          completedByWorkerId: params.workerId,
        },
        completedAt: new Date(),
        workerId: null,
        leaseExpiresAt: null,
      },
      payload: params.output,
    });

    const updatedRun = await updateWorkflowRun(tx, refreshed.id, {
      context: mergedContext as Prisma.InputJsonValue,
      lastError: null,
    });

    await createNextExecutableStep(tx, updatedRun, definition, step.next.onSuccess);

    return updatedRun;
  });
}

export async function failTaskStep(params: {
  taskId: string;
  workerId: string;
  errorMessage: string;
}) {
  const task = await findWorkflowTaskById(params.taskId);

  if (!task) {
    throw new ApiError(404, "Task not found.");
  }

  return db.$transaction(async (tx) => {
    const refreshedRun = await findWorkflowRunAggregateById(task.stepRun.workflowRunId);

    if (!refreshedRun) {
      throw new ApiError(404, "Workflow run not found.");
    }

    const currentStep = refreshedRun.steps.find((candidate) => candidate.id === task.stepRun.id);

    if (!currentStep) {
      throw new ApiError(404, "Workflow step not found.");
    }

    const failedStep = await transitionStepStatus(tx, currentStep, "FAILED", `Worker ${params.workerId} failed the step.`, {
      updates: {
        lastError: params.errorMessage,
        workerId: null,
        leaseExpiresAt: null,
      },
      payload: {
        errorMessage: params.errorMessage,
        workerId: params.workerId,
      },
    });

    const shouldRetry = failedStep.attemptCount < failedStep.maxAttempts;

    if (!shouldRetry) {
      await updateWorkflowTask(tx, task.id, {
        status: "FAILED",
        lastError: params.errorMessage,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
      });

      return failRun(tx, refreshedRun, currentStep.id, params.errorMessage);
    }

    const nextAttemptAt = new Date(
      Date.now() + calculateRetryDelayMs(failedStep.backoffMs || 1_000, failedStep.attemptCount),
    );

    // We preserve the same step row across retries so operators can see attemptCount, lastError, and eventual outcome on one durable record.
    await updateWorkflowTask(tx, task.id, {
      status: "AVAILABLE",
      availableAt: nextAttemptAt,
      lastError: params.errorMessage,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });

    await transitionStepStatus(tx, failedStep, "QUEUED", `Retry scheduled for ${currentStep.stepKey}.`, {
      updates: {
        availableAt: nextAttemptAt,
      },
      payload: {
        nextAttemptAt: nextAttemptAt.toISOString(),
      },
    });

    await updateWorkflowRun(tx, refreshedRun.id, {
      lastError: params.errorMessage,
      nextWakeAt: nextAttemptAt,
      currentStepKey: currentStep.stepKey,
    });

    await appendExecutionEvent(tx, {
      workflowRunId: refreshedRun.id,
      stepRunId: currentStep.id,
      actorType: "WORKER",
      eventType: "TASK_RETRIED",
      message: `Retry scheduled for ${currentStep.stepKey}.`,
      payload: {
        errorMessage: params.errorMessage,
        nextAttemptAt: nextAttemptAt.toISOString(),
      },
    });

    return refreshedRun;
  });
}

export async function resolveApprovalStep(params: {
  approvalRequestId: string;
  actorUserId: string;
  decision: ApprovalDecisionType;
  comment?: string;
}) {
  const approval = await findApprovalById(params.approvalRequestId);

  if (!approval) {
    throw new ApiError(404, "Approval request not found.");
  }

  if (approval.status !== "PENDING") {
    throw new ApiError(409, "Approval request has already been resolved.");
  }

  const definition = parseDefinition(approval.workflowRun.workflowVersion.definition as Prisma.JsonValue);
  const step = findStep(definition, approval.stepRun.stepKey);

  if (step.type !== "APPROVAL") {
    throw new Error(`Approval resolution called for non-approval step ${approval.stepRun.stepKey}.`);
  }

  return db.$transaction(async (tx) => {
    const refreshedRun = await findWorkflowRunAggregateById(approval.workflowRun.id);

    if (!refreshedRun) {
      throw new ApiError(404, "Workflow run not found.");
    }

    const currentStep = refreshedRun.steps.find((candidate) => candidate.id === approval.stepRun.id);

    if (!currentStep) {
      throw new ApiError(404, "Workflow step not found.");
    }

    const approvalStatus: ApprovalStatus = params.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const nextStepKey = params.decision === "APPROVE" ? step.next.onApprove : step.next.onReject;

    await resolveApprovalRequest(tx, approval.id, {
      status: approvalStatus,
      resolvedAt: new Date(),
      resolutionNote: params.comment,
    });

    await createApprovalDecision(tx, {
      approvalRequestId: approval.id,
      actorUserId: params.actorUserId,
      decision: params.decision,
      comment: params.comment,
    });

    await appendExecutionEvent(tx, {
      workflowRunId: refreshedRun.id,
      stepRunId: currentStep.id,
      actorType: "USER",
      actorUserId: params.actorUserId,
      eventType: "APPROVAL_DECIDED",
      message: `Approval ${params.decision.toLowerCase()}d for ${currentStep.stepKey}.`,
      payload: {
        comment: params.comment ?? null,
      },
    });

    await transitionStepStatus(tx, currentStep, "SUCCEEDED", `Approval resolved with ${params.decision}.`, {
      actorUserId: params.actorUserId,
      updates: {
        output: {
          decision: params.decision,
          comment: params.comment ?? null,
        },
        completedAt: new Date(),
      },
    });

    const updatedRun = await transitionRunStatus(
      tx,
      refreshedRun,
      "RUNNING",
      `Approval step ${currentStep.stepKey} resolved.`,
      {
        actorUserId: params.actorUserId,
        currentStepKey: currentStep.stepKey,
      },
    );

    await createNextExecutableStep(tx, updatedRun, definition, nextStepKey);

    return updatedRun;
  });
}
