/*
 * What this file does:
 * Lists approval requests visible to the current approver.
 * What calls it:
 * src/hooks/use-approvals.ts.
 * What it calls:
 * src/lib/api/route-helpers.ts and src/services/approval-service.ts.
 * What a junior engineer would likely get wrong:
 * Forgetting that approval visibility is itself privileged data and should not be exposed to viewers/operators.
 */
import { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRequestUser } from "@/lib/api/route-helpers";
import { permissions } from "@/lib/auth/permissions";
import { listApprovals } from "@/services/approval-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireRequestUser(request, permissions.approvalsDecide);
    const approvals = await listApprovals(user);

    return jsonOk(approvals);
  } catch (error) {
    return jsonError(error);
  }
}
