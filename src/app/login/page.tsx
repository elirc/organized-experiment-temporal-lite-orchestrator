import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getPageSessionUser } from "@/lib/auth/session";

export default async function LoginPage() {
  const user = await getPageSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-[2.5rem] border border-ink/10 bg-white/70 p-10 shadow-panel backdrop-blur lg:block">
          <p className="text-sm uppercase tracking-[0.3em] text-steel">Flowkeeper</p>
          <h1 className="mt-4 font-display text-6xl leading-tight text-ink">
            Durable orchestration for workflows that outlive the process that started them.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-steel">
            Build and monitor runs with step retries, manual approvals, condition branches, worker execution, and append-only execution history.
          </p>
        </section>

        <section className="flex items-center">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
