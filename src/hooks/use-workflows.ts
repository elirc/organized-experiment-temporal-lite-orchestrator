"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { WorkflowListItem } from "@/types/app";

const workflowsKey = ["workflows"];

export function useWorkflows() {
  return useQuery({
    queryKey: workflowsKey,
    queryFn: () => apiFetch<WorkflowListItem[]>("/api/workflows"),
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      key: string;
      name: string;
      description?: string;
      definition: Record<string, unknown>;
    }) =>
      apiFetch("/api/workflows", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowsKey });
    },
  });
}
