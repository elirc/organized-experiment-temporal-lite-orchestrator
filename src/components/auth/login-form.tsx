"use client";

/*
 * What this file does:
 * Renders the credential login form and drives the login mutation.
 * What calls it:
 * src/app/login/page.tsx.
 * What it calls:
 * src/hooks/use-session.ts.
 * What a junior engineer would likely get wrong:
 * Pushing the router before the mutation settles, which creates confusing race conditions around auth state.
 */
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useLogin } from "@/hooks/use-session";

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await login.mutateAsync({ email, password });
      router.push("/dashboard");
      router.refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Login failed.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-ink/10 bg-white/80 p-8 shadow-panel backdrop-blur">
      <div>
        <p className="font-display text-3xl text-ink">Temporal-lite Control Room</p>
        <p className="mt-2 text-sm text-steel">
          Use one of the seeded accounts like <span className="font-medium">admin@example.com</span> or{" "}
          <span className="font-medium">approver@example.com</span>.
        </p>
      </div>

      <label className="block space-y-2 text-sm text-steel">
        <span>Email</span>
        <input
          className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink outline-none transition focus:border-signal"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="block space-y-2 text-sm text-steel">
        <span>Password</span>
        <input
          className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink outline-none transition focus:border-signal"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p className="rounded-2xl bg-signal/10 px-4 py-3 text-sm text-signal">{error}</p> : null}

      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {login.isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
