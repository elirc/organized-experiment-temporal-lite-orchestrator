# Load-Bearing Files

## prisma/schema.prisma
- What it does: Defines the durable relational model for auth, workflow versions, runs, steps, tasks, approvals, idempotency, and execution history.
- What calls it: Prisma Client generated from this schema is imported by [src/lib/db.ts](../../src/lib/db.ts), then used across all repositories.
- What it calls: PostgreSQL via Prisma.
- What would break or become insecure if this file were wrong: Missing uniqueness or relation constraints would let duplicate runs, orphaned steps, or broken approval history slip in silently.
- What a junior engineer would likely miswrite here: Compressing mutable execution state and append-only history into one model because it feels simpler at first.

## src/lib/auth/session.ts
- What it does: Creates, resolves, and destroys DB-backed sessions from an HTTP-only cookie.
- What calls it: [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts), [src/app/api/auth/logout/route.ts](../../src/app/api/auth/logout/route.ts), [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts), and [src/lib/auth/page-auth.ts](../../src/lib/auth/page-auth.ts).
- What it calls: [src/lib/db.ts](../../src/lib/db.ts).
- What would break or become insecure if this file were wrong: Stolen cookies would be easier to replay, expired sessions could remain valid, or protected pages could render for anonymous users.
- What a junior engineer would likely miswrite here: Storing the raw token in the database instead of hashing it.

## src/lib/api/route-helpers.ts
- What it does: Enforces API auth/permissions and normalizes JSON success/error responses.
- What calls it: All protected route handlers under [src/app/api](../../src/app/api).
- What it calls: [src/lib/auth/session.ts](../../src/lib/auth/session.ts) and [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts).
- What would break or become insecure if this file were wrong: A whole class of endpoints could become public or start returning inconsistent status codes.
- What a junior engineer would likely miswrite here: Parsing the body before auth, which wastes work and increases attack surface.

## src/lib/workflows/definition-schema.ts
- What it does: Validates workflow JSON and its step graph.
- What calls it: [src/lib/validation/api-schemas.ts](../../src/lib/validation/api-schemas.ts) and [src/services/workflow-definition-service.ts](../../src/services/workflow-definition-service.ts).
- What it calls: Zod only.
- What would break or become insecure if this file were wrong: Broken workflow graphs could be saved and then fail only once a live run reaches the bad edge.
- What a junior engineer would likely miswrite here: Validating only shape and not referenced step keys.

## src/repositories/workflow-run-repository.ts
- What it does: Owns run reads/writes, step persistence, event appends, and run-read scoping.
- What calls it: [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts), [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts), and tests in [src/repositories/workflow-run-repository.test.ts](../../src/repositories/workflow-run-repository.test.ts).
- What it calls: [src/lib/db.ts](../../src/lib/db.ts) and [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts).
- What would break or become insecure if this file were wrong: Viewers could see other users’ runs, and engine state/history writes could drift apart.
- What a junior engineer would likely miswrite here: Putting the read-scope filter in the service layer and forgetting one caller.

## src/repositories/task-repository.ts
- What it does: Persists queue tasks and safely leases one task to one worker at a time.
- What calls it: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) and [src/services/worker-service.ts](../../src/services/worker-service.ts).
- What it calls: [src/lib/db.ts](../../src/lib/db.ts) and a raw PostgreSQL query.
- What would break or become insecure if this file were wrong: Two workers could process the same task, which is exactly the kind of duplicated side effect orchestration systems exist to avoid.
- What a junior engineer would likely miswrite here: A separate `SELECT` followed by `UPDATE`.

## src/services/workflow-run-service.ts
- What it does: Starts new workflow runs, enforces per-user idempotency for starts, and reads run detail for the UI.
- What calls it: [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) and [src/app/api/workflow-runs/[runId]/route.ts](../../src/app/api/workflow-runs/[runId]/route.ts).
- What it calls: [src/repositories/workflow-definition-repository.ts](../../src/repositories/workflow-definition-repository.ts), [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts), and [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts).
- What would break or become insecure if this file were wrong: Runs could start against the wrong definition version or duplicate because idempotency was too weak.
- What a junior engineer would likely miswrite here: Using the caller-supplied idempotency key globally without scoping it.

## src/services/workflow-engine-service.ts
- What it does: Coordinates state transitions, branching, approvals, retries, and run completion.
- What calls it: [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts), [src/services/approval-service.ts](../../src/services/approval-service.ts), and [src/services/worker-service.ts](../../src/services/worker-service.ts).
- What it calls: Repositories in [src/repositories](../../src/repositories), plus helpers in [src/lib/workflows](../../src/lib/workflows).
- What would break or become insecure if this file were wrong: Retries could skip validation, approvals could advance to the wrong step, or state/history could diverge.
- What a junior engineer would likely miswrite here: Updating run status directly from several callers instead of routing all transitions through one engine.

## src/services/worker-service.ts
- What it does: Claims tasks, executes handlers, uses idempotency records, and reports success/failure back to the engine.
- What calls it: [src/worker/index.ts](../../src/worker/index.ts).
- What it calls: [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts), [src/repositories/idempotency-repository.ts](../../src/repositories/idempotency-repository.ts), and engine methods in [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts).
- What would break or become insecure if this file were wrong: Retried tasks could duplicate side effects or leave runs stuck because leased work never feeds back into engine state.
- What a junior engineer would likely miswrite here: Calling handlers without a durable claim/retry boundary.

## src/worker/index.ts
- What it does: Runs the polling loop (2 s sleep when idle, 250 ms after work) and stops cleanly on SIGINT/SIGTERM (`src/worker/index.ts:29-53`).
- What calls it: `npm run worker` (`package.json` script `worker`).
- What it calls: `processNextTask()` and the `taskHandlers` registry.
- What would break if this file were wrong: Nothing executes. The web app only enqueues.
- Verified weakness: There is no `try/catch` inside the loop. Any exception that escapes `processNextTask()` reaches `main().catch` and calls `process.exit(1)` (`:55-58`). Run it under a process supervisor.

## src/worker/handlers/index.ts
- What it does: Registers four simulated handlers (`fetch-account-profile`, `generate-summary-packet`, `notify-finished-webhook`, `notify-rejected-webhook`, `:109-114`). None calls a real external system; each sleeps 300-600 ms and returns computed data.
- What calls it: `processNextTask()` through `deps.handlers[hydratedTask.handlerKey]` (`src/services/worker-service.ts:82`).
- What would break if this file were wrong: A handler key used in a saved workflow but missing here triggers the unbounded retry loop (finding F2).
- What a junior engineer would likely miswrite here: Writing to the database from a handler instead of returning `output` / `contextPatch`. The header comment says this; the type signature (`RegisteredTaskHandler`, `:17-25`) enforces only the return shape, not the absence of side effects.

## src/lib/workflows/retry.ts and src/lib/workflows/expression.ts
- Why they are load-bearing despite being under 50 lines each: every retry delay and every branch decision passes through them, and they are pure, so they are the easiest places to add tests. See the Check ladder in `docs/learning/testing-rationale.md` for their real outputs.

---

## Senior review notes per file (evidence-backed)

These add to the "what would break" bullets above with problems that exist *today*.

| File | Finding | Evidence |
| --- | --- | --- |
| `src/repositories/task-repository.ts` | Leases never expire; `leaseToken` is never checked. The claim is safe, but ownership afterwards cannot be reclaimed or fenced. | `:59` selects only `AVAILABLE`; `leaseToken` appears only in writes |
| `src/services/workflow-engine-service.ts` | Reads inside transactions use the global client (`findWorkflowRunAggregateById`, `findApprovalById`, `findWorkflowTaskById` all call `db.`), so they do not see the transaction's own snapshot or hold locks. | `src/repositories/workflow-run-repository.ts:130-131`, `src/repositories/approval-repository.ts:43-44`, `task-repository.ts:90-91` |
| `src/services/workflow-engine-service.ts` | `completeTaskStep()` does not check the task is still `LEASED` by this worker before completing it. | `:451-475` |
| `src/services/worker-service.ts` | Missing-handler path skips the attempt increment (F2); idempotency record is written after the side effect. | `:82-94`, `:45-55` |
| `src/services/approval-service.ts` | Role check ignores `requiredRole` (F4). | `:29-31` |
| `src/services/workflow-run-service.ts` | Run creation and seeding in separate transactions (F6). | `:66-83` |
| `src/lib/api/route-helpers.ts` | `ZodError` → 500 (F5). | `:47-60` |
| `src/lib/workflows/definition-schema.ts` | No cycle detection and no check that `handlerKey` is registered; both are save-time-checkable. | `:84-127`, `:45` |
| `prisma/schema.prisma` | Unique `(workflowRunId, stepKey)` forbids loops (F7). | `:203` |
