/*
 * What this file does:
 * Handles credential login requests and issues the session cookie.
 * What calls it:
 * src/components/auth/login-form.tsx via src/hooks/use-session.ts.
 * What it calls:
 * src/lib/validation/api-schemas.ts, src/services/auth-service.ts, and src/lib/auth/session.ts.
 * What a junior engineer would likely get wrong:
 * Returning the full user row, including sensitive fields, after login succeeds.
 */
import { NextRequest, NextResponse } from "next/server";

import { buildSessionCookie } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/route-helpers";
import { loginSchema } from "@/lib/validation/api-schemas";
import { loginUser } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const { user, session } = await loginUser(body.email, body.password);
    const response = NextResponse.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });

    response.cookies.set(buildSessionCookie(session.expiresAt, session.rawToken));

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
