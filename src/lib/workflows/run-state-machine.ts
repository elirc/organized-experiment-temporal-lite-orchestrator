/*
 * What this file does:
 * Defines the allowed status transitions for runs and steps so retries and approvals cannot move into impossible states.
 * What calls it:
 * src/services/workflow-run-service.ts and src/services/approval-service.ts.
 * What it calls:
 * Prisma enum types.
 * What a junior engineer would likely get wrong:
 * Updating status fields ad hoc in several services until invalid transitions become possible during retries or repairs.
 */
import type { RunStatus, StepRunStatus } from "@prisma/client";

const runTransitions: Record<RunStatus, RunStatus[]> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED"],
  WAITING_APPROVAL: ["RUNNING", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

const stepTransitions: Record<StepRunStatus, StepRunStatus[]> = {
  PENDING: ["QUEUED", "WAITING_APPROVAL", "SUCCEEDED", "SKIPPED"],
  QUEUED: ["RUNNING", "FAILED"],
  RUNNING: ["SUCCEEDED", "FAILED"],
  WAITING_APPROVAL: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: ["QUEUED"],
  SKIPPED: [],
};

export function assertValidRunTransition(from: RunStatus, to: RunStatus) {
  if (!runTransitions[from].includes(to)) {
    throw new Error(`Invalid run transition from ${from} to ${to}.`);
  }
}

export function assertValidStepTransition(from: StepRunStatus, to: StepRunStatus) {
  if (!stepTransitions[from].includes(to)) {
    throw new Error(`Invalid step transition from ${from} to ${to}.`);
  }
}
