/*
 * What this file does:
 * Centralizes API request auth, permission enforcement, and consistent JSON error responses.
 * What calls it:
 * Route handlers under src/app/api/.../route.ts.
 * What it calls:
 * src/lib/auth/session.ts and src/lib/auth/permissions.ts.
 * What a junior engineer would likely get wrong:
 * Checking auth after parsing or mutating data, which increases attack surface and makes error behavior inconsistent.
 */
import { type NextRequest, NextResponse } from "next/server";

import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { getUserFromSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type RequestUser = Awaited<ReturnType<typeof requireRequestUser>>;

export async function requireRequestUser(request: NextRequest, permission?: Permission) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await getUserFromSessionToken(token);

  if (!user) {
    throw new ApiError(401, "Authentication required.");
  }

  if (permission && !hasPermission(user.role, permission)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }

  return user;
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { message: error.message, details: error.details ?? null } },
      { status: error.status },
    );
  }

  console.error(error);

  return NextResponse.json(
    { error: { message: "Internal server error.", details: null } },
    { status: 500 },
  );
}
