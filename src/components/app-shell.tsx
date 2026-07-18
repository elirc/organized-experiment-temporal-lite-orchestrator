import type { Route } from "next";
import Link from "next/link";
import { Activity, CheckSquare, FileStack, PlayCircle } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import type { AppSessionUser } from "@/types/app";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/workflows", label: "Workflows", icon: FileStack },
  { href: "/runs", label: "Runs", icon: PlayCircle },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
];

export function AppShell({
  user,
  children,
}: {
  user: AppSessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 md:flex-row md:p-8">
        <aside className="w-full rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur md:w-72">
          <div className="rounded-[1.5rem] bg-ink p-5 text-white">
            <p className="font-display text-2xl">Flowkeeper</p>
            <p className="mt-2 text-sm text-white/70">Durable orchestration for jobs, APIs, and approvals.</p>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-ink/10 bg-canvas p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-steel">Signed in</p>
            <p className="mt-2 font-display text-xl text-ink">{user.name}</p>
            <p className="text-sm text-steel">{user.role}</p>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-steel transition hover:bg-canvas hover:text-ink"
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6">
            <LogoutButton />
          </div>
        </aside>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
