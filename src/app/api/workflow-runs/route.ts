/*
 * What this file does:
 * Lists workflow runs and starts new runs from an active workflow version.
 * What calls it:
 * src/hooks/use-runs.ts and src/components/runs/run-launcher.tsx.
 * What it calls:
 * src/lib/api/route-helpers.ts, src/lib/validation/api-schemas.ts, and src/services/workflow-run-service.ts.
 * What a junior engineer would likely get wrong:
 * Starting runs against the latest definition without checking which version is marked active.
 */
import { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRequestUser } from "@/lib/api/route-helpers";
import { permissions } from "@/lib/auth/permissions";
import { startWorkflowRunSchema } from "@/lib/validation/api-schemas";
import { listRuns, startWorkflowRun } from "@/services/workflow-run-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireRequestUser(request, permissions.runsRead);
    const runs = await listRuns(user);

    return jsonOk(runs);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request, permissions.runsStart);
    const body = startWorkflowRunSchema.parse(await request.json());
    const run = await startWorkflowRun(user, body);

    return jsonOk(run, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
