# Guided Reading Path

## Step 1 — src/lib/auth/permissions.ts
**Why read this:** This is the smallest file with the highest leverage because it defines the access model the rest of the backend assumes.
**What to look for:** The `permissions` object, `rolePermissions`, `hasPermission()`, and the distinction between broad permission checks and ownership scoping.
**What to trace:** `requireRequestUser()` in [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) calls `hasPermission()`. `buildRunVisibilityWhere()` in [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) calls `canReadAllRuns()`.
**What a junior would likely miss:** Hiding a button in React is not the same thing as enforcing access; this file is the real control plane.

## Step 2 — src/lib/auth/session.ts
**Why read this:** It shows how a DB-backed session actually becomes a cookie-authenticated user on the server.
**What to look for:** `createSession()`, `getUserFromSessionToken()`, token hashing, and why the cookie stores only the opaque raw token.
**What to trace:** [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts) calls `createSession()`. [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) and [src/lib/auth/page-auth.ts](../../src/lib/auth/page-auth.ts) call session readers.
**What a junior would likely miss:** Storing the raw token in the database would make a DB leak instantly replayable.

## Step 3 — src/lib/api/route-helpers.ts
**Why read this:** It is the shared API boundary for auth, permission enforcement, and error translation.
**What to look for:** `requireRequestUser()`, `ApiError`, `jsonOk()`, and `jsonError()`.
**What to trace:** Route handlers in [src/app/api/workflows/route.ts](../../src/app/api/workflows/route.ts), [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts), and [src/app/api/approvals/[approvalId]/decision/route.ts](../../src/app/api/approvals/[approvalId]/decision/route.ts).
**What a junior would likely miss:** If one route bypasses this helper, that route becomes a special-case security bug.

## Step 4 — src/lib/workflows/definition-schema.ts
**Why read this:** It turns saved JSON into a trusted execution graph.
**What to look for:** `workflowStepSchema`, `workflowDefinitionSchema`, and the `superRefine()` graph checks.
**What to trace:** [src/lib/validation/api-schemas.ts](../../src/lib/validation/api-schemas.ts) uses it for incoming API payloads, and [src/services/workflow-definition-service.ts](../../src/services/workflow-definition-service.ts) uses it before persistence.
**What a junior would likely miss:** A schema can validate structure but still miss graph correctness unless you add custom refinements.

## Step 5 — prisma/schema.prisma
**Why read this:** The workflow engine only makes sense once you see which rows are mutable state and which rows are append-only history.
**What to look for:** `WorkflowRun`, `WorkflowStepRun`, `WorkflowTask`, `ApprovalRequest`, `IdempotencyRecord`, and `ExecutionEvent`.
**What to trace:** Repository files in [src/repositories](../../src/repositories) map directly to these models, especially [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) and [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts).
**What a junior would likely miss:** Trying to encode retries, approvals, and history into one table makes the model much harder to operate.

## Step 6 — src/repositories/workflow-run-repository.ts
**Why read this:** It shows how read scoping and aggregate persistence are kept boring and explicit.
**What to look for:** `buildRunVisibilityWhere()`, `listWorkflowRuns()`, `findWorkflowRunById()`, `createWorkflowRun()`, and `appendExecutionEvent()`.
**What to trace:** [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts), [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts), and [src/services/approval-service.ts](../../src/services/approval-service.ts).
**What a junior would likely miss:** Visibility filters belong in the repository layer, not sprinkled into every caller.

## Step 7 — src/repositories/task-repository.ts
**Why read this:** This is the durable queue boundary that makes the worker safe under concurrency.
**What to look for:** `claimNextAvailableTask()` and the raw SQL `FOR UPDATE SKIP LOCKED` lease.
**What to trace:** [src/services/worker-service.ts](../../src/services/worker-service.ts) calls `claimNextAvailableTask()`. [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) calls `createWorkflowTask()`.
**What a junior would likely miss:** A read-then-update claim flow works in local dev and then double-runs tasks in production.

## Step 8 — src/services/workflow-definition-service.ts
**Why read this:** It shows how to treat workflow JSON as a versioned domain object instead of mutable config text.
**What to look for:** `createWorkflowDefinitionVersion()`, especially the transaction that retires the old active version and writes the new one.
**What to trace:** [src/app/api/workflows/route.ts](../../src/app/api/workflows/route.ts) calls it, and it calls repository functions in [src/repositories/workflow-definition-repository.ts](../../src/repositories/workflow-definition-repository.ts).
**What a junior would likely miss:** Overwriting a live definition destroys the ability to explain why an old run behaved the way it did.

## Step 9 — src/services/workflow-run-service.ts
**Why read this:** This file owns the API-facing use case of starting and reading runs.
**What to look for:** `startWorkflowRun()`, especially active-version lookup and the scoped idempotency key.
**What to trace:** [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) calls it, and it calls `seedRunExecution()` in [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts).
**What a junior would likely miss:** Idempotency is not just “check before insert”; it also needs scope so two callers cannot collide.

## Step 10 — src/services/workflow-engine-service.ts
**Why read this:** This is the heart of the orchestration system.
**What to look for:** `createNextExecutableStep()`, `completeTaskStep()`, `failTaskStep()`, `resolveApprovalStep()`, and the run/step transition helpers.
**What to trace:** [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts), [src/services/approval-service.ts](../../src/services/approval-service.ts), and [src/services/worker-service.ts](../../src/services/worker-service.ts).
**What a junior would likely miss:** The engine mutates both current state and append-only history together; if either side is skipped, the system becomes hard to repair.

## Step 11 — src/services/worker-service.ts
**Why read this:** It demonstrates how a worker process should cooperate with a durable orchestrator instead of bypassing it.
**What to look for:** `processNextTask()`, `runIdempotentAction()`, and how handler results are fed back through the engine.
**What to trace:** [src/worker/index.ts](../../src/worker/index.ts) calls it, and it calls [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) plus engine methods in [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts).
**What a junior would likely miss:** A worker should return structured output, not update runs and steps ad hoc from handler code.

## Step 12 — src/components/runs/run-detail.tsx
**Why read this:** It shows how the UI stays thin while still exposing the full execution story.
**What to look for:** `useWorkflowRun(runId)` and the rendering of step rows plus execution events.
**What to trace:** [src/hooks/use-runs.ts](../../src/hooks/use-runs.ts) calls `/api/workflow-runs/[runId]`, which routes through [src/app/api/workflow-runs/[runId]/route.ts](../../src/app/api/workflow-runs/[runId]/route.ts) into [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts).
**What a junior would likely miss:** Operational UIs need history, not just final status, because debugging orchestration is mostly about seeing how state changed over time.

---

# Goal and Check ladder for the reading path

The twelve steps above tell you *what* to read. This ladder gives each stage a concrete goal and a check you can verify from the code alone, without running the app. Answers point at exact lines so you can confirm rather than trust.

### After steps 1-3 (auth)

**Goal:** name every HTTP status that `requireRequestUser()` can produce, and one status it should produce but doesn't.
**Check:** 401 (`src/lib/api/route-helpers.ts:32-34`) and 403 (`:36-38`). Validation failures should be 400 but surface as 500 because `jsonError()` only recognises `ApiError` (`:47-60`).

### After step 4 (definition schema)

**Goal:** write a workflow JSON that passes `workflowDefinitionSchema` but cannot complete at runtime.
**Check:** two answers exist in this codebase. (a) A cycle, e.g. step `a` with `onSuccess: "b"` and `b` with `onSuccess: "a"`: the `superRefine` (`src/lib/workflows/definition-schema.ts:84-127`) only checks that targets exist, and the second visit to `a` violates `@@unique([workflowRunId, stepKey])` (`prisma/schema.prisma:203`). (b) A `handlerKey` that is not in `taskHandlers`: accepted at `definition-schema.ts:45`, then retried forever by the worker.

### After step 5 (schema)

**Goal:** list which models are mutable state and which are history.
**Check:** mutable: `WorkflowRun`, `WorkflowStepRun`, `WorkflowTask`, `ApprovalRequest`. History: `ExecutionEvent`, `ApprovalDecision`. `IdempotencyRecord` is a cache. Then notice that history rows cascade-delete with their run (`prisma/schema.prisma:282`), so "append-only" is a convention.

### After step 7 (task repository)

**Goal:** explain in two sentences why `SKIP LOCKED` is used instead of plain `FOR UPDATE`.
**Check:** plain `FOR UPDATE` would make a second worker *wait* on the row the first worker locked, then re-check it and find it `LEASED`, returning nothing. `SKIP LOCKED` lets it move on to the next available row immediately, so N workers drain N tasks in parallel.

**Stretch goal:** find the line that would need to change to reclaim expired leases.
**Check:** the `WHERE` at `src/repositories/task-repository.ts:59-60`.

### After step 9 (run service)

**Goal:** describe what a client sees if it retries `POST /api/workflow-runs` with the same `idempotencyKey` (a) after the first call succeeded, (b) while the first call is still in flight.
**Check:** (a) the original run, from `findWorkflowRunByIdempotencyKey()` (`src/services/workflow-run-service.ts:52-56`). Note that the return value there comes from a query *without* visibility scoping and with a different `include` shape from a fresh start (`src/repositories/workflow-run-repository.ts:87-101` vs `:47-85`). (b) Possibly a 500 from the unique index on `idempotencyKey`.

### After step 10 (engine)

**Goal:** for each of the four step types, state the step row's initial status and whether a `WorkflowTask` row is created.
**Check:**

| Step type | Initial status | Task row? | Code |
| --- | --- | --- | --- |
| `API_CALL` / `JOB` | `QUEUED` | Yes | `src/services/workflow-engine-service.ts:166-221` |
| `APPROVAL` | `WAITING_APPROVAL` | No (an `ApprovalRequest` instead) | `:223-268` |
| `CONDITION` | `SUCCEEDED` (evaluated inline) | No | `:270-337` |

**Goal:** explain why a `CONDITION` step never appears as "running".
**Check:** it is evaluated synchronously inside whatever transaction reached it, and its row is created already `SUCCEEDED` (`:281-295`). The next step is created in the same transaction (`:334`).

### After step 11 (worker service)

**Goal:** list everything that runs *outside* the handler `try/catch` in `processNextTask()`.
**Check:** `claimNextAvailableTask()` (`src/services/worker-service.ts:70`), `findWorkflowTaskById()` (`:76`), the missing-handler `failTaskStep()` (`:85-89`) and `markTaskExecutionStarted()` (`:94`). An exception from any of them escapes to the worker loop and exits the process.

### Capstone

**Goal:** using only what you have read, write the three-line runbook for "a run is stuck in RUNNING".
**Check:** compare with Scenario A in `docs/learning/flow-traces.md`. If your runbook says "wait for the lease to expire", re-read finding F1: nothing reclaims expired leases.
