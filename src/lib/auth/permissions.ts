/*
 * What this file does:
 * Defines the application permission model and role-to-permission mapping in one reviewable place.
 * What calls it:
 * Route guards in src/lib/api/route-helpers.ts and visibility logic in services/repositories.
 * What it calls:
 * Prisma's UserRole type.
 * What a junior engineer would likely get wrong:
 * Scattering role checks across route handlers and components until the real access model becomes impossible to audit.
 */
import type { UserRole } from "@prisma/client";

export const permissions = {
  workflowsRead: "workflows:read",
  workflowsWrite: "workflows:write",
  runsRead: "runs:read",
  runsStart: "runs:start",
  runsRepair: "runs:repair",
  approvalsDecide: "approvals:decide",
  workerExecute: "worker:execute",
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];

const rolePermissions: Record<UserRole, Permission[]> = {
  ADMIN: Object.values(permissions),
  OPERATOR: [
    permissions.workflowsRead,
    permissions.runsRead,
    permissions.runsStart,
    permissions.runsRepair,
  ],
  APPROVER: [permissions.workflowsRead, permissions.runsRead, permissions.approvalsDecide],
  VIEWER: [permissions.workflowsRead, permissions.runsRead],
};

export function hasPermission(role: UserRole, permission: Permission) {
  // ⚠️ SENIOR NOTE: Centralizing the role matrix here keeps reviewers from having to grep route files to understand who can do what.
  return rolePermissions[role].includes(permission);
}

export function canReadAllRuns(role: UserRole) {
  return role !== "VIEWER";
}

export function listPermissionsForRole(role: UserRole) {
  return rolePermissions[role];
}
