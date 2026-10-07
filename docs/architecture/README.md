# Architecture Overview

Flowkeeper is a Temporal-lite orchestration app built as one Next.js codebase with a separate worker entrypoint. The web app owns the REST API and monitoring UI, while the worker in [src/worker/index.ts](../../src/worker/index.ts) leases durable tasks from PostgreSQL and pushes results back through [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts).

## Folder map

- `prisma/`
  `schema.prisma` in [prisma/schema.prisma](../../prisma/schema.prisma) defines users, sessions, workflow definitions, runs, step runs, approval requests, tasks, idempotency records, and execution events. `seed.ts` in [prisma/seed.ts](../../prisma/seed.ts) creates demo users and a sample workflow version.
- `src/app/api/`
  Route handlers like [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) and [src/app/api/approvals/[approvalId]/decision/route.ts](../../src/app/api/approvals/[approvalId]/decision/route.ts) form the HTTP boundary. They do auth, Zod parsing, then delegate to services.
- `src/lib/`
  Shared infrastructure lives here: [src/lib/auth/session.ts](../../src/lib/auth/session.ts) for DB-backed sessions, [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) for guard/error helpers, [src/lib/workflows/definition-schema.ts](../../src/lib/workflows/definition-schema.ts) for validating persisted workflow JSON, and [src/lib/workflows/run-state-machine.ts](../../src/lib/workflows/run-state-machine.ts) for allowed status transitions.
- `src/repositories/`
  Data access is isolated here. Examples: [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) owns scoped run reads and step/event writes, while [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) owns durable queue reads plus the `FOR UPDATE SKIP LOCKED` claim query.
- `src/services/`
  Business logic lives here. [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts) starts runs, [src/services/workflow-definition-service.ts](../../src/services/workflow-definition-service.ts) versions workflow definitions, [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) advances steps and run state, [src/services/approval-service.ts](../../src/services/approval-service.ts) resolves approvals, and [src/services/worker-service.ts](../../src/services/worker-service.ts) bridges leased tasks to handlers.
- `src/worker/`
  [src/worker/handlers/index.ts](../../src/worker/handlers/index.ts) registers task handlers, and [src/worker/index.ts](../../src/worker/index.ts) runs the polling loop.
- `src/components/` and `src/hooks/`
  The UI is thin. Hooks like [src/hooks/use-runs.ts](../../src/hooks/use-runs.ts) call the REST API through [src/lib/api/client.ts](../../src/lib/api/client.ts), and components like [src/components/runs/run-detail.tsx](../../src/components/runs/run-detail.tsx) render server-owned data instead of embedding business logic.

## Why Prisma and REST

Prisma was chosen over Drizzle because this project’s teaching value depends on moving quickly across a fairly relational schema with nested includes, enums, and migrations. The raw SQL worker lease in [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) still shows where Prisma stops and lower-level database control begins.

REST was chosen over tRPC because the route handlers themselves are part of the learning artifact. Files like [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) make the request path, auth boundary, validation boundary, and returned shape explicit in a way that is easy to trace.

## How to run it (from `package.json`)

| Script | Command | What it does |
| --- | --- | --- |
| `dev` | `next dev` | Web app + REST API |
| `worker` | `tsx src/worker/index.ts` | The background poller. **Without it, no `API_CALL`/`JOB` step ever executes**; runs sit at their first task step. |
| `seed` | `tsx prisma/seed.ts` | Upserts four users (`admin@`, `operator@`, `approver@`, `viewer@example.com`, all with password `password123`, `prisma/seed.ts:69-83`) and a sample workflow |
| `test` | `vitest run` | Four test files, one `it` each (see `docs/learning/testing-rationale.md`) |

The worker imports `src/lib/env.ts`, which requires `DATABASE_URL` and a `SESSION_SECRET` of at least 16 characters (`src/lib/env.ts:3-7`). `SESSION_SECRET` is validated but never read anywhere else: sessions are random tokens hashed with SHA-256 (`src/lib/auth/session.ts:21-28`), not signed values. The `jose` dependency in `package.json` is likewise not imported by any file under `src/`.

## What "Temporal-lite" actually means in this codebase

The name invites a comparison with Temporal. This section is the verified answer to "which of those guarantees does this code really give you?" Every row was checked against the source.

| Capability | Real Temporal | This repo | Evidence |
| --- | --- | --- | --- |
| Separate worker process | Yes | **Yes.** A `while` loop polls Postgres every 2 s when idle, 250 ms after doing work | `src/worker/index.ts:29-42` |
| Exclusive task claim | Task-queue matching | **Yes.** `FOR UPDATE SKIP LOCKED` in a CTE plus `UPDATE ... RETURNING` | `src/repositories/task-repository.ts:55-74` |
| Reclaiming tasks from crashed workers | Heartbeats and start-to-close timeouts | **No.** The claim only selects `status = 'AVAILABLE'` (`task-repository.ts:59`). `leaseExpiresAt` is written but no code reads it to reclaim a `LEASED` row | `grep -rn leaseExpiresAt src` finds only writes |
| Event history | Source of truth; state rebuilt by replay | **Audit log only.** `ExecutionEvent` rows are appended beside the mutable `WorkflowRun`/`WorkflowStepRun` rows; nothing reads them back to rebuild state | `src/repositories/workflow-run-repository.ts:223-240` |
| Deterministic replay | Yes | **No.** There is no workflow code to replay; a run is a JSON graph walked by `createNextExecutableStep()` | `src/services/workflow-engine-service.ts:339-361` |
| Retry with backoff and jitter | Yes | **Partly.** Exponential backoff capped at 1 h, but the "jitter" is a fixed 10 % of the delay (max 5 s), so tasks that failed together retry together | `src/lib/workflows/retry.ts:13-19` |
| Bounded retries | `MaximumAttempts` | **Yes for handler errors; no for unregistered handlers** (finding F2) | `workflow-engine-service.ts:538`, `src/services/worker-service.ts:84-92` |
| Durable timers / sleep | Yes | **No.** `WorkflowRun.nextWakeAt` is written on retry (`workflow-engine-service.ts:575-579`) and never read. Delayed retries work only because the claim filters `"availableAt" <= NOW()` | `task-repository.ts:60` |
| Human-in-the-loop | Signals | **Yes, as rows.** `ApprovalRequest` / `ApprovalDecision`, resolved through an HTTP endpoint | `workflow-engine-service.ts:597-687` |
| Activity idempotency | User-supplied | **Best effort.** `runOnce()` stores a handler result under `stepRunId:actionType`, but only *after* the side effect returns, so a crash between the two re-runs the effect | `src/services/worker-service.ts:32-67` |
| Cancellation | Yes | **No.** `CANCELLED` is legal in the transition table (`src/lib/workflows/run-state-machine.ts:14-16`) but nothing sets it. `runs:repair` is granted to `OPERATOR` but no route checks it | `src/lib/auth/permissions.ts:18,31` |
| Versioning | Worker versioning / patching | **Yes, simply.** A run is pinned to the `WorkflowVersion` active at start; a new version retires the old active one | `src/services/workflow-run-service.ts:58-76`, `src/services/workflow-definition-service.ts:67-84` |

**Honest summary:** this is a durable *job queue with a state machine and an audit log*, which is well worth studying. It is not a durable-execution engine: it has no replay, no lease recovery, no timers and no cancellation. The other docs have been corrected wherever they implied more.

## Verified findings (read these before changing the engine)

"Reproduced" means the logic was copied into a plain Node script and run (see `docs/learning/testing-rationale.md`). "Traced" means it was followed through the code by hand; showing it end to end needs PostgreSQL.

- **F1: a crashed worker leaves the run stuck for good (Traced).** `claimNextAvailableTask()` sets `status = 'LEASED'` (`task-repository.ts:66`). Only `completeTaskStep()` (`workflow-engine-service.ts:470-475`) and `failTaskStep()` (`:541-547`, `:557-564`) move a task out of `LEASED`. If the process dies between claim and either call, nothing reclaims the row. The run stays `RUNNING` forever.
- **F2: an unregistered handler retries forever (Reproduced).** When `deps.handlers[handlerKey]` is missing, `processNextTask()` calls `failTaskStep()` *without* first calling `markTaskExecutionStarted()` (`worker-service.ts:82-92`). The step's `attemptCount` only increments inside `markTaskExecutionStarted()` (`workflow-engine-service.ts:396-401`), so the guard `failedStep.attemptCount < failedStep.maxAttempts` (`:538`) is `0 < maxAttempts` on every pass. The task is re-queued with the same delay each time and never reaches `FAILED`.
- **F3: two simultaneous approval decisions can both apply (Traced).** The `status !== "PENDING"` check runs *before* the transaction, on a separate read (`workflow-engine-service.ts:603-611`). Inside the transaction, `resolveApprovalRequest()` updates by `id` alone with no `status: "PENDING"` guard (`src/repositories/approval-repository.ts:77-86`), and `findWorkflowRunAggregateById()` reads through the global `db` client rather than `tx` (`workflow-run-repository.ts:130-148`). If Approve and Reject arrive together, both transactions can pass. In the starter workflow the two branches have different step keys (`generate-summary` vs `notify-rejected`, `src/lib/workflows/starter-definition.ts:33`), so `@@unique([workflowRunId, stepKey])` does not save you: both branches get enqueued.
- **F4: `requiredRole` is shown but not enforced on decisions (Traced).** `listPendingApprovals()` filters non-admins by `requiredRole` (`approval-repository.ts:16-20`), but `submitApprovalDecision()` only checks that the caller is `APPROVER` or `ADMIN` (`src/services/approval-service.ts:29-31`). An `APPROVER` who knows the id of an approval with `approvalRole: "ADMIN"` can resolve it by calling the endpoint directly.
- **F5: validation errors come back as HTTP 500 (Traced).** Routes call `schema.parse()` (for example `src/app/api/workflow-runs/route.ts:32`). A `ZodError` is not an `ApiError`, so `jsonError()` falls through to the generic `500 Internal server error` branch (`src/lib/api/route-helpers.ts:47-60`). Bad client input is reported as a server fault.
- **F6: run creation and first-step scheduling are two transactions (Traced).** `createWorkflowRun()` commits in one `$transaction` (`workflow-run-service.ts:66-77`); `seedRunExecution()` opens another (`workflow-engine-service.ts:367-381`). The comment at `workflow-run-service.ts:79` says a crash in between leaves "a durable record to repair", but no repair code exists, and a retry with the same idempotency key just returns the stuck `PENDING` run (`:52-56`).
- **F7: a workflow cannot visit the same step twice (Traced).** `WorkflowStepRun` has `@@unique([workflowRunId, stepKey])` (`prisma/schema.prisma:203`). The validator checks unknown targets and duplicate keys but not cycles (`src/lib/workflows/definition-schema.ts:84-127`), so a looping definition saves fine and then fails on a unique-constraint error the second time a run reaches the repeated step.

## About these docs

The architecture and learning docs were roughly doubled in this revision (about 5.8k to about 12.6k words). The added material is limited to what the code supports: line-referenced traces, verified findings, and checks that were actually run. The codebase is about 4,400 lines of TypeScript (including seed and config files), so a larger expansion would have meant padding or speculation; it was capped here deliberately.
