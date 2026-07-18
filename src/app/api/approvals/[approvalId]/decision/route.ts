/*
 * What this file does:
 * Resolves a pending approval and advances the workflow to the correct next step.
 * What calls it:
 * src/hooks/use-approvals.ts and src/components/approvals/approval-queue.tsx.
 * What it calls:
 * src/lib/api/route-helpers.ts, src/lib/validation/api-schemas.ts, and src/services/approval-service.ts.
 * What a junior engineer would likely get wrong:
 * Accepting approval decisions without re-checking server-side role authorization.
 */
import { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRequestUser } from "@/lib/api/route-helpers";
import { permissions } from "@/lib/auth/permissions";
import { approvalDecisionSchema } from "@/lib/validation/api-schemas";
import { submitApprovalDecision } from "@/services/approval-service";

type Context = {
  params: Promise<{ approvalId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireRequestUser(request, permissions.approvalsDecide);
    const { approvalId } = await context.params;
    const body = approvalDecisionSchema.parse(await request.json());
    const result = await submitApprovalDecision(user, {
      approvalRequestId: approvalId,
      ...body,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
