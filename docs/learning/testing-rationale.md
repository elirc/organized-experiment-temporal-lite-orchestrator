# Testing Rationale

## `src/lib/api/route-helpers.test.ts` — `rejects an authenticated viewer from an approvals-protected endpoint`
This test matters because `requireRequestUser()` in [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) is the shared auth gate used by protected route handlers. If the permission check regressed here, a whole class of endpoints could quietly become callable by the wrong role. The production bug this guards against is not “one approval page looks wrong”; it is “the server accepts a privileged mutation from an unprivileged user.”

A more thorough production test suite would also exercise real route handlers like [src/app/api/approvals/[approvalId]/decision/route.ts](../../src/app/api/approvals/[approvalId]/decision/route.ts) end-to-end with session cookies and assert the full JSON error shape.

## `src/lib/workflows/definition-schema.test.ts` — `rejects a workflow that points at an undefined next step`
This test matters because a broken workflow graph is much more expensive to discover at runtime than at save time. Without this validation, the system can accept a definition that looks fine until a live run reaches the missing branch hours later. The production bug this guards against is “workflow save succeeds, but execution crashes deep into a real customer run.”

A more thorough production test suite would add positive/negative cases for duplicate step keys, invalid `initialStepKey`, malformed approval branches, and invalid condition branch pairs.

## `src/lib/workflows/run-state-machine.test.ts` — `rejects moving a completed run back to running`
This test matters because terminal-state corruption is one of the easiest ways to make orchestration behavior impossible to reason about. If `SUCCEEDED -> RUNNING` becomes legal by accident, retries, dashboards, and audit history all start telling conflicting stories. The production bug this guards against is silent lifecycle drift where repairs or retries resurrect runs that should be immutable.

A more thorough production test suite would cover both run and step transitions, including allowed transitions around retries (`RUNNING -> FAILED -> QUEUED`) and approval waits (`RUNNING -> WAITING_APPROVAL -> RUNNING`).

## `src/repositories/workflow-run-repository.test.ts` — `scopes viewer reads to runs they started while leaving admin reads unscoped`
This test matters because ownership scoping is a security boundary, not just a UI preference. `buildRunVisibilityWhere()` in [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) is the place where a low-privilege user is prevented from reading someone else’s run. The production bug this guards against is a direct cross-user data leak in the runs list or detail endpoint.

A more thorough production test suite would run repository integration tests against a real PostgreSQL database with seeded users/runs, then assert that list and detail queries never return rows outside the caller’s scope.

## Inventory (counted)

`git ls-files | grep '\.test\.'` lists four files, and each contains exactly one `it(...)`:

| File | Test | Touches DB? | Mocks |
| --- | --- | --- | --- |
| `src/lib/api/route-helpers.test.ts` | rejects an authenticated viewer from an approvals-protected endpoint | No | `vi.mock("@/lib/auth/session")` |
| `src/lib/workflows/definition-schema.test.ts` | rejects a workflow that points at an undefined next step | No | none |
| `src/lib/workflows/run-state-machine.test.ts` | rejects moving a completed run back to running | No | none |
| `src/repositories/workflow-run-repository.test.ts` | scopes viewer reads to runs they started while leaving admin reads unscoped | No (tests the pure `buildRunVisibilityWhere()`) | none |

Nothing tests `workflow-engine-service.ts` (687 lines, the largest file in `src/`), `worker-service.ts`, the SQL claim, or any route handler end to end. Every finding in `docs/architecture/README.md` sits in untested code.

## A dependency-free Check ladder you can run today

The project's own tests need `vitest` and the installed dependencies. The pure functions below have no imports, so they can be copied into a scratch file and run with Node's built-in runner (`node --test file.mjs`). This was done for these docs; the outputs below are copied from that run, in which all six tests passed.

**Rung 1: retry math.** Copy `calculateRetryDelayMs` from `src/lib/workflows/retry.ts:11-19`.
*Goal:* predict the delays for `initialDelayMs = 10000`, attempts 1-3.
**Check:** `delays [ 11000, 22000, 44000 ]`. Also `calculateRetryDelayMs(10000, 0) === 11000` (attempt 0 and attempt 1 are identical) and `calculateRetryDelayMs(86_400_000, 1) === 3600000` (the 1 h cap).

**Rung 2: the jitter claim.** *Goal:* decide whether the formula desynchronizes retries.
**Check:** calling `calculateRetryDelayMs(30000, 2)` twice returns the same number. Deterministic "jitter" cannot spread out simultaneous retries.

**Rung 3: transition table.** Copy `runTransitions` / `stepTransitions` from `src/lib/workflows/run-state-machine.ts:13-30`.
**Check:** `stepTransitions.FAILED` includes `QUEUED`; `runTransitions.SUCCEEDED` and `runTransitions.FAILED` are both empty. This extends the shipped test (which only checks `SUCCEEDED → RUNNING`) to the retry path its own rationale asks for.

**Rung 4: the missing-handler loop.** *Goal:* model the guard at `src/services/workflow-engine-service.ts:538` when `attemptCount` never increments.
**Check:** a loop of 50 iterations evaluating `attemptCount < maxAttempts` with `attemptCount = 0, maxAttempts = 3` printed `retries scheduled in 50 polls: 50`. Nothing in the guard ends the loop. (This models the logic only; it does not run Prisma.)

**Rung 5: condition edge cases.** Copy `getPathValue` and `evaluateCondition` from `src/lib/workflows/expression.ts:18-49`.
**Check:** empty context with `riskScore gte 70` → `false`; context `{ riskScore: "85" }` with `gte 70` → `true`; same context with `eq 85` → `false`.

**Rung 6: demo data.** Copy `hashToScore` from `src/worker/handlers/index.ts:31-33`.
**Check:** printed `acct-1001 50`, `acct-enterprise-77 0`, `unknown-account 78`; separately, `acct-4432` (the launcher default) gives `61`. Only `unknown-account` of these would reach the approval step.

**Rung 7: the permission matrix.** Copy `permissions`, `rolePermissions` and `hasPermission` from `src/lib/auth/permissions.ts`.
**Check:** printed `VIEWER approvals:decide false` and `can start: [ 'ADMIN', 'OPERATOR' ]`.

## Tests worth adding, in priority order

Each targets a verified finding, so a failing test would document a real bug rather than a hypothetical one.

1. **Engine: missing handler eventually fails the run** (F2). Needs a database or a repository fake; would fail today.
2. **Engine: second concurrent decision is rejected** (F3). Needs two real transactions against Postgres; would fail today.
3. **Service: `APPROVER` cannot resolve an `ADMIN`-required approval** (F4). Can be done with mocked repositories; would fail today.
4. **Route: invalid JSON body returns 400** (F5). Would fail today (returns 500).
5. **Definition schema: rejects a cycle** (F7). Pure Zod, no database; would fail today because no cycle check exists.
6. **Retry: `calculateRetryDelayMs` table test.** Pure; would pass today and pin the behaviour before anyone "fixes" jitter.
