# Load-Bearing Files

## prisma/schema.prisma
- What it does: Defines the durable relational model for auth, workflow versions, runs, steps, tasks, approvals, idempotency, and execution history.
- What calls it: Prisma Client generated from this schema is imported by [src/lib/db.ts](/c:/Users/Owner/Desktop/ww19/src/lib/db.ts), then used across all repositories.
- What it calls: PostgreSQL via Prisma.
- What would break or become insecure if this file were wrong: Missing uniqueness or relation constraints would let duplicate runs, orphaned steps, or broken approval history slip in silently.
- What a junior engineer would likely miswrite here: Compressing mutable execution state and append-only history into one model because it feels simpler at first.

## src/lib/auth/session.ts
- What it does: Creates, resolves, and destroys DB-backed sessions from an HTTP-only cookie.
- What calls it: [src/app/api/auth/login/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/auth/login/route.ts), [src/app/api/auth/logout/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/auth/logout/route.ts), [src/lib/api/route-helpers.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.ts), and [src/lib/auth/page-auth.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/page-auth.ts).
- What it calls: [src/lib/db.ts](/c:/Users/Owner/Desktop/ww19/src/lib/db.ts).
- What would break or become insecure if this file were wrong: Stolen cookies would be easier to replay, expired sessions could remain valid, or protected pages could render for anonymous users.
- What a junior engineer would likely miswrite here: Storing the raw token in the database instead of hashing it.

## src/lib/api/route-helpers.ts
- What it does: Enforces API auth/permissions and normalizes JSON success/error responses.
- What calls it: All protected route handlers under [src/app/api](/c:/Users/Owner/Desktop/ww19/src/app/api).
- What it calls: [src/lib/auth/session.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/session.ts) and [src/lib/auth/permissions.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/permissions.ts).
- What would break or become insecure if this file were wrong: A whole class of endpoints could become public or start returning inconsistent status codes.
- What a junior engineer would likely miswrite here: Parsing the body before auth, which wastes work and increases attack surface.

## src/lib/workflows/definition-schema.ts
- What it does: Validates workflow JSON and its step graph.
- What calls it: [src/lib/validation/api-schemas.ts](/c:/Users/Owner/Desktop/ww19/src/lib/validation/api-schemas.ts) and [src/services/workflow-definition-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-definition-service.ts).
- What it calls: Zod only.
- What would break or become insecure if this file were wrong: Broken workflow graphs could be saved and then fail only once a live run reaches the bad edge.
- What a junior engineer would likely miswrite here: Validating only shape and not referenced step keys.

## src/repositories/workflow-run-repository.ts
- What it does: Owns run reads/writes, step persistence, event appends, and run-read scoping.
- What calls it: [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts), [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts), and tests in [src/repositories/workflow-run-repository.test.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.test.ts).
- What it calls: [src/lib/db.ts](/c:/Users/Owner/Desktop/ww19/src/lib/db.ts) and [src/lib/auth/permissions.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/permissions.ts).
- What would break or become insecure if this file were wrong: Viewers could see other users’ runs, and engine state/history writes could drift apart.
- What a junior engineer would likely miswrite here: Putting the read-scope filter in the service layer and forgetting one caller.

## src/repositories/task-repository.ts
- What it does: Persists queue tasks and safely leases one task to one worker at a time.
- What calls it: [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts) and [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts).
- What it calls: [src/lib/db.ts](/c:/Users/Owner/Desktop/ww19/src/lib/db.ts) and a raw PostgreSQL query.
- What would break or become insecure if this file were wrong: Two workers could process the same task, which is exactly the kind of duplicated side effect orchestration systems exist to avoid.
- What a junior engineer would likely miswrite here: A separate `SELECT` followed by `UPDATE`.

## src/services/workflow-run-service.ts
- What it does: Starts new workflow runs, enforces per-user idempotency for starts, and reads run detail for the UI.
- What calls it: [src/app/api/workflow-runs/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflow-runs/route.ts) and [src/app/api/workflow-runs/[runId]/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflow-runs/[runId]/route.ts).
- What it calls: [src/repositories/workflow-definition-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-definition-repository.ts), [src/repositories/workflow-run-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.ts), and [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts).
- What would break or become insecure if this file were wrong: Runs could start against the wrong definition version or duplicate because idempotency was too weak.
- What a junior engineer would likely miswrite here: Using the caller-supplied idempotency key globally without scoping it.

## src/services/workflow-engine-service.ts
- What it does: Coordinates state transitions, branching, approvals, retries, and run completion.
- What calls it: [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts), [src/services/approval-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/approval-service.ts), and [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts).
- What it calls: Repositories in [src/repositories](/c:/Users/Owner/Desktop/ww19/src/repositories), plus helpers in [src/lib/workflows](/c:/Users/Owner/Desktop/ww19/src/lib/workflows).
- What would break or become insecure if this file were wrong: Retries could skip validation, approvals could advance to the wrong step, or state/history could diverge.
- What a junior engineer would likely miswrite here: Updating run status directly from several callers instead of routing all transitions through one engine.

## src/services/worker-service.ts
- What it does: Claims tasks, executes handlers, uses idempotency records, and reports success/failure back to the engine.
- What calls it: [src/worker/index.ts](/c:/Users/Owner/Desktop/ww19/src/worker/index.ts).
- What it calls: [src/repositories/task-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/task-repository.ts), [src/repositories/idempotency-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/idempotency-repository.ts), and engine methods in [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts).
- What would break or become insecure if this file were wrong: Retried tasks could duplicate side effects or leave runs stuck because leased work never feeds back into engine state.
- What a junior engineer would likely miswrite here: Calling handlers without a durable claim/retry boundary.
