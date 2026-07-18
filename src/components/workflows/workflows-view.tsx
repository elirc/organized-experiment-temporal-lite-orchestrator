"use client";

import { useSession } from "@/hooks/use-session";
import { useWorkflows } from "@/hooks/use-workflows";
import { prettyDate } from "@/lib/utils";

import { WorkflowCreator } from "./workflow-creator";

export function WorkflowsView() {
  const session = useSession();
  const workflows = useWorkflows();

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-steel">Definitions</p>
            <h1 className="mt-2 font-display text-4xl text-ink">Versioned workflow specs</h1>
          </div>
          <p className="max-w-xl text-sm text-steel">
            Every new save becomes a new active workflow version so old runs stay pinned to the definition they started with.
          </p>
        </div>
      </section>

      {session.data?.user?.role === "ADMIN" ? <WorkflowCreator /> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {workflows.data?.map((workflow) => (
          <article key={workflow.id} className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl text-ink">{workflow.name}</p>
                <p className="mt-1 text-sm text-steel">{workflow.key}</p>
              </div>
              <span className="rounded-full bg-ink px-3 py-1 text-xs text-white">{workflow.status}</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-steel">{workflow.description}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-canvas p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-steel">Latest version</p>
                <p className="mt-2 font-display text-3xl text-ink">v{workflow.versions[0]?.versionNumber ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-canvas p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-steel">Updated</p>
                <p className="mt-2 text-sm text-ink">{prettyDate(workflow.updatedAt)}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
