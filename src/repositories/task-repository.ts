/*
 * What this file does:
 * Encapsulates durable task queue persistence, including the SQL lease claim used by workers.
 * What calls it:
 * src/services/workflow-engine-service.ts and src/services/worker-service.ts.
 * What it calls:
 * src/lib/db.ts and Prisma transaction clients, plus one raw Postgres query for SKIP LOCKED leasing.
 * What a junior engineer would likely get wrong:
 * Claiming tasks with a read-then-write pattern, which lets two workers grab the same task under contention.
 */
import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";

export async function createWorkflowTask(
  tx: DbClient,
  data: {
    stepRunId: string;
    queue: string;
    handlerKey: string;
    availableAt: Date;
    payload: Prisma.InputJsonValue;
  },
) {
  return tx.workflowTask.create({
    data,
  });
}

type ClaimedTaskRow = {
  id: string;
  stepRunId: string;
  queue: string;
  handlerKey: string;
  status: string;
  availableAt: Date;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  lastError: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export async function claimNextAvailableTask(workerId: string, leaseMs: number) {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + leaseMs);

  // ⚠️ SENIOR NOTE: FOR UPDATE SKIP LOCKED is the concurrency boundary that prevents two workers from claiming the same durable task.
  const claimedRows = await db.$queryRaw<ClaimedTaskRow[]>`
    WITH candidate AS (
      SELECT id
      FROM "WorkflowTask"
      WHERE status = 'AVAILABLE'
        AND "availableAt" <= NOW()
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "WorkflowTask" task
    SET status = 'LEASED',
        "leaseOwner" = ${workerId},
        "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "updatedAt" = NOW()
    FROM candidate
    WHERE task.id = candidate.id
    RETURNING task.*;
  `;

  return claimedRows[0] ?? null;
}

export async function updateWorkflowTask(
  tx: DbClient,
  taskId: string,
  data: Prisma.WorkflowTaskUpdateInput,
) {
  return tx.workflowTask.update({
    where: { id: taskId },
    data,
  });
}

export async function findWorkflowTaskById(taskId: string) {
  return db.workflowTask.findUnique({
    where: { id: taskId },
    include: {
      stepRun: {
        include: {
          workflowRun: {
            include: {
              workflowVersion: {
                include: {
                  workflowDefinition: true,
                },
              },
            },
          },
        },
      },
    },
  });
}
