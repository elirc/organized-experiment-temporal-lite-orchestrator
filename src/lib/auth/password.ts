/*
 * What this file does:
 * Wraps password hashing and password verification for local username/password auth.
 * What calls it:
 * src/app/api/auth/login/route.ts and prisma/seed.ts.
 * What it calls:
 * bcryptjs.
 * What a junior engineer would likely get wrong:
 * Comparing plain-text passwords directly or using a fast hash instead of a password hash.
 */
import bcrypt from "bcryptjs";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
