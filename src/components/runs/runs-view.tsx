"use client";

import Link from "next/link";

import { useWorkflowRuns } from "@/hooks/use-runs";
import { useSession } from "@/hooks/use-session";
import { prettyDate } from "@/lib/utils";

import { RunLauncher } from "./run-launcher";

function statusTone(status: string) {
  switch (status) {
    case "RUNNING":
      return "bg-moss text-white";
    case "WAITING_APPROVAL":
      return "bg-signal text-white";
    case "FAILED":
      return "bg-ink text-white";
    case "SUCCEEDED":
      return "bg-ink/70 text-white";
    default:
      return "bg-steel/20 text-ink";
  }
}

export function RunsView() {
  const session = useSession();
  const runs = useWorkflowRuns();

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-steel">Executions</p>
            <h1 className="mt-2 font-display text-4xl text-ink">Workflow runs and step state</h1>
          </div>
          <p className="max-w-xl text-sm text-steel">
            Runs are durable records tied to a workflow version, with steps, retries, approvals, and event history stored separately for operability.
          </p>
        </div>
      </section>

      {session.data?.user?.role === "ADMIN" || session.data?.user?.role === "OPERATOR" ? <RunLauncher /> : null}

      <section className="space-y-4">
        {runs.data?.map((run) => (
          <article key={run.id} className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-display text-2xl text-ink">{run.displayName ?? run.workflowVersion.workflowDefinition.name}</p>
                <p className="mt-1 text-sm text-steel">
                  {run.workflowVersion.workflowDefinition.name} · v{run.workflowVersion.versionNumber}
                </p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs ${statusTone(run.status)}`}>{run.status}</span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-canvas p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-steel">Current step</p>
                <p className="mt-2 text-sm text-ink">{run.currentStepKey ?? "Completed"}</p>
              </div>
              <div className="rounded-2xl bg-canvas p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-steel">Started by</p>
                <p className="mt-2 text-sm text-ink">{run.startedBy.name}</p>
              </div>
              <div className="rounded-2xl bg-canvas p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-steel">Updated</p>
                <p className="mt-2 text-sm text-ink">{prettyDate(run.updatedAt)}</p>
              </div>
              <div className="rounded-2xl bg-canvas p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-steel">Pending approvals</p>
                <p className="mt-2 text-sm text-ink">{run.approvals.length}</p>
              </div>
            </div>

            {run.lastError ? <p className="mt-4 rounded-2xl bg-signal/10 px-4 py-3 text-sm text-signal">{run.lastError}</p> : null}

            <div className="mt-5">
              <Link
                href={`/runs/${run.id}`}
                className="inline-flex rounded-full border border-ink/10 px-4 py-2 text-sm text-ink transition hover:border-ink/30"
              >
                Inspect run
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
