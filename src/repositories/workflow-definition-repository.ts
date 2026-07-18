/*
 * What this file does:
 * Owns persistence operations for workflow definitions and versioned workflow JSON.
 * What calls it:
 * src/services/workflow-definition-service.ts and src/services/workflow-run-service.ts.
 * What it calls:
 * src/lib/db.ts and Prisma transaction clients.
 * What a junior engineer would likely get wrong:
 * Updating the definition row in place instead of versioning workflow JSON, which destroys traceability for old runs.
 */
import { VersionStatus, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";

export async function listWorkflowDefinitions() {
  return db.workflowDefinition.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function findWorkflowDefinitionById(id: string) {
  return db.workflowDefinition.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });
}

export async function findWorkflowDefinitionByKey(key: string, client: DbClient = db) {
  return client.workflowDefinition.findUnique({
    where: { key },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });
}

export async function findActiveWorkflowVersionForDefinition(workflowDefinitionId: string) {
  return db.workflowVersion.findFirst({
    where: {
      workflowDefinitionId,
      status: VersionStatus.ACTIVE,
    },
    orderBy: { versionNumber: "desc" },
  });
}

export async function createWorkflowDefinition(tx: DbClient, data: {
  key: string;
  name: string;
  description?: string;
}) {
  return tx.workflowDefinition.create({ data });
}

export async function updateWorkflowDefinitionMetadata(
  tx: DbClient,
  workflowDefinitionId: string,
  data: { name: string; description?: string; latestVersionNumber: number },
) {
  return tx.workflowDefinition.update({
    where: { id: workflowDefinitionId },
    data,
  });
}

export async function retireWorkflowVersions(tx: DbClient, workflowDefinitionId: string) {
  // ⚠️ SENIOR NOTE: We retire, rather than overwrite, the active version so old runs keep a stable execution contract.
  return tx.workflowVersion.updateMany({
    where: {
      workflowDefinitionId,
      status: VersionStatus.ACTIVE,
    },
    data: {
      status: VersionStatus.RETIRED,
    },
  });
}

export async function createWorkflowVersion(
  tx: DbClient,
  data: {
    workflowDefinitionId: string;
    versionNumber: number;
    definition: Prisma.InputJsonValue;
    createdById: string;
  },
) {
  return tx.workflowVersion.create({
    data: {
      ...data,
      status: VersionStatus.ACTIVE,
    },
  });
}
