/*
 * What this file does:
 * Owns the login flow by verifying credentials and issuing durable sessions.
 * What calls it:
 * src/app/api/auth/login/route.ts.
 * What it calls:
 * src/repositories/user-repository.ts, src/lib/auth/password.ts, and src/lib/auth/session.ts.
 * What a junior engineer would likely get wrong:
 * Returning different error messages for "unknown email" vs "wrong password," which leaks account existence.
 */
import { ApiError } from "@/lib/api/route-helpers";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { findUserByEmail } from "@/repositories/user-repository";

export async function loginUser(email: string, password: string) {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const session = await createSession(user.id);

  return { user, session };
}
