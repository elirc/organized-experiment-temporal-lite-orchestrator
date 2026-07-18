/*
 * What this file does:
 * Returns detailed information for one workflow run, including steps and execution history.
 * What calls it:
 * src/hooks/use-runs.ts and src/components/runs/run-detail.tsx.
 * What it calls:
 * src/lib/api/route-helpers.ts and src/services/workflow-run-service.ts.
 * What a junior engineer would likely get wrong:
 * Bypassing the scoped repository read and accidentally exposing another user's run detail to viewers.
 */
import { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRequestUser } from "@/lib/api/route-helpers";
import { permissions } from "@/lib/auth/permissions";
import { getWorkflowRunDetail } from "@/services/workflow-run-service";

type Context = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireRequestUser(request, permissions.runsRead);
    const { runId } = await context.params;
    const run = await getWorkflowRunDetail(runId, user);

    return jsonOk(run);
  } catch (error) {
    return jsonError(error);
  }
}
