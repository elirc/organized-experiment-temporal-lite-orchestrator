# Flow Traces

## Flow: Create workflow version
1. `src/components/workflows/workflow-creator.tsx` — form submit calls `useCreateWorkflow().mutateAsync()`.
2. `src/hooks/use-workflows.ts` — `useCreateWorkflow()` issues `POST /api/workflows`.
3. `src/app/api/workflows/route.ts` — `POST()` authorizes with `requireRequestUser()` and parses `createWorkflowSchema`.
4. `src/lib/api/route-helpers.ts` — `requireRequestUser()` checks the session and `permissions.workflowsWrite`.
5. `src/lib/validation/api-schemas.ts` — `createWorkflowSchema.parse()` validates top-level request shape.
6. `src/lib/workflows/definition-schema.ts` — `workflowDefinitionSchema.superRefine()` validates the workflow graph.
7. `src/services/workflow-definition-service.ts` — `createWorkflowDefinitionVersion()` decides new definition vs new version.
8. `src/repositories/workflow-definition-repository.ts` — `findWorkflowDefinitionByKey()`, `retireWorkflowVersions()`, `updateWorkflowDefinitionMetadata()`, and `createWorkflowVersion()` persist the result.
9. Returns `201` with the created definition/version pair.

## Flow: Start workflow run
1. `src/components/runs/run-launcher.tsx` — form submit calls `useStartWorkflowRun().mutateAsync()`.
2. `src/hooks/use-runs.ts` — `useStartWorkflowRun()` issues `POST /api/workflow-runs`.
3. `src/app/api/workflow-runs/route.ts` — `POST()` checks `permissions.runsStart` and parses `startWorkflowRunSchema`.
4. `src/services/workflow-run-service.ts` — `startWorkflowRun()` scopes the idempotency key, loads the active version, and creates the run row.
5. `src/repositories/workflow-definition-repository.ts` — `findActiveWorkflowVersionForDefinition()` resolves the active workflow version.
6. `src/repositories/workflow-run-repository.ts` — `createWorkflowRun()` inserts the durable run.
7. `src/services/workflow-engine-service.ts` — `seedRunExecution()` writes the initial run event and calls `createNextExecutableStep()`.
8. `src/repositories/workflow-run-repository.ts` — `createWorkflowStepRun()` inserts the first step row and `appendExecutionEvent()` records history.
9. `src/repositories/task-repository.ts` — `createWorkflowTask()` inserts the task when the step is worker-executable.
10. Returns `201` with the run aggregate.

## Flow: Worker executes a task and advances the workflow
1. `src/worker/index.ts` — `main()` calls `processNextTask()` in a loop.
2. `src/services/worker-service.ts` — `processNextTask()` calls `claimNextAvailableTask()` and loads the hydrated task aggregate.
3. `src/repositories/task-repository.ts` — `claimNextAvailableTask()` leases one row with `FOR UPDATE SKIP LOCKED`.
4. `src/services/workflow-engine-service.ts` — `markTaskExecutionStarted()` increments attempt counters and moves the step from `QUEUED` to `RUNNING`.
5. `src/worker/handlers/index.ts` — the registered handler runs, usually through `runOnce()` for side-effect dedupe.
6. `src/services/worker-service.ts` — on success it calls `completeTaskStep()`.
7. `src/services/workflow-engine-service.ts` — `completeTaskStep()` marks the task complete, marks the step `SUCCEEDED`, merges `contextPatch`, and calls `createNextExecutableStep()`.
8. `src/lib/workflows/expression.ts` — `evaluateCondition()` runs if the next step is `CONDITION`.
9. `src/repositories/workflow-run-repository.ts` — `updateWorkflowStepRun()`, `updateWorkflowRun()`, and `appendExecutionEvent()` persist the new state/history.
10. Returns control to the worker loop, which polls again.

## Flow: Approval decision resumes a waiting run
1. `src/components/approvals/approval-queue.tsx` — click handler calls `useSubmitApprovalDecision().mutate()`.
2. `src/hooks/use-approvals.ts` — `useSubmitApprovalDecision()` issues `POST /api/approvals/[approvalId]/decision`.
3. `src/app/api/approvals/[approvalId]/decision/route.ts` — `POST()` authorizes and parses `approvalDecisionSchema`.
4. `src/services/approval-service.ts` — `submitApprovalDecision()` enforces approver/admin roles.
5. `src/services/workflow-engine-service.ts` — `resolveApprovalStep()` loads the approval aggregate, writes `ApprovalDecision`, completes the approval step, and transitions the run back to `RUNNING`.
6. `src/repositories/approval-repository.ts` — `resolveApprovalRequest()` and `createApprovalDecision()` persist the human action.
7. `src/services/workflow-engine-service.ts` — `createNextExecutableStep()` decides whether to enqueue a task, wait again, branch, or complete the run.
8. Returns the updated run aggregate.

## Flow: Permission rejection on approvals endpoint
1. `src/app/api/approvals/[approvalId]/decision/route.ts` — `POST()` immediately calls `requireRequestUser(request, permissions.approvalsDecide)`.
2. `src/lib/api/route-helpers.ts` — `requireRequestUser()` calls `getUserFromSessionToken()` and checks `hasPermission()`.
3. `src/lib/auth/permissions.ts` — `hasPermission("VIEWER", permissions.approvalsDecide)` returns `false`.
4. `src/lib/api/route-helpers.ts` — `requireRequestUser()` throws `new ApiError(403, ...)`.
5. `src/lib/api/route-helpers.ts` — `jsonError()` converts the exception into a `403` JSON response.
6. No service or repository code runs.

## Flow: Invalid workflow graph rejected before persistence
1. `src/components/workflows/workflow-creator.tsx` — form submit sends JSON text to the server without trusting the client-side parse alone.
2. `src/hooks/use-workflows.ts` — `useCreateWorkflow()` issues `POST /api/workflows`.
3. `src/app/api/workflows/route.ts` — `POST()` parses `createWorkflowSchema`.
4. `src/lib/validation/api-schemas.ts` — `createWorkflowSchema` delegates `definition` to `workflowDefinitionSchema`.
5. `src/lib/workflows/definition-schema.ts` — `workflowDefinitionSchema.superRefine()` detects a missing target step or duplicate key and throws.
6. `src/lib/api/route-helpers.ts` — `jsonError()` returns a non-2xx response.
7. `src/services/workflow-definition-service.ts` and `src/repositories/workflow-definition-repository.ts` are never called.

## Flow: Handler fails and is retried (with line numbers)

The demo launcher input asks `notify-finished-webhook` to fail once (`src/components/runs/run-launcher.tsx:17-19`). This is the path that failure takes.

1. `src/worker/handlers/index.ts:84-86` — `notifyWebhook()` sees `shouldFailOnce(task)` is true (task `attemptCount === 0`) and throws `Simulated first-attempt failure for notify-finished-webhook.`
2. `src/services/worker-service.ts:113-120` — the `catch` turns the error into a message and calls `failTaskStep()`.
3. `src/services/workflow-engine-service.ts:513-524` — inside a transaction, reloads the run aggregate and finds the step.
4. `workflow-engine-service.ts:526-536` — step `RUNNING → FAILED`, `lastError` stored, `STEP_STATUS_CHANGED` event appended.
5. `workflow-engine-service.ts:538` — `attemptCount` is 1 and `maxAttempts` is 2 (`src/lib/workflows/starter-definition.ts:59`), so retry.
6. `workflow-engine-service.ts:552-554` — `nextAttemptAt = now + calculateRetryDelayMs(60000, 1)`, which is 65 000 ms (60 000 plus jitter capped at 5 000).
7. `workflow-engine-service.ts:557-564` — the **same** task row goes back to `AVAILABLE` with `availableAt = nextAttemptAt`; lease fields cleared.
8. `workflow-engine-service.ts:566-573` — step `FAILED → QUEUED`.
9. `workflow-engine-service.ts:575-591` — run gets `lastError` and `nextWakeAt`; `TASK_RETRIED` event appended.
10. About 65 s later, `claimNextAvailableTask()` (`src/repositories/task-repository.ts:60`) sees `availableAt <= NOW()` and leases the task again. `shouldFailOnce` is now false (task `attemptCount` is 1), so the webhook "succeeds" and `completeTaskStep()` finishes the run.

What the run detail page shows during the wait: run status stays `RUNNING` (the run is never moved to a "retrying" state), step status `QUEUED`, `lastError` populated.

## Flow: Handler key has no registered handler (the infinite loop)

1. A workflow version is saved with `handlerKey: "send-invoice"`. `definition-schema.ts:45` only requires a non-empty string; nothing checks it against `taskHandlers` (`src/worker/handlers/index.ts:109-114`).
2. A run reaches that step; `createTaskStep()` enqueues it (`workflow-engine-service.ts:166-221`).
3. `processNextTask()` claims it, finds no handler (`worker-service.ts:82-84`) and calls `failTaskStep()` straight away, skipping `markTaskExecutionStarted()`.
4. Step `QUEUED → FAILED` (legal: `run-state-machine.ts:24`). `attemptCount` is still 0, so `0 < maxAttempts`: retry.
5. `calculateRetryDelayMs(backoff, 0)` uses `Math.max(0, attemptNumber - 1)`, so the delay is the same as attempt 1 and never grows.
6. Steps 3-5 repeat indefinitely, appending three events per pass (two `STEP_STATUS_CHANGED`, one `TASK_RETRIED`).

A scratch model of the guard at `:538` scheduled 50 retries in 50 iterations with no stopping condition (see the testing doc).

## Flow: Worker process killed mid-task (no recovery)

1. Worker A claims task T: T is `LEASED`, `leaseOwner = A`, `leaseExpiresAt = now + 30 s` (`task-repository.ts:66-69`; default lease `30_000` at `worker-service.ts:70`).
2. A calls `markTaskExecutionStarted()`: step `RUNNING`.
3. A is killed (deploy, OOM, Ctrl-C twice) before `completeTaskStep()`.
4. Worker B polls. Its claim selects only `status = 'AVAILABLE'` (`task-repository.ts:59`). T is never selected again.
5. The run detail page shows the run `RUNNING` and the step `RUNNING` with `workerId = A`, indefinitely.

Note that SIGINT/SIGTERM are handled gracefully: they set `shouldContinue = false` (`src/worker/index.ts:47-53`), and the loop finishes the current iteration before exiting. Only a hard kill or a crash produces this flow.

## Debugging scenarios

Each starts from a symptom an operator would actually see and ends at a line of code.

**Scenario A: "My run has been RUNNING for an hour and nothing is happening."**
1. Open run detail. Look at the last step's status and the last event.
2. Step `QUEUED`, last event `TASK_ENQUEUED` or `TASK_RETRIED`: check that a worker process is running at all (`npm run worker`). The web app never executes tasks.
3. Step `QUEUED`, `availableAt` in the future: it is waiting out backoff. Compute the expected delay with `calculateRetryDelayMs`.
4. Step `RUNNING`, `workerId` set, no recent events: the worker that leased it died (flow above). The fix today is manual SQL: set the task back to `AVAILABLE` and the step back to `QUEUED`. Note that `QUEUED` is not reachable from `RUNNING` in the transition table (`run-state-machine.ts:25`), so the application cannot do this repair for you.
5. Many `TASK_RETRIED` events with `attemptCount` stuck at 0: unregistered handler key (infinite-loop flow above).

**Scenario B: "Approver says the approval isn't in their queue."**
1. Check the approval's `requiredRole`. `listPendingApprovals()` shows non-admins only rows matching their role (`src/repositories/approval-repository.ts:17-20`).
2. Check the run actually reached the approval step: with the starter workflow, only runs whose `riskScore >= 70` go there (`starter-definition.ts:16-26`).

**Scenario C: "Starting a run with a typo in the JSON gives 'Internal server error'."**
That is finding F5: a `ZodError` from `startWorkflowRunSchema.parse()` reaches `jsonError()`'s generic branch (`src/lib/api/route-helpers.ts:55-60`). The server log will show the Zod issues via `console.error(error)` at `:55`; the client will not.

**Scenario D: "The worker exited with code 1."**
Any exception outside the handler `try` (database unreachable during the claim, `markTaskExecutionStarted()` throwing) reaches `main().catch` and calls `process.exit(1)` (`src/worker/index.ts:55-58`). Restart it under a supervisor; the loop has no internal retry.
