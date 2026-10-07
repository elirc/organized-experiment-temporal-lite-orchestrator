# Request Lifecycle

Request: Start a workflow run from the Runs page
1. `src/app/api/workflow-runs/route.ts` — `POST()` calls `requireRequestUser(request, permissions.runsStart)` and parses `startWorkflowRunSchema`.
2. `src/lib/api/route-helpers.ts` — `requireRequestUser()` resolves the session token and enforces the `runs:start` permission.
3. `src/lib/validation/api-schemas.ts` — `startWorkflowRunSchema.parse()` validates `workflowDefinitionId`, `displayName`, `idempotencyKey`, and `input`.
4. `src/services/workflow-run-service.ts` — `startWorkflowRun()` scopes the idempotency key by user, loads the active workflow version, creates the `WorkflowRun`, and calls `seedRunExecution()`.
5. `src/services/workflow-engine-service.ts` — `seedRunExecution()` writes the `RUN_CREATED` event, then `createNextExecutableStep()` creates the first `WorkflowStepRun`.
6. `src/repositories/workflow-run-repository.ts` — `createWorkflowRun()` inserts the durable run row and `createWorkflowStepRun()` inserts the step row.
7. `src/repositories/task-repository.ts` — `createWorkflowTask()` inserts the worker queue row when the first step is `API_CALL` or `JOB`.
8. Returns `201` with the created run aggregate.

Request: Create a new workflow definition version
1. `src/app/api/workflows/route.ts` — `POST()` calls `requireRequestUser(request, permissions.workflowsWrite)` and parses `createWorkflowSchema`.
2. `src/lib/api/route-helpers.ts` — `requireRequestUser()` blocks non-admin roles before any workflow JSON is processed.
3. `src/lib/validation/api-schemas.ts` — `createWorkflowSchema.parse()` validates top-level fields and delegates `definition` to `workflowDefinitionSchema`.
4. `src/lib/workflows/definition-schema.ts` — `workflowDefinitionSchema.superRefine()` validates duplicate step keys, `initialStepKey`, and graph edges.
5. `src/services/workflow-definition-service.ts` — `createWorkflowDefinitionVersion()` decides whether to create a brand-new definition or retire the current active version and write a new one.
6. `src/repositories/workflow-definition-repository.ts` — `retireWorkflowVersions()`, `updateWorkflowDefinitionMetadata()`, and `createWorkflowVersion()` persist the new active version.
7. Returns `201` with the definition/version pair.

Request: Reject an unauthorized approval decision
1. `src/app/api/approvals/[approvalId]/decision/route.ts` — `POST()` tries to authorize the caller before parsing the decision body.
2. `src/lib/api/route-helpers.ts` — `requireRequestUser(request, permissions.approvalsDecide)` rejects a `VIEWER` or `OPERATOR` with `ApiError(403, ...)`.
3. `src/lib/api/route-helpers.ts` — `jsonError()` converts that exception into the HTTP response.
4. Returns `403` with `{ error: { message: "You do not have permission to perform this action.", details: null } }`.

Request: Resolve an approval and continue the workflow
1. `src/app/api/approvals/[approvalId]/decision/route.ts` — `POST()` authorizes the caller and parses `approvalDecisionSchema`.
2. `src/lib/validation/api-schemas.ts` — `approvalDecisionSchema.parse()` validates `decision` and optional `comment`.
3. `src/services/approval-service.ts` — `submitApprovalDecision()` re-checks that the role is `APPROVER` or `ADMIN`, then calls `resolveApprovalStep()`.
4. `src/services/workflow-engine-service.ts` — `resolveApprovalStep()` loads the approval aggregate, updates `ApprovalRequest`, writes `ApprovalDecision`, marks the step complete, transitions the run back to `RUNNING`, and calls `createNextExecutableStep()`.
5. `src/repositories/approval-repository.ts` — `resolveApprovalRequest()` and `createApprovalDecision()` persist the human decision.
6. `src/repositories/workflow-run-repository.ts` — `updateWorkflowStepRun()` and `appendExecutionEvent()` persist step state and history.
7. `src/repositories/task-repository.ts` — `createWorkflowTask()` is called if the next step is executable by a worker.
8. Returns `200` with the updated run aggregate.

## Not an HTTP request: one worker iteration, with line numbers

Most of the interesting work in this repo happens outside HTTP. This is one pass of the worker loop for a task that succeeds. Transaction boundaries are marked because they decide what survives a crash.

| # | Location | What happens | Transaction |
| --- | --- | --- | --- |
| 1 | `src/worker/index.ts:30-33` | `processNextTask({ handlers: taskHandlers, workerId })` | none |
| 2 | `src/repositories/task-repository.ts:55-74` | CTE selects the oldest `AVAILABLE` row with `availableAt <= NOW()`, `FOR UPDATE SKIP LOCKED`, and updates it to `LEASED` with owner, token and expiry | **T1** (single statement, autocommit) |
| 3 | `src/services/worker-service.ts:76` | Re-reads the task with its step, run and version (`findWorkflowTaskById`) | none |
| 4 | `worker-service.ts:82-92` | Missing handler: jumps to `failTaskStep()` (finding F2) | see step 9 |
| 5 | `worker-service.ts:94` → `src/services/workflow-engine-service.ts:384-430` | `markTaskExecutionStarted()`: increments task and step `attemptCount`, step `QUEUED → RUNNING`, appends `TASK_LEASED` | **T2** |
| 6 | `worker-service.ts:98-103` | Handler runs. Side effects go through `runOnce()`, which reads `IdempotencyRecord`, runs the factory, then inserts the record | **T3** per `runOnce` call (`worker-service.ts:48-55`), committed *after* the side effect |
| 7 | `worker-service.ts:105-110` → `workflow-engine-service.ts:432-500` | `completeTaskStep()`: task `COMPLETED`, step `SUCCEEDED`, `contextPatch` merged into `WorkflowRun.context`, next step created | **T4** |
| 8 | `workflow-engine-service.ts:496` → `:339-361` | `createNextExecutableStep()` creates the next step row and, for task steps, a new `WorkflowTask` in the same T4 | inside T4 |
| 9 | (failure path) `worker-service.ts:113-122` → `workflow-engine-service.ts:502-595` | `failTaskStep()`: step `RUNNING → FAILED`; then either task `FAILED` + run `FAILED`, or task back to `AVAILABLE` with a later `availableAt` and step `FAILED → QUEUED` | **T5** |

**What survives a crash at each gap**

- Between T1 and T2: the task is `LEASED`, the step is still `QUEUED`. Nothing reclaims it (F1).
- Between T2 and the end of step 6: step `RUNNING`, task `LEASED`. Same outcome.
- Inside step 6, after the side effect but before T3 commits: the effect happened and no record exists. If the task were ever retried, the effect would run again. The comment at `worker-service.ts:44` is honest about external APIs; the gap applies to every handler.
- Between T3 and T4: the record exists, so a retry would reuse the stored response, *if* anything retried the task. Today nothing does (F1).

The engine is careful *inside* each transaction. The weak points are the gaps *between* transactions, where it relies on a recovery process that has not been written.

## Request: concurrent decisions on one approval (what really happens)

The "Resolve an approval" trace above is the single-user path. With two simultaneous callers:

1. Both requests pass `requireRequestUser(..., approvalsDecide)` (`src/app/api/approvals/[approvalId]/decision/route.ts:24`).
2. Both call `findApprovalById()` outside any transaction and both see `status: "PENDING"` (`workflow-engine-service.ts:603-611`).
3. Both open `db.$transaction`. Each calls `findWorkflowRunAggregateById()`, which uses the global `db` client (`src/repositories/workflow-run-repository.ts:130-131`), so the read happens on a different connection from the transaction's writes.
4. `resolveApprovalRequest()` updates `where: { id }` (`src/repositories/approval-repository.ts:82-85`). Postgres row locking makes the second update wait for the first commit, then **proceed**, because nothing re-checks the status.
5. `transitionStepStatus(currentStep, "SUCCEEDED")` passes either way. If the second request read the step before the first committed, `WAITING_APPROVAL → SUCCEEDED` is legal. If it read it afterwards, the status already equals the target and the check is skipped (`workflow-engine-service.ts:114-116`). `transitionRunStatus()` has the same equal-status shortcut (`:72-80`).
6. If both decisions are the same, the second `createNextExecutableStep()` collides on `@@unique([workflowRunId, stepKey])` and that request gets a 500. If one approves and one rejects, both next steps are created.

**Fix sketch (not implemented):** make the guard part of the write, e.g. `updateMany({ where: { id, status: "PENDING" } })` inside the transaction and abort when `count === 0`. That turns the check-then-act into one atomic compare-and-set.

## Error status codes you will actually see

| Cause | Status | Why |
| --- | --- | --- |
| No or expired session cookie | 401 | `requireRequestUser()` (`src/lib/api/route-helpers.ts:32-34`) |
| Role lacks the permission | 403 | `route-helpers.ts:36-38` |
| Unknown run / approval / task | 404 | `ApiError(404, ...)` in services |
| Approval already resolved (sequential case) | 409 | `workflow-engine-service.ts:609-611` |
| Request body fails a Zod schema | **500** | `ZodError` is not an `ApiError`; `jsonError()` treats it as unexpected (`route-helpers.ts:47-60`) |
| Unique-constraint race (duplicate start, duplicate step key) | **500** | Prisma error, also not an `ApiError` |
