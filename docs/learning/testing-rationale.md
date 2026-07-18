# Testing Rationale

## `src/lib/api/route-helpers.test.ts` — `rejects an authenticated viewer from an approvals-protected endpoint`
This test matters because `requireRequestUser()` in [src/lib/api/route-helpers.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.ts) is the shared auth gate used by protected route handlers. If the permission check regressed here, a whole class of endpoints could quietly become callable by the wrong role. The production bug this guards against is not “one approval page looks wrong”; it is “the server accepts a privileged mutation from an unprivileged user.”

A more thorough production test suite would also exercise real route handlers like [src/app/api/approvals/[approvalId]/decision/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/approvals/[approvalId]/decision/route.ts) end-to-end with session cookies and assert the full JSON error shape.

## `src/lib/workflows/definition-schema.test.ts` — `rejects a workflow that points at an undefined next step`
This test matters because a broken workflow graph is much more expensive to discover at runtime than at save time. Without this validation, the system can accept a definition that looks fine until a live run reaches the missing branch hours later. The production bug this guards against is “workflow save succeeds, but execution crashes deep into a real customer run.”

A more thorough production test suite would add positive/negative cases for duplicate step keys, invalid `initialStepKey`, malformed approval branches, and invalid condition branch pairs.

## `src/lib/workflows/run-state-machine.test.ts` — `rejects moving a completed run back to running`
This test matters because terminal-state corruption is one of the easiest ways to make orchestration behavior impossible to reason about. If `SUCCEEDED -> RUNNING` becomes legal by accident, retries, dashboards, and audit history all start telling conflicting stories. The production bug this guards against is silent lifecycle drift where repairs or retries resurrect runs that should be immutable.

A more thorough production test suite would cover both run and step transitions, including allowed transitions around retries (`RUNNING -> FAILED -> QUEUED`) and approval waits (`RUNNING -> WAITING_APPROVAL -> RUNNING`).

## `src/repositories/workflow-run-repository.test.ts` — `scopes viewer reads to runs they started while leaving admin reads unscoped`
This test matters because ownership scoping is a security boundary, not just a UI preference. `buildRunVisibilityWhere()` in [src/repositories/workflow-run-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.ts) is the place where a low-privilege user is prevented from reading someone else’s run. The production bug this guards against is a direct cross-user data leak in the runs list or detail endpoint.

A more thorough production test suite would run repository integration tests against a real PostgreSQL database with seeded users/runs, then assert that list and detail queries never return rows outside the caller’s scope.
