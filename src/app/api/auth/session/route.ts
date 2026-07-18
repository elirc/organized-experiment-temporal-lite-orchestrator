/*
 * What this file does:
 * Returns the currently authenticated user for client bootstrapping.
 * What calls it:
 * src/hooks/use-session.ts.
 * What it calls:
 * src/lib/auth/session.ts.
 * What a junior engineer would likely get wrong:
 * Treating missing auth as an exception here instead of a normal "no session" response for the UI.
 */
import { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { getUserFromSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

    return jsonOk({
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
