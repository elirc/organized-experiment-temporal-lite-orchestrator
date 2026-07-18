/*
 * What this file does:
 * Lists workflow definitions and creates new workflow versions.
 * What calls it:
 * src/hooks/use-workflows.ts and src/components/workflows/workflow-creator.tsx.
 * What it calls:
 * src/lib/api/route-helpers.ts, src/lib/validation/api-schemas.ts, and src/services/workflow-definition-service.ts.
 * What a junior engineer would likely get wrong:
 * Allowing workflow creation without a permission check because the UI already hides the form.
 */
import { NextRequest } from "next/server";

import { jsonError, jsonOk, requireRequestUser } from "@/lib/api/route-helpers";
import { permissions } from "@/lib/auth/permissions";
import { createWorkflowSchema } from "@/lib/validation/api-schemas";
import {
  createWorkflowDefinitionVersion,
  listDefinitions,
} from "@/services/workflow-definition-service";

export async function GET(request: NextRequest) {
  try {
    await requireRequestUser(request, permissions.workflowsRead);
    const definitions = await listDefinitions();

    return jsonOk(definitions);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request, permissions.workflowsWrite);
    const body = createWorkflowSchema.parse(await request.json());
    const created = await createWorkflowDefinitionVersion(user, body);

    return jsonOk(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
