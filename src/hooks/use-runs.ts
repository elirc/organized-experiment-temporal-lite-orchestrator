"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { WorkflowRunDetail, WorkflowRunListItem } from "@/types/app";

const runsKey = ["workflow-runs"];

export function useWorkflowRuns() {
  return useQuery({
    queryKey: runsKey,
    queryFn: () => apiFetch<WorkflowRunListItem[]>("/api/workflow-runs"),
    refetchInterval: 10_000,
  });
}

export function useWorkflowRun(runId: string) {
  return useQuery({
    queryKey: [...runsKey, runId],
    queryFn: () => apiFetch<WorkflowRunDetail>(`/api/workflow-runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: 5_000,
  });
}

export function useStartWorkflowRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      workflowDefinitionId: string;
      displayName: string;
      idempotencyKey: string;
      input: Record<string, unknown>;
    }) =>
      apiFetch("/api/workflow-runs", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runsKey });
    },
  });
}
