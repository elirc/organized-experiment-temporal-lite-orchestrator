# Auth And Permissions

## Session flow

Session creation starts in [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts), where `POST()` parses `loginSchema`, calls `loginUser()` in [src/services/auth-service.ts](../../src/services/auth-service.ts), and sets the cookie from `buildSessionCookie()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts).

The cookie value is an opaque random token. `createSession()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts) hashes that token before saving it in `model Session` in [prisma/schema.prisma](../../prisma/schema.prisma). `getUserFromSessionToken()` in the same file re-hashes the cookie value, resolves the session row, checks `expiresAt`, and returns the `User`.

Server-rendered pages are protected by `requirePageUser()` in [src/lib/auth/page-auth.ts](../../src/lib/auth/page-auth.ts), which calls `getPageSessionUser()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts) and redirects to `/login` before rendering app pages.

## API authorization

API auth is centralized in `requireRequestUser()` in [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts). Every protected route calls it before service logic. Example: `POST()` in [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) requires `permissions.runsStart` before calling `startWorkflowRun()`.

Role-to-permission mapping lives in [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts):
- `ADMIN`: all permissions from `Object.values(permissions)`
- `OPERATOR`: reads workflows/runs and may start/repair runs
- `APPROVER`: reads workflows/runs and may resolve approvals
- `VIEWER`: reads workflows/runs only

This means a route like [src/app/api/approvals/[approvalId]/decision/route.ts](../../src/app/api/approvals/[approvalId]/decision/route.ts) is protected twice:
- `requireRequestUser(request, permissions.approvalsDecide)` blocks non-approvers before the service runs.
- `submitApprovalDecision()` in [src/services/approval-service.ts](../../src/services/approval-service.ts) re-checks `user.role !== "APPROVER" && user.role !== "ADMIN"` so the business rule stays server-side even if the UI is bypassed.

## Data isolation

This project does not implement multi-tenancy because the requirements did not call for org- or tenant-level isolation. Instead it uses explicit auth plus ownership-based read scoping for lower-privilege users.

Run read scoping is enforced in `buildRunVisibilityWhere()` inside [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts). `VIEWER` users get `{ startedById: user.id }`, while higher-privilege roles get `{}`. `listWorkflowRuns()` and `findWorkflowRunById()` both apply that helper before any run data is returned.

Approval visibility is enforced in `listPendingApprovals()` inside [src/repositories/approval-repository.ts](../../src/repositories/approval-repository.ts). `ADMIN` sees all pending approvals; other roles only see rows where `requiredRole` matches their role.

## What would change to add multi-tenancy later

To add tenant isolation without a rewrite:
- Add `tenantId` to `User`, `WorkflowDefinition`, `WorkflowVersion`, `WorkflowRun`, `WorkflowStepRun`, `WorkflowTask`, `ApprovalRequest`, and `ExecutionEvent` in [prisma/schema.prisma](../../prisma/schema.prisma).
- Extend `createSession()` and `getUserFromSessionToken()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts) to load tenant context.
- Replace `buildRunVisibilityWhere()` in [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) with a tenant-aware filter that always scopes `tenantId` first and then layers role/ownership rules on top.
- Update `listWorkflowDefinitions()` and `findActiveWorkflowVersionForDefinition()` in [src/repositories/workflow-definition-repository.ts](../../src/repositories/workflow-definition-repository.ts) so workflow definitions are tenant-owned instead of global.

## Corrections and gaps (verified against the code)

The sections above describe the intended model accurately. These points are what the code does at the edges:

1. **"Protected twice" protects role, not `requiredRole`.** Both guards on the decision endpoint ask "is this user an approver or admin?" Neither asks "does this user's role match the approval's `requiredRole`?" `listPendingApprovals()` hides `ADMIN`-required approvals from `APPROVER` users (`src/repositories/approval-repository.ts:17-20`), but `submitApprovalDecision()` never compares `user.role` to `approval.requiredRole` (`src/services/approval-service.ts:29-39`). Hiding a row from a list is not authorization. The starter workflow only uses `approvalRole: "APPROVER"` (`src/lib/workflows/starter-definition.ts:32`), so the gap appears only when someone authors an `ADMIN`-gated step.
2. **Approval visibility is not run visibility.** `listPendingApprovals()` returns the run, its version and `startedBy` (name, email, role) for every pending approval matching the role (`approval-repository.ts:22-40`). An approver therefore sees runs started by anyone. That is reasonable for an approval queue, but it means the ownership scoping in `buildRunVisibilityWhere()` is not the only read path to run data.
3. **Two permissions are defined but never checked.** `runs:repair` and `worker:execute` (`src/lib/auth/permissions.ts:18-20`) do not appear in any `requireRequestUser()` call. `grep -rn "runsRepair\|workerExecute" src` returns only `permissions.ts`. The worker does not authenticate at all; it talks to Postgres directly.
4. **`SESSION_SECRET` is not used for sessions.** It is required by `src/lib/env.ts:5`, but session security comes entirely from 32 random bytes (`src/lib/auth/session.ts:26`) and the SHA-256 hash stored in the database (`:27`). Rotating `SESSION_SECRET` would not invalidate anything.
5. **Every authenticated request writes to the database.** `getUserFromSessionToken()` updates `lastSeenAt` on each call (`session.ts:65-68`). Pages that fire several React Query requests produce several session writes.
6. **CSRF rests on `SameSite=Lax`.** Cookies are `httpOnly`, `sameSite: "lax"` and `secure` only in production (`session.ts:79-90`). Mutating endpoints are `POST`s with JSON bodies and there is no CSRF token. Lax cookies are not sent on cross-site `POST`s in modern browsers, which is the protection actually in force.
7. **Login has no throttling.** `src/app/api/auth/login/route.ts:18-39` parses and calls `loginUser()` with no attempt counter or delay. The seed password for every demo user is `password123` (`prisma/seed.ts:70`).
8. **Logout deletes one session.** `destroySession()` deletes by token hash (`session.ts:42-45`); other sessions for the same user stay valid until `expiresAt` (7 days, `session.ts:19`).

## Exercise ladder: authorization

**Goal 1: read the matrix.** Using only `src/lib/auth/permissions.ts`, list which roles can start runs.
**Check:** `ADMIN` (all permissions via `Object.values`) and `OPERATOR` (`permissions.ts:26-32`). `APPROVER` cannot start runs.

**Goal 2: run the matrix without a database.** Copy `rolePermissions` and `hasPermission()` into a scratch `.mjs` (they have no imports besides a type) and assert `hasPermission("VIEWER", "approvals:decide") === false`.
**Check:** it is `false`, which is the same fact `src/lib/api/route-helpers.test.ts` asserts through mocks.

**Goal 3: find the gap.** Write down, in one sentence, what an `APPROVER` would have to do to resolve an approval whose `requiredRole` is `ADMIN`.
**Check:** send `POST /api/approvals/<id>/decision` directly with a valid approver session. The id is not secret to anyone who can read run detail, because `findWorkflowRunById()` includes `steps.approval` (`src/repositories/workflow-run-repository.ts:62-77`).

**Goal 4: design the fix.** Where should the `requiredRole` check live so the UI cannot bypass it?
**Check:** in `submitApprovalDecision()` or `resolveApprovalStep()`, after loading the approval and before any write, as `if (user.role !== "ADMIN" && user.role !== approval.requiredRole) throw new ApiError(403, ...)`. That needs the approval loaded in the service, which `resolveApprovalStep()` already does at `src/services/workflow-engine-service.ts:603`.
