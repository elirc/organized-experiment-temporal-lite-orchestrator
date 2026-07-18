"use client";

/*
 * What this file does:
 * Shows one workflow run's state, steps, and execution-event timeline.
 * What calls it:
 * src/app/(app)/runs/[runId]/page.tsx.
 * What it calls:
 * src/hooks/use-runs.ts and src/lib/utils.ts.
 * What a junior engineer would likely get wrong:
 * Only rendering the current status and ignoring history, which removes the evidence needed to debug retries and approvals.
 */
import { useWorkflowRun } from "@/hooks/use-runs";
import { prettyDate } from "@/lib/utils";

export function RunDetail({ runId }: { runId: string }) {
  const run = useWorkflowRun(runId);

  if (run.isLoading) {
    return <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">Loading run...</div>;
  }

  if (!run.data) {
    return <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">Run not found.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
        <p className="text-sm uppercase tracking-[0.2em] text-steel">Run detail</p>
        <h1 className="mt-2 font-display text-4xl text-ink">{run.data.displayName ?? run.data.workflowVersion.workflowDefinition.name}</h1>
        <p className="mt-3 text-sm text-steel">
          {run.data.workflowVersion.workflowDefinition.name} · v{run.data.workflowVersion.versionNumber}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Status</p>
          <p className="mt-2 font-display text-3xl text-ink">{run.data.status}</p>
          <p className="mt-4 text-sm text-steel">Current step: {run.data.currentStepKey ?? "Completed"}</p>
        </div>
        <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Input</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-canvas p-4 text-xs leading-6 text-ink">{JSON.stringify(run.data.input, null, 2)}</pre>
        </div>
        <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Context</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-canvas p-4 text-xs leading-6 text-ink">{JSON.stringify(run.data.context, null, 2)}</pre>
        </div>
      </section>

      <section className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">
        <p className="font-display text-2xl text-ink">Steps</p>
        <div className="mt-4 space-y-4">
          {run.data.steps.map((step) => (
            <article key={step.id} className="rounded-2xl border border-ink/10 bg-canvas p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium text-ink">{step.stepName}</p>
                  <p className="text-sm text-steel">
                    {step.stepKey} · {step.stepType}
                  </p>
                </div>
                <span className="rounded-full bg-ink px-3 py-1 text-xs text-white">{step.status}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-white p-3 text-sm text-steel">Attempts: {step.attemptCount}/{step.maxAttempts}</div>
                <div className="rounded-2xl bg-white p-3 text-sm text-steel">Backoff: {step.backoffMs}ms</div>
                <div className="rounded-2xl bg-white p-3 text-sm text-steel">Available: {prettyDate(step.availableAt)}</div>
                <div className="rounded-2xl bg-white p-3 text-sm text-steel">Completed: {prettyDate(step.completedAt)}</div>
              </div>

              {step.task ? (
                <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-steel">
                  Task {step.task.handlerKey} on queue {step.task.queue} is {step.task.status}.
                </div>
              ) : null}

              {step.approval ? (
                <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-steel">
                  Approval requires {step.approval.requiredRole} and is currently {step.approval.status}.
                </div>
              ) : null}

              {step.lastError ? <p className="mt-4 rounded-2xl bg-signal/10 px-4 py-3 text-sm text-signal">{step.lastError}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel">
        <p className="font-display text-2xl text-ink">Execution history</p>
        <div className="mt-4 space-y-3">
          {run.data.events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-ink/10 bg-canvas p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="font-medium text-ink">{event.eventType}</p>
                <p className="text-sm text-steel">{prettyDate(event.createdAt)}</p>
              </div>
              <p className="mt-2 text-sm text-steel">{event.message}</p>
              {event.fromStatus || event.toStatus ? (
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-steel">
                  {event.fromStatus ?? "NONE"} → {event.toStatus ?? "NONE"}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
