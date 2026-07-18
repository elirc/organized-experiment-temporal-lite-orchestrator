/*
 * What this file does:
 * Creates, reads, and destroys durable database-backed sessions carried in an HTTP-only cookie.
 * What calls it:
 * src/app/api/auth/login/route.ts, src/app/api/auth/logout/route.ts, src/app/(app)/layout.tsx, and src/lib/api/route-helpers.ts.
 * What it calls:
 * src/lib/db.ts for persistence and Node's crypto utilities for opaque session tokens.
 * What a junior engineer would likely get wrong:
 * Trusting cookie contents directly instead of resolving the session against the database and its expiration time.
 */
import { createHash, randomBytes } from "node:crypto";

import type { User } from "@prisma/client";
import { cookies } from "next/headers";

import { db } from "@/lib/db";

export const SESSION_COOKIE_NAME = "tl_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // ⚠️ SENIOR NOTE: The browser only gets the opaque raw token; the database stores the hash so a DB read alone is not enough to replay sessions.
  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function destroySession(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await db.session.deleteMany({ where: { tokenHash } });
}

export async function getUserFromSessionToken(rawToken?: string | null): Promise<User | null> {
  if (!rawToken) {
    return null;
  }

  const session = await db.session.findFirst({
    where: {
      tokenHash: hashToken(rawToken),
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // We update lastSeenAt on the server so session activity is observable without trusting any client timestamps.
  await db.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session.user;
}

export async function getPageSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  return getUserFromSessionToken(token);
}

export function buildSessionCookie(expiresAt: Date, value: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    },
  };
}

export function buildExpiredSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
    },
  };
}
