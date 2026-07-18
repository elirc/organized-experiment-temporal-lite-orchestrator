import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { permissions } from "@/lib/auth/permissions";

const getUserFromSessionToken = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "tl_session",
  getUserFromSessionToken,
}));

describe("requireRequestUser", () => {
  beforeEach(() => {
    getUserFromSessionToken.mockReset();
  });

  it("rejects an authenticated viewer from an approvals-protected endpoint", async () => {
    // This matters because every approvals endpoint shares this guard, so one mistaken permission mapping would let the wrong role approve production workflows.
    getUserFromSessionToken.mockResolvedValue({
      id: "user_viewer",
      email: "viewer@example.com",
      name: "Viewer User",
      role: "VIEWER",
    });

    const { requireRequestUser } = await import("@/lib/api/route-helpers");
    const request = new NextRequest("http://localhost/api/approvals", {
      headers: {
        cookie: "tl_session=test-token",
      },
    });

    await expect(requireRequestUser(request, permissions.approvalsDecide)).rejects.toMatchObject({
      status: 403,
    });
  });
});
