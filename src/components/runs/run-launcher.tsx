"use client";

import { FormEvent, useMemo, useState } from "react";

import { useStartWorkflowRun } from "@/hooks/use-runs";
import { useWorkflows } from "@/hooks/use-workflows";

export function RunLauncher() {
  const workflows = useWorkflows();
  const startRun = useStartWorkflowRun();
  const availableWorkflowId = workflows.data?.[0]?.id ?? "";
  const [workflowDefinitionId, setWorkflowDefinitionId] = useState("");
  const [displayName, setDisplayName] = useState("April customer review");
  const [inputText, setInputText] = useState(
    JSON.stringify(
      {
        accountId: "acct-4432",
        requestedBy: "support@example.com",
        failOnceHandlers: ["notify-finished-webhook"],
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const effectiveWorkflowId = useMemo(
    () => workflowDefinitionId || availableWorkflowId,
    [workflowDefinitionId, availableWorkflowId],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const input = JSON.parse(inputText) as Record<string, unknown>;
      await startRun.mutateAsync({
        workflowDefinitionId: effectiveWorkflowId,
        displayName,
        input,
        idempotencyKey: `launch-${Date.now()}`,
      });
      setDisplayName(`${displayName} copy`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Could not start run.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row">
        <label className="flex-1 space-y-2 text-sm text-steel">
          <span>Workflow</span>
          <select
            className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink"
            value={effectiveWorkflowId}
            onChange={(event) => setWorkflowDefinitionId(event.target.value)}
          >
            {workflows.data?.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-[1.5] space-y-2 text-sm text-steel">
          <span>Run name</span>
          <input
            className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-ink"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
      </div>

      <label className="mt-4 block space-y-2 text-sm text-steel">
        <span>Run input JSON</span>
        <textarea
          className="min-h-48 w-full rounded-3xl border border-ink/10 bg-ink px-4 py-4 font-mono text-xs leading-6 text-white"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
        />
      </label>

      {error ? <p className="mt-4 rounded-2xl bg-signal/10 px-4 py-3 text-sm text-signal">{error}</p> : null}

      <button
        type="submit"
        disabled={startRun.isPending || !effectiveWorkflowId}
        className="mt-4 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {startRun.isPending ? "Starting run..." : "Start workflow run"}
      </button>
    </form>
  );
}
