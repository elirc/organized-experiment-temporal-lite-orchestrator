# Concepts Demonstrated

## Service layer
Where to look: [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts) — `startWorkflowRun()` owns the API-facing run-start use case without embedding SQL or HTTP details.
Also see: [src/services/workflow-definition-service.ts](../../src/services/workflow-definition-service.ts) for versioning rules.
Risk if wrong: Route handlers become thin wrappers around accidental business logic duplication.

## Repository pattern
Where to look: [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) — `listWorkflowRuns()`, `findWorkflowRunById()`, and `appendExecutionEvent()` isolate data access and scoping.
Also see: [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) for queue-specific persistence.
Risk if wrong: Query shape, includes, and scoping drift across callers and create inconsistent data exposure.

## Zod validation boundary
Where to look: [src/lib/validation/api-schemas.ts](../../src/lib/validation/api-schemas.ts) — `createWorkflowSchema`, `startWorkflowRunSchema`, and `approvalDecisionSchema` are the request boundary.
Also see: [src/lib/workflows/definition-schema.ts](../../src/lib/workflows/definition-schema.ts) for validating persisted workflow JSON itself.
Risk if wrong: Broken or malicious payloads reach services and fail much later in less obvious ways.

## Auth/session flow
Where to look: [src/lib/auth/session.ts](../../src/lib/auth/session.ts) — `createSession()` and `getUserFromSessionToken()` implement opaque DB-backed sessions.
Also see: [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts) for the login HTTP boundary.
Risk if wrong: Anonymous requests can impersonate users or expired sessions remain valid.

## Role-based access control
Where to look: [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts) — `rolePermissions` and `hasPermission()` define the access matrix.
Also see: [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) for `requireRequestUser()`.
Risk if wrong: Low-privilege users can trigger admin-only operations like workflow authoring or approval decisions.

## Ownership-based data isolation
Where to look: [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) — `buildRunVisibilityWhere()` scopes `VIEWER` reads to `startedById`.
Also see: [src/repositories/workflow-run-repository.test.ts](../../src/repositories/workflow-run-repository.test.ts) for the targeted test.
Risk if wrong: Run list/detail endpoints become cross-user data leaks.

## Status and state transitions
Where to look: [src/lib/workflows/run-state-machine.ts](../../src/lib/workflows/run-state-machine.ts) — `assertValidRunTransition()` and `assertValidStepTransition()` define legal transitions.
Also see: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) where `transitionRunStatus()` and `transitionStepStatus()` enforce those rules.
Risk if wrong: Completed runs could start moving again or retries could bypass valid lifecycle states.

## Background job design
Where to look: [src/services/worker-service.ts](../../src/services/worker-service.ts) — `processNextTask()` claims durable tasks, runs handlers, and reports results back to the engine.
Also see: [src/worker/index.ts](../../src/worker/index.ts) for the polling loop.
Risk if wrong: Work disappears on restart or multiple workers process the same task.

## Durable task leasing
Where to look: [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) — `claimNextAvailableTask()` uses `FOR UPDATE SKIP LOCKED`.
Also see: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) — `markTaskExecutionStarted()` and `failTaskStep()`.
Risk if wrong: Duplicate execution and impossible-to-debug race conditions under concurrency.

## Idempotency across retries
Where to look: [src/services/worker-service.ts](../../src/services/worker-service.ts) — `runIdempotentAction()` stores reusable results in `IdempotencyRecord`.
Also see: [prisma/schema.prisma](../../prisma/schema.prisma) — `model IdempotencyRecord`.
Risk if wrong: A retry can replay an external side effect after a crash or lease loss.

## Approval workflow design
Where to look: [src/services/approval-service.ts](../../src/services/approval-service.ts) — `submitApprovalDecision()` is the explicit approval use case.
Also see: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) — `resolveApprovalStep()` advances the workflow after the human decision.
Risk if wrong: Approval UI changes state without durable audit history or server-side authorization.

## Audit logging / execution history
Where to look: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) — calls to `appendExecutionEvent()` accompany run/step state changes.
Also see: [src/components/runs/run-detail.tsx](../../src/components/runs/run-detail.tsx) for how that history is surfaced.
Risk if wrong: Operators lose the evidence needed to explain why a run retried, paused, failed, or completed.

---

# Concepts in depth, with the code's real limits

The list above says where each concept lives. This part explains the mechanism using this repo's code, says how far the implementation goes, and gives a **Check** you can do to confirm it. Checks marked *(run)* were executed with plain `node` on code copied from the repo; their outputs are quoted exactly.

## 1. `FOR UPDATE SKIP LOCKED` as a queue claim

`src/repositories/task-repository.ts:55-74` runs one statement:

```sql
WITH candidate AS (
  SELECT id FROM "WorkflowTask"
  WHERE status = 'AVAILABLE' AND "availableAt" <= NOW()
  ORDER BY "availableAt" ASC, "createdAt" ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE "WorkflowTask" task
SET status = 'LEASED', "leaseOwner" = ..., "leaseToken" = ..., "leaseExpiresAt" = ..., "updatedAt" = NOW()
FROM candidate WHERE task.id = candidate.id
RETURNING task.*;
```

**Mechanism.** `FOR UPDATE` row-locks the candidate. `SKIP LOCKED` makes a second worker that hits a locked row skip it and pick the next one instead of waiting. Because the select and the update are one statement, there is no window where two workers both think they own the same row.

**Limit.** The lock lasts only for that statement. Ownership afterwards is the `LEASED` status, and nothing ever expires it (finding F1).

**Check.** Explain why the following would be wrong: `findFirst({ where: { status: "AVAILABLE" } })` followed by `update({ where: { id }, data: { status: "LEASED" } })`.
*Answer:* two workers can run the `findFirst` before either runs the `update`; both then "claim" the same row. The comment at `task-repository.ts:9` names exactly this mistake.

## 2. Exponential backoff, and what "jitter" means here

`src/lib/workflows/retry.ts:13-19`:

```ts
const rawDelay = initialDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1));
const jitter = Math.min(5_000, Math.floor(rawDelay * 0.1));
return Math.min(MAX_DELAY_MS, rawDelay + jitter);
```

**Mechanism.** Delay doubles per attempt, plus 10 % (capped at 5 s), capped overall at one hour.

**Limit.** Real jitter is *random*. This value is a deterministic function of the inputs, so two tasks with the same policy that fail together retry together. The comment "Jitter prevents synchronized retries from stampeding" (`retry.ts:17`) does not hold for this formula.

**Check (run).** With the starter's `fetch-account` policy (`initialDelayMs: 10000`, `src/lib/workflows/starter-definition.ts:10`), attempts 1, 2, 3 give:

```
delays [ 11000, 22000, 44000 ]
```

and `calculateRetryDelayMs(30000, 2)` returns the same value every time it is called. Also note `calculateRetryDelayMs(86_400_000, 1)` returns `3600000`: the schema allows a 24 h initial delay (`src/lib/workflows/definition-schema.ts:16`), but the cap silently shortens it to 1 h.

## 3. How many attempts does `maxAttempts: 3` give?

Trace: `markTaskExecutionStarted()` increments the step's `attemptCount` before the handler runs (`src/services/workflow-engine-service.ts:396-401`). `failTaskStep()` retries while `attemptCount < maxAttempts` (`:538`). So after attempt 1 fails, `1 < 3` retries; after attempt 2, `2 < 3` retries; after attempt 3, `3 < 3` is false and the run fails. **Three total attempts, two retries.**

**Check.** The demo input in `src/components/runs/run-launcher.tsx:17-19` sets `failOnceHandlers: ["notify-finished-webhook"]`. `shouldFailOnce()` (`src/worker/handlers/index.ts:35-38`) reads `task.attemptCount`, the *task's* counter, from the row loaded before `markTaskExecutionStarted()` runs, so it is `0` on the first attempt only. Predict the run's events: one `TASK_RETRIED` for `notify-finished`, then success. `notify-finished` has `maxAttempts: 2` (`starter-definition.ts:59`), so one retry is exactly enough.

## 4. Condition evaluation without `eval`

`src/lib/workflows/expression.ts:28-49` walks a dotted path and compares with a fixed operator set. No string is executed as code, which is the point of the header comment.

**Limits worth knowing (run):**

- A missing path gives `undefined`; `Number(undefined)` is `NaN`, and every `NaN` comparison is `false`. So `riskScore gte 70` on an empty context takes the **false** branch silently instead of failing.
- `gt/gte/lt/lte` coerce with `Number()`, so the string `"85"` passes `gte 70`.
- `eq/neq` use strict equality, so the string `"85"` does **not** `eq` the number `85`.

All three were asserted in the scratch test and passed.

**Check.** What does the starter workflow do for `accountId: "acct-4432"` (the launcher default)?
*Answer (run):* `hashToScore("acct-4432")` (`src/worker/handlers/index.ts:31-33`) is `61`, below 70, so `route-score` takes the false branch to `generate-summary` and the demo run never needs an approval. To see the approval path, choose an `accountId` whose character-code sum mod 100 is at least 70. (`"unknown-account"`, the fallback at `handlers/index.ts:41`, scores `78`.)

## 5. State machine as a guard, not a driver

`src/lib/workflows/run-state-machine.ts` is a lookup table; `transitionRunStatus()` and `transitionStepStatus()` call it before writing (`workflow-engine-service.ts:82`, `:114-116`).

**Subtlety.** Both helpers skip the check when `from === to` (`:72-80`, `:114`). That makes repeated writes harmless, but it also means a transition helper cannot detect "someone else already did this", which is part of why F3 is possible.

**Check (run).** `FAILED → QUEUED` is allowed for steps (the retry path), and `SUCCEEDED → RUNNING` / `FAILED → RUNNING` are not allowed for runs. There is no run-level retry: once a run is `FAILED`, no code path can revive it.

## 6. Idempotency at two levels

| Level | Key | Where | Guarantee |
| --- | --- | --- | --- |
| Run start | `${user.id}:${idempotencyKey}` | `src/services/workflow-run-service.ts:51-56` | Sequential duplicates return the original run. Concurrent duplicates: one wins, the other gets a 500 from the unique index (`prisma/schema.prisma:157`). |
| Side effect inside a handler | `${stepRunId}:${actionType}` | `src/services/worker-service.ts:37` | If a record exists, its stored response is reused. If the process dies after the effect but before the insert, the effect runs again. |

**Check.** Why is the run-start key prefixed with the user id?
*Answer:* without the prefix, user B choosing the same client key as user A would get user A's run back from `findWorkflowRunByIdempotencyKey()`, which does no visibility scoping (`src/repositories/workflow-run-repository.ts:87-101`). The prefix is a correctness fix *and* a data-isolation fix.

## Honesty note

These concepts were chosen because the code demonstrates them. Concepts the project name suggests but the code does not implement (replay, timers, heartbeats, cancellation, sagas or compensation) are deliberately not "taught" here; see the capability table in `docs/architecture/README.md`.
