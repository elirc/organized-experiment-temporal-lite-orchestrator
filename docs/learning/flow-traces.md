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
