/*
 * What this file does:
 * Returns one workflow definition and its versions for the monitoring UI.
 * What calls it:
 * src/hooks/use-workflows.ts.
 * What it calls:
 * src/lib/api/route-helpers.ts and src/services/workflow-definition-service.ts.
 * What a junior engineer would likely get wrong:
 * Returning 200 with null instead of a proper 404, which makes the client logic ambiguous.
 */
import { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk, requireRequestUser } from "@/lib/api/route-helpers";
import { permissions } from "@/lib/auth/permissions";
import { getWorkflowDefinitionDetail } from "@/services/workflow-definition-service";

type Context = {
  params: Promise<{ workflowId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireRequestUser(request, permissions.workflowsRead);
    const { workflowId } = await context.params;
    const definition = await getWorkflowDefinitionDetail(workflowId);

    if (!definition) {
      throw new ApiError(404, "Workflow definition not found.");
    }

    return jsonOk(definition);
  } catch (error) {
    return jsonError(error);
  }
}
