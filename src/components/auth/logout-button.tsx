"use client";

import { useRouter } from "next/navigation";

import { useLogout } from "@/hooks/use-session";

export function LogoutButton() {
  const router = useRouter();
  const logout = useLogout();

  return (
    <button
      type="button"
      className="rounded-full border border-ink/10 px-4 py-2 text-sm text-steel transition hover:border-ink/30 hover:text-ink"
      onClick={async () => {
        await logout.mutateAsync();
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
