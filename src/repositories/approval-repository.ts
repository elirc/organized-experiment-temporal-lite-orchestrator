/*
 * What this file does:
 * Owns persistence for approval requests and approval decisions.
 * What calls it:
 * src/services/approval-service.ts and src/services/workflow-engine-service.ts.
 * What it calls:
 * src/lib/db.ts and Prisma transaction clients.
 * What a junior engineer would likely get wrong:
 * Updating only the approval record and forgetting the paired step/run state that must move with it.
 */
import type { ApprovalDecisionType, Prisma, User } from "@prisma/client";

import { db } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";

export async function listPendingApprovals(user: User) {
  const where =
    user.role === "ADMIN"
      ? { status: "PENDING" as const }
      : { status: "PENDING" as const, requiredRole: user.role };

  return db.approvalRequest.findMany({
    where,
    orderBy: { requestedAt: "asc" },
    include: {
      workflowRun: {
        include: {
          workflowVersion: {
            include: {
              workflowDefinition: true,
            },
          },
          startedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
      stepRun: true,
    },
  });
}

export async function findApprovalById(id: string) {
  return db.approvalRequest.findUnique({
    where: { id },
    include: {
      workflowRun: {
        include: {
          workflowVersion: true,
        },
      },
      stepRun: true,
      decisions: {
        include: {
          actorUser: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createApprovalRequest(
  tx: DbClient,
  data: {
    workflowRunId: string;
    stepRunId: string;
    requiredRole: "ADMIN" | "APPROVER";
  },
) {
  // ⚠️ SENIOR NOTE: Approval rows are their own aggregate because human waits can outlive leases, deployments, and even separate worker processes.
  return tx.approvalRequest.create({ data });
}

export async function resolveApprovalRequest(
  tx: DbClient,
  approvalRequestId: string,
  data: Prisma.ApprovalRequestUpdateInput,
) {
  return tx.approvalRequest.update({
    where: { id: approvalRequestId },
    data,
  });
}

export async function createApprovalDecision(
  tx: DbClient,
  data: {
    approvalRequestId: string;
    actorUserId: string;
    decision: ApprovalDecisionType;
    comment?: string;
  },
) {
  return tx.approvalDecision.create({ data });
}
