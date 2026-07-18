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
