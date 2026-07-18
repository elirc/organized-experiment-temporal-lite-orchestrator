import { describe, expect, it } from "vitest";

import { assertValidRunTransition } from "@/lib/workflows/run-state-machine";

describe("assertValidRunTransition", () => {
  it("rejects moving a completed run back to running", () => {
    // This matters because invalid terminal-state transitions hide data corruption and make retry behavior impossible to reason about in production incidents.
    expect(() => assertValidRunTransition("SUCCEEDED", "RUNNING")).toThrow(
      "Invalid run transition from SUCCEEDED to RUNNING.",
    );
  });
});
