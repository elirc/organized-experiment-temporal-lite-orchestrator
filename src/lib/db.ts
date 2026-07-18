/*
 * What this file does:
 * Creates the shared Prisma client used by repositories and auth/session code.
 * What calls it:
 * Repository files in src/repositories/* and auth helpers in src/lib/auth/session.ts.
 * What it calls:
 * PrismaClient from @prisma/client.
 * What a junior engineer would likely get wrong:
 * Instantiating a new PrismaClient per request, which causes noisy connection churn in development.
 */
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const db =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = db;
}
