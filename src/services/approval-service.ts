/*
 * What this file does:
 * Owns approval list/read access and delegates approval resolution into the workflow engine.
 * What calls it:
 * src/app/api/approvals/route.ts and src/app/api/approvals/[approvalId]/decision/route.ts.
 * What it calls:
 * src/repositories/approval-repository.ts and src/services/workflow-engine-service.ts.
 * What a junior engineer would likely get wrong:
 * Letting the UI decide who may approve instead of enforcing the rule in a server-side service.
 */
import type { User } from "@prisma/client";

import { ApiError } from "@/lib/api/route-helpers";
import { listPendingApprovals } from "@/repositories/approval-repository";
import { resolveApprovalStep } from "@/services/workflow-engine-service";

export async function listApprovals(user: User) {
  return listPendingApprovals(user);
}

export async function submitApprovalDecision(
  user: User,
  input: {
    approvalRequestId: string;
    decision: "APPROVE" | "REJECT";
    comment?: string;
  },
) {
  if (user.role !== "APPROVER" && user.role !== "ADMIN") {
    throw new ApiError(403, "Only approvers can resolve workflow approvals.");
  }

  // ⚠️ SENIOR NOTE: Approval authorization is enforced again here even though the UI is role-aware, because clients are never trusted security boundaries.
  return resolveApprovalStep({
    approvalRequestId: input.approvalRequestId,
    actorUserId: user.id,
    decision: input.decision,
    comment: input.comment,
  });
}
