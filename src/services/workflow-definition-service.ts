/*
 * What this file does:
 * Validates and versions workflow definitions before they are persisted.
 * What calls it:
 * src/app/api/workflows/route.ts.
 * What it calls:
 * src/lib/workflows/definition-schema.ts and src/repositories/workflow-definition-repository.ts.
 * What a junior engineer would likely get wrong:
 * Letting route handlers construct versions directly, which makes versioning rules inconsistent over time.
 */
import type { User } from "@prisma/client";

import { db } from "@/lib/db";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/lib/workflows/definition-schema";
import {
  createWorkflowDefinition,
  createWorkflowVersion,
  findWorkflowDefinitionById,
  findWorkflowDefinitionByKey,
  listWorkflowDefinitions,
  retireWorkflowVersions,
  updateWorkflowDefinitionMetadata,
} from "@/repositories/workflow-definition-repository";

export async function listDefinitions() {
  return listWorkflowDefinitions();
}

export async function getWorkflowDefinitionDetail(workflowDefinitionId: string) {
  return findWorkflowDefinitionById(workflowDefinitionId);
}

export async function createWorkflowDefinitionVersion(
  user: User,
  input: {
    key: string;
    name: string;
    description?: string;
    definition: WorkflowDefinition;
  },
) {
  const parsedDefinition = workflowDefinitionSchema.parse(input.definition);

  return db.$transaction(async (tx) => {
    const existing = await findWorkflowDefinitionByKey(input.key, tx);

    if (!existing) {
      const definition = await createWorkflowDefinition(tx, {
        key: input.key,
        name: input.name,
        description: input.description,
      });

      const version = await createWorkflowVersion(tx, {
        workflowDefinitionId: definition.id,
        versionNumber: 1,
        definition: parsedDefinition,
        createdById: user.id,
      });

      return { definition, version };
    }

    const nextVersionNumber = existing.latestVersionNumber + 1;

    // ⚠️ SENIOR NOTE: Retiring the prior active version preserves old run history while making the new definition active for future starts.
    await retireWorkflowVersions(tx, existing.id);
    // We update the parent metadata in the same transaction so the list page cannot briefly point at an out-of-sync latestVersionNumber.
    await updateWorkflowDefinitionMetadata(tx, existing.id, {
      name: input.name,
      description: input.description,
      latestVersionNumber: nextVersionNumber,
    });

    const version = await createWorkflowVersion(tx, {
      workflowDefinitionId: existing.id,
      versionNumber: nextVersionNumber,
      definition: parsedDefinition,
      createdById: user.id,
    });

    return { definition: existing, version };
  });
}
