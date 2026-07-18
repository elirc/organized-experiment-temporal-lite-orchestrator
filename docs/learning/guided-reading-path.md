# Guided Reading Path

## Step 1 — src/lib/auth/permissions.ts
**Why read this:** This is the smallest file with the highest leverage because it defines the access model the rest of the backend assumes.
**What to look for:** The `permissions` object, `rolePermissions`, `hasPermission()`, and the distinction between broad permission checks and ownership scoping.
**What to trace:** `requireRequestUser()` in [src/lib/api/route-helpers.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.ts) calls `hasPermission()`. `buildRunVisibilityWhere()` in [src/repositories/workflow-run-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.ts) calls `canReadAllRuns()`.
**What a junior would likely miss:** Hiding a button in React is not the same thing as enforcing access; this file is the real control plane.

## Step 2 — src/lib/auth/session.ts
**Why read this:** It shows how a DB-backed session actually becomes a cookie-authenticated user on the server.
**What to look for:** `createSession()`, `getUserFromSessionToken()`, token hashing, and why the cookie stores only the opaque raw token.
**What to trace:** [src/app/api/auth/login/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/auth/login/route.ts) calls `createSession()`. [src/lib/api/route-helpers.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.ts) and [src/lib/auth/page-auth.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/page-auth.ts) call session readers.
**What a junior would likely miss:** Storing the raw token in the database would make a DB leak instantly replayable.

## Step 3 — src/lib/api/route-helpers.ts
**Why read this:** It is the shared API boundary for auth, permission enforcement, and error translation.
**What to look for:** `requireRequestUser()`, `ApiError`, `jsonOk()`, and `jsonError()`.
**What to trace:** Route handlers in [src/app/api/workflows/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflows/route.ts), [src/app/api/workflow-runs/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflow-runs/route.ts), and [src/app/api/approvals/[approvalId]/decision/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/approvals/[approvalId]/decision/route.ts).
**What a junior would likely miss:** If one route bypasses this helper, that route becomes a special-case security bug.

## Step 4 — src/lib/workflows/definition-schema.ts
**Why read this:** It turns saved JSON into a trusted execution graph.
**What to look for:** `workflowStepSchema`, `workflowDefinitionSchema`, and the `superRefine()` graph checks.
**What to trace:** [src/lib/validation/api-schemas.ts](/c:/Users/Owner/Desktop/ww19/src/lib/validation/api-schemas.ts) uses it for incoming API payloads, and [src/services/workflow-definition-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-definition-service.ts) uses it before persistence.
**What a junior would likely miss:** A schema can validate structure but still miss graph correctness unless you add custom refinements.

## Step 5 — prisma/schema.prisma
**Why read this:** The workflow engine only makes sense once you see which rows are mutable state and which rows are append-only history.
**What to look for:** `WorkflowRun`, `WorkflowStepRun`, `WorkflowTask`, `ApprovalRequest`, `IdempotencyRecord`, and `ExecutionEvent`.
**What to trace:** Repository files in [src/repositories](/c:/Users/Owner/Desktop/ww19/src/repositories) map directly to these models, especially [src/repositories/workflow-run-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.ts) and [src/repositories/task-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/task-repository.ts).
**What a junior would likely miss:** Trying to encode retries, approvals, and history into one table makes the model much harder to operate.

## Step 6 — src/repositories/workflow-run-repository.ts
**Why read this:** It shows how read scoping and aggregate persistence are kept boring and explicit.
**What to look for:** `buildRunVisibilityWhere()`, `listWorkflowRuns()`, `findWorkflowRunById()`, `createWorkflowRun()`, and `appendExecutionEvent()`.
**What to trace:** [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts), [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts), and [src/services/approval-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/approval-service.ts).
**What a junior would likely miss:** Visibility filters belong in the repository layer, not sprinkled into every caller.

## Step 7 — src/repositories/task-repository.ts
**Why read this:** This is the durable queue boundary that makes the worker safe under concurrency.
**What to look for:** `claimNextAvailableTask()` and the raw SQL `FOR UPDATE SKIP LOCKED` lease.
**What to trace:** [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts) calls `claimNextAvailableTask()`. [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts) calls `createWorkflowTask()`.
**What a junior would likely miss:** A read-then-update claim flow works in local dev and then double-runs tasks in production.

## Step 8 — src/services/workflow-definition-service.ts
**Why read this:** It shows how to treat workflow JSON as a versioned domain object instead of mutable config text.
**What to look for:** `createWorkflowDefinitionVersion()`, especially the transaction that retires the old active version and writes the new one.
**What to trace:** [src/app/api/workflows/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflows/route.ts) calls it, and it calls repository functions in [src/repositories/workflow-definition-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-definition-repository.ts).
**What a junior would likely miss:** Overwriting a live definition destroys the ability to explain why an old run behaved the way it did.

## Step 9 — src/services/workflow-run-service.ts
**Why read this:** This file owns the API-facing use case of starting and reading runs.
**What to look for:** `startWorkflowRun()`, especially active-version lookup and the scoped idempotency key.
**What to trace:** [src/app/api/workflow-runs/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflow-runs/route.ts) calls it, and it calls `seedRunExecution()` in [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts).
**What a junior would likely miss:** Idempotency is not just “check before insert”; it also needs scope so two callers cannot collide.

## Step 10 — src/services/workflow-engine-service.ts
**Why read this:** This is the heart of the orchestration system.
**What to look for:** `createNextExecutableStep()`, `completeTaskStep()`, `failTaskStep()`, `resolveApprovalStep()`, and the run/step transition helpers.
**What to trace:** [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts), [src/services/approval-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/approval-service.ts), and [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts).
**What a junior would likely miss:** The engine mutates both current state and append-only history together; if either side is skipped, the system becomes hard to repair.

## Step 11 — src/services/worker-service.ts
**Why read this:** It demonstrates how a worker process should cooperate with a durable orchestrator instead of bypassing it.
**What to look for:** `processNextTask()`, `runIdempotentAction()`, and how handler results are fed back through the engine.
**What to trace:** [src/worker/index.ts](/c:/Users/Owner/Desktop/ww19/src/worker/index.ts) calls it, and it calls [src/repositories/task-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/task-repository.ts) plus engine methods in [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts).
**What a junior would likely miss:** A worker should return structured output, not update runs and steps ad hoc from handler code.

## Step 12 — src/components/runs/run-detail.tsx
**Why read this:** It shows how the UI stays thin while still exposing the full execution story.
**What to look for:** `useWorkflowRun(runId)` and the rendering of step rows plus execution events.
**What to trace:** [src/hooks/use-runs.ts](/c:/Users/Owner/Desktop/ww19/src/hooks/use-runs.ts) calls `/api/workflow-runs/[runId]`, which routes through [src/app/api/workflow-runs/[runId]/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflow-runs/[runId]/route.ts) into [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts).
**What a junior would likely miss:** Operational UIs need history, not just final status, because debugging orchestration is mostly about seeing how state changed over time.
