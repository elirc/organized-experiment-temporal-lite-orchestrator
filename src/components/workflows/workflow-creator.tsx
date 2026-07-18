"use client";

/*
 * What this file does:
 * Renders a lightweight workflow-definition authoring form that posts versioned JSON to the server.
 * What calls it:
 * src/components/workflows/workflows-view.tsx.
 * What it calls:
 * src/hooks/use-workflows.ts and src/lib/workflows/starter-definition.ts.
 * What a junior engineer would likely get wrong:
 * Trusting textarea JSON entirely on the client instead of treating the server as the final validation boundary.
 */
import { FormEvent, useState } from "react";

import { useCreateWorkflow } from "@/hooks/use-workflows";
import { starterWorkflowDefinition } from "@/lib/workflows/starter-definition";

export function WorkflowCreator() {
  const createWorkflow = useCreateWorkflow();
  const [key, setKey] = useState("customer-risk-review");
  const [name, setName] = useState("Customer risk review");
  const [description, setDescription] = useState("Sample workflow that demonstrates API, condition, approval, and job steps.");
  const [definitionText, setDefinitionText] = useState(JSON.stringify(starterWorkflowDefinition, null, 2));
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const definition = JSON.parse(definitionText) as Record<string, unknown>;

      await createWorkflow.mutateAsync({
        key,
        name,
        description,
        definition,
      });
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Could not save workflow.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row">
        <label className="flex-1 space-y-2 text-sm text-steel">
          <span>Key</span>
          <input className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink" value={key} onChange={(event) => setKey(event.target.value)} />
        </label>
        <label className="flex-[1.5] space-y-2 text-sm text-steel">
          <span>Name</span>
          <input className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      </div>

      <label className="mt-4 block space-y-2 text-sm text-steel">
        <span>Description</span>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <label className="mt-4 block space-y-2 text-sm text-steel">
        <span>Definition JSON</span>
        <textarea
          className="min-h-[28rem] w-full rounded-3xl border border-ink/10 bg-ink px-4 py-4 font-mono text-xs leading-6 text-white"
          value={definitionText}
          onChange={(event) => setDefinitionText(event.target.value)}
        />
      </label>

      {error ? <p className="mt-4 rounded-2xl bg-signal/10 px-4 py-3 text-sm text-signal">{error}</p> : null}

      <button
        type="submit"
        disabled={createWorkflow.isPending}
        className="mt-4 rounded-2xl bg-signal px-5 py-3 text-sm font-medium text-white transition hover:bg-signal/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {createWorkflow.isPending ? "Saving version..." : "Save workflow version"}
      </button>
    </form>
  );
}
