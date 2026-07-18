/*
 * What this file does:
 * Persists idempotency records so task handlers can safely reuse a prior side-effect result across retries.
 * What calls it:
 * src/services/worker-service.ts.
 * What it calls:
 * src/lib/db.ts.
 * What a junior engineer would likely get wrong:
 * Treating retry deduplication as an in-memory cache, which fails the moment the worker restarts.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";

export async function findIdempotencyRecord(key: string) {
  return db.idempotencyRecord.findUnique({
    where: { key },
  });
}

export async function createIdempotencyRecord(
  tx: DbClient,
  data: {
    key: string;
    stepRunId: string;
    actionType: string;
    response?: Prisma.InputJsonValue;
  },
) {
  return tx.idempotencyRecord.create({ data });
}
