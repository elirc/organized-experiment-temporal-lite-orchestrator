import { describe, expect, it } from "vitest";

import { buildRunVisibilityWhere } from "@/repositories/workflow-run-repository";

describe("buildRunVisibilityWhere", () => {
  it("scopes viewer reads to runs they started while leaving admin reads unscoped", () => {
    // This matters because forgetting the startedById filter turns the runs list and detail endpoints into a cross-user data leak for low-privilege accounts.
    expect(buildRunVisibilityWhere({ id: "viewer-1", role: "VIEWER" })).toEqual({
      startedById: "viewer-1",
    });

    expect(buildRunVisibilityWhere({ id: "admin-1", role: "ADMIN" })).toEqual({});
  });
});
