/*
 * What this file does:
 * Encapsulates user lookups used by auth flows and actor hydration.
 * What calls it:
 * src/services/auth-service.ts.
 * What it calls:
 * src/lib/db.ts.
 * What a junior engineer would likely get wrong:
 * Reaching for the database directly from route handlers, which makes auth logic much harder to test and review.
 */
import { db } from "@/lib/db";

export async function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}
