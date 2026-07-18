"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { ApprovalListItem } from "@/types/app";

const approvalsKey = ["approvals"];

export function useApprovals(enabled = true) {
  return useQuery({
    queryKey: approvalsKey,
    queryFn: () => apiFetch<ApprovalListItem[]>("/api/approvals"),
    enabled,
    refetchInterval: 10_000,
  });
}

export function useSubmitApprovalDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      approvalId: string;
      decision: "APPROVE" | "REJECT";
      comment?: string;
    }) =>
      apiFetch(`/api/approvals/${input.approvalId}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision: input.decision,
          comment: input.comment,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: approvalsKey }),
        queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
      ]);
    },
  });
}
