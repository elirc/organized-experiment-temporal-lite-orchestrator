"use client";

/*
 * What this file does:
 * Shows pending approvals and submits approval decisions back through the server.
 * What calls it:
 * src/app/(app)/approvals/page.tsx.
 * What it calls:
 * src/hooks/use-approvals.ts.
 * What a junior engineer would likely get wrong:
 * Optimistically updating UI state without invalidating the source-of-truth queries that also drive run detail pages.
 */
import { useState } from "react";

import { useApprovals, useSubmitApprovalDecision } from "@/hooks/use-approvals";
import { prettyDate } from "@/lib/utils";

export function ApprovalQueue() {
  const approvals = useApprovals(true);
  const submitDecision = useSubmitApprovalDecision();
  const [comment, setComment] = useState("Looks good.");

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
        <p className="text-sm uppercase tracking-[0.2em] text-steel">Approval inbox</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Human checkpoints in the orchestration flow</h1>
      </section>

      <section className="space-y-4">
        {approvals.data?.length ? (
          approvals.data.map((approval) => (
            <article key={approval.id} className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-display text-2xl text-ink">{approval.stepRun.stepName}</p>
                  <p className="mt-1 text-sm text-steel">
                    {approval.workflowRun.displayName ?? approval.workflowRun.workflowVersion.workflowDefinition.name}
                  </p>
                </div>
                <span className="rounded-full bg-signal px-3 py-1 text-xs text-white">{approval.status}</span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-canvas p-4 text-sm text-steel">Required role: {approval.requiredRole}</div>
                <div className="rounded-2xl bg-canvas p-4 text-sm text-steel">Requested: {prettyDate(approval.requestedAt)}</div>
                <div className="rounded-2xl bg-canvas p-4 text-sm text-steel">Requested by: {approval.workflowRun.startedBy.name}</div>
              </div>

              <textarea
                className="mt-4 min-h-24 w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-2xl bg-moss px-4 py-3 text-sm font-medium text-white"
                  onClick={() => submitDecision.mutate({ approvalId: approval.id, decision: "APPROVE", comment })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-signal px-4 py-3 text-sm font-medium text-white"
                  onClick={() => submitDecision.mutate({ approvalId: approval.id, decision: "REJECT", comment })}
                >
                  Reject
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[2rem] border border-dashed border-ink/15 bg-white/60 p-10 text-sm text-steel">
            No pending approvals right now.
          </div>
        )}
      </section>
    </div>
  );
}
