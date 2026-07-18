import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "@/lib/workflows/definition-schema";

describe("workflowDefinitionSchema", () => {
  it("rejects a workflow that points at an undefined next step", () => {
    // This matters because a broken workflow definition would only fail once a real run reaches that branch, so validating the graph up front prevents late production failures.
    const result = workflowDefinitionSchema.safeParse({
      initialStepKey: "fetch",
      steps: [
        {
          key: "fetch",
          name: "Fetch data",
          type: "API_CALL",
          handlerKey: "fetch-account-profile",
          queue: "default",
          retry: { maxAttempts: 2, initialDelayMs: 1000 },
          next: { onSuccess: "missing-step" },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
