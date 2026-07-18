"use client";

import { useApprovals } from "@/hooks/use-approvals";
import { useWorkflowRuns } from "@/hooks/use-runs";
import { useSession } from "@/hooks/use-session";
import { useWorkflows } from "@/hooks/use-workflows";

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-[1.8rem] border border-ink/10 bg-white/80 p-5 shadow-panel backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-steel">{label}</p>
      <p className={`mt-3 font-display text-4xl ${tone}`}>{value}</p>
    </div>
  );
}

export function OverviewPanel() {
  const session = useSession();
  const workflows = useWorkflows();
  const runs = useWorkflowRuns();
  const approvals = useApprovals(
    session.data?.user?.role === "APPROVER" || session.data?.user?.role === "ADMIN",
  );

  const runningRuns = runs.data?.filter((run) => run.status === "RUNNING").length ?? 0;
  const waitingRuns = runs.data?.filter((run) => run.status === "WAITING_APPROVAL").length ?? 0;
  const failedRuns = runs.data?.filter((run) => run.status === "FAILED").length ?? 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-ink/10 bg-[linear-gradient(135deg,rgba(182,73,38,0.12),rgba(91,107,67,0.08))] p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-steel">Workflow operations</p>
        <h1 className="mt-3 font-display text-5xl text-ink">See retries, approvals, and durable state in one place.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-steel">
          This system stores workflow runs, step attempts, approvals, task leases, and execution events in PostgreSQL so workers can restart without losing orchestration state.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Definitions" value={String(workflows.data?.length ?? 0)} tone="text-ink" />
        <StatCard label="Running" value={String(runningRuns)} tone="text-moss" />
        <StatCard label="Waiting approval" value={String(waitingRuns)} tone="text-signal" />
        <StatCard label="Failed" value={String(failedRuns)} tone="text-ink" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
          <p className="font-display text-2xl text-ink">Recent runs</p>
          <div className="mt-4 space-y-3">
            {runs.data?.slice(0, 5).map((run) => (
              <div key={run.id} className="rounded-2xl border border-ink/10 bg-canvas p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{run.displayName ?? run.workflowVersion.workflowDefinition.name}</p>
                    <p className="text-sm text-steel">{run.workflowVersion.workflowDefinition.key}</p>
                  </div>
                  <span className="rounded-full bg-ink px-3 py-1 text-xs text-white">{run.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
          <p className="font-display text-2xl text-ink">Approval inbox</p>
          <p className="mt-2 text-sm text-steel">Only approvers and admins see pending approvals.</p>
          <div className="mt-4 space-y-3">
            {approvals.data?.length ? (
              approvals.data.slice(0, 5).map((approval) => (
                <div key={approval.id} className="rounded-2xl border border-ink/10 bg-canvas p-4">
                  <p className="font-medium text-ink">{approval.stepRun.stepName}</p>
                  <p className="text-sm text-steel">{approval.workflowRun.displayName ?? approval.workflowRun.workflowVersion.workflowDefinition.name}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-ink/15 bg-canvas p-4 text-sm text-steel">
                No pending approvals.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
