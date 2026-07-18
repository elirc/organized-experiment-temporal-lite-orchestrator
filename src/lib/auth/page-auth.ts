/*
 * What this file does:
 * Guards server-rendered app pages by requiring an authenticated session before rendering.
 * What calls it:
 * src/app/page.tsx and src/app/(app)/layout.tsx.
 * What it calls:
 * src/lib/auth/session.ts and Next.js redirect().
 * What a junior engineer would likely get wrong:
 * Trusting client-side redirects alone, which still lets protected data be rendered on the server first.
 */
import { redirect } from "next/navigation";

import { getPageSessionUser } from "@/lib/auth/session";

export async function requirePageUser() {
  const user = await getPageSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
