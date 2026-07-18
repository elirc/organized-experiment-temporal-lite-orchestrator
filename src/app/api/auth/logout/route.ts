/*
 * What this file does:
 * Destroys the current session and clears the browser cookie.
 * What calls it:
 * src/components/auth/logout-button.tsx via src/hooks/use-session.ts.
 * What it calls:
 * src/lib/auth/session.ts.
 * What a junior engineer would likely get wrong:
 * Clearing the cookie without deleting the database session, which leaves a stolen token usable until expiry.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  buildExpiredSessionCookie,
  destroySession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { jsonError } from "@/lib/api/route-helpers";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      await destroySession(token);
    }

    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set(buildExpiredSessionCookie());

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
