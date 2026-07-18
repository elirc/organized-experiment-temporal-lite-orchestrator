"use client";

/*
 * What this file does:
 * Exposes React Query hooks for session bootstrap, login, and logout.
 * What calls it:
 * src/components/auth/login-form.tsx, src/components/auth/logout-button.tsx, and client pages that need the user role.
 * What it calls:
 * src/lib/api/client.ts and the auth route handlers.
 * What a junior engineer would likely get wrong:
 * Reading auth state from localStorage instead of asking the server for the current session.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { AppSessionUser } from "@/types/app";

const sessionKey = ["session"];

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: () => apiFetch<{ user: AppSessionUser | null }>("/api/auth/session"),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<{ user: AppSessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(sessionKey, { user: data.user });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      queryClient.setQueryData(sessionKey, { user: null });
    },
  });
}
