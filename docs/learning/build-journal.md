# Build Journal

## Stage 1 — Project framing and stack
- Built: The initial application shape in [package.json](/c:/Users/Owner/Desktop/ww19/package.json), [next.config.ts](/c:/Users/Owner/Desktop/ww19/next.config.ts), [tailwind.config.ts](/c:/Users/Owner/Desktop/ww19/tailwind.config.ts), and [tsconfig.json](/c:/Users/Owner/Desktop/ww19/tsconfig.json).
- Decisions: Prisma over Drizzle for faster movement across a dense relational model; REST over tRPC so request boundaries stay explicit in route files; one Next.js app plus a separate worker entrypoint instead of a fully split microservice system.
- Why: The project is teaching backend product engineering, not framework ceremony, so the stack favors visible boundaries and durable state.

## Stage 2 — Domain and persistence model
- Built: [prisma/schema.prisma](/c:/Users/Owner/Desktop/ww19/prisma/schema.prisma) and [prisma/seed.ts](/c:/Users/Owner/Desktop/ww19/prisma/seed.ts).
- Decisions: Mutable execution state lives on `WorkflowRun` and `WorkflowStepRun`; append-only history lives on `ExecutionEvent`; durable queue rows live on `WorkflowTask`.
- Why: This split keeps operational queries simple while preserving history needed for repair and debugging.

## Stage 3 — Auth, permissions, and validation boundaries
- Built: [src/lib/auth/session.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/session.ts), [src/lib/auth/permissions.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/permissions.ts), [src/lib/api/route-helpers.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.ts), [src/lib/validation/api-schemas.ts](/c:/Users/Owner/Desktop/ww19/src/lib/validation/api-schemas.ts), and [src/lib/workflows/definition-schema.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/definition-schema.ts).
- Decisions: DB-backed opaque sessions instead of JWT-only auth; permission mapping centralized in one file; workflow definition graph validation enforced before persistence.
- Why: Security and validation are easiest to review when they are explicit and shared.

## Stage 4 — Repository and service layers
- Built: Repository files in [src/repositories](/c:/Users/Owner/Desktop/ww19/src/repositories) and service files in [src/services](/c:/Users/Owner/Desktop/ww19/src/services).
- Decisions: Run start, engine transitions, worker execution, and approvals each got their own service boundary; repositories own scoping and query shape.
- Why: This keeps request handlers thin and makes orchestration rules readable in one place.

## Stage 5 — UI and worker runtime
- Built: App pages in [src/app](/c:/Users/Owner/Desktop/ww19/src/app), hooks in [src/hooks](/c:/Users/Owner/Desktop/ww19/src/hooks), components in [src/components](/c:/Users/Owner/Desktop/ww19/src/components), and worker files in [src/worker](/c:/Users/Owner/Desktop/ww19/src/worker).
- Decisions: The UI is operational and thin; React Query owns client fetching; the worker process calls services directly instead of going through internal HTTP.
- Why: That keeps the request path clear on the web side and avoids fake service boundaries inside one codebase.

## Stage 6 — Verification and learning docs
- Built: Tests in [src/lib/api/route-helpers.test.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.test.ts), [src/lib/workflows/definition-schema.test.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/definition-schema.test.ts), [src/lib/workflows/run-state-machine.test.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/run-state-machine.test.ts), and [src/repositories/workflow-run-repository.test.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.test.ts), plus the docs under [docs](/c:/Users/Owner/Desktop/ww19/docs).
- Decisions: Tests stay light and target the highest-risk boundaries: auth, validation, state transitions, and data isolation.
- Why: For a greenfield teaching repo, those tests catch the most expensive classes of production bug with the least setup.

## Major decisions

### Decision: How to persist orchestration state
- Why this matters: Run recovery, retries, and operator debugging all depend on a trustworthy persistence model.
- Option 1: Pure event sourcing only.
  Pros: Elegant history story; every state is reconstructable.
  Cons: Harder operational queries; more code before the product is usable.
  Future pain: Repair tools and dashboards become more complex early.
- Option 2: Mutable current-state rows only.
  Pros: Easy to query.
  Cons: Weak auditability; hard to explain what happened.
  Future pain: Incident debugging and compliance become painful.
- Option 3: Mutable current-state rows plus append-only history.
  Pros: Simple operational reads and explicit audit trail.
  Cons: More tables and transition-writing discipline.
  Future pain: You must keep state writes and history writes in sync.
- Choice: Option 3, implemented across [prisma/schema.prisma](/c:/Users/Owner/Desktop/ww19/prisma/schema.prisma) and [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts).
- Why this won: It gives the strongest learning payoff without forcing the whole repo into event-sourcing complexity.
- What junior/mid/senior engineers notice:
  Junior: “More tables than expected.”
  Mid: “This makes the UI and support tooling easier.”
  Senior: “The real requirement is repairability and incident traceability, not elegance.”

### Decision: Whether to split web and worker into separate services
- Why this matters: The runtime boundary changes deployment complexity, local development, and how explicit the orchestration layer feels.
- Option 1: One Next.js app plus an in-repo worker process.
  Pros: Easy to ship; explicit worker boundary remains visible.
  Cons: Not fully isolated at deployment time.
  Future pain: Eventually you may split infra concerns.
- Option 2: Separate web service and worker service repos from day one.
  Pros: Strong process isolation.
  Cons: More scaffolding, infra, and duplication for a learning project.
  Future pain: Slower iteration and more moving parts before domain logic is solid.
- Choice: Option 1, implemented in [src/worker/index.ts](/c:/Users/Owner/Desktop/ww19/src/worker/index.ts) and [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts).
- Why this won: The durable DB queue already teaches the critical distributed state lessons without premature repo/service sprawl.
- What junior/mid/senior engineers notice:
  Junior: “This still feels like one app.”
  Mid: “The DB lease boundary is the real separation.”
  Senior: “You can split deployment units later because the coordination contract is already explicit.”

### Decision: Prisma vs Drizzle
- Why this matters: The ORM choice affects velocity, migration ergonomics, and how quickly a junior engineer can map code to schema.
- Option 1: Prisma.
  Pros: Strong schema readability, nested include ergonomics, fast greenfield momentum.
  Cons: Raw SQL escape hatches still needed for queue leasing.
  Future pain: Some advanced SQL patterns sit outside the happy path.
- Option 2: Drizzle.
  Pros: Closer-to-SQL feel and fine-grained query control.
  Cons: More code overhead for this schema and less immediate readability for some learners.
  Future pain: More hand-rolled patterns early.
- Choice: Prisma, with one deliberate raw SQL escape hatch in [src/repositories/task-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/task-repository.ts).
- Why this won: Most of the code stays ergonomic, and the one place where SQL really matters stays obvious.
- What junior/mid/senior engineers notice:
  Junior: “I can read the schema and includes quickly.”
  Mid: “The raw SQL is isolated where concurrency actually needs it.”
  Senior: “Good abstraction until the concurrency boundary, then explicit control.”

## PR Slices

### Slice 1 — Persistence and auth foundations
- Purpose: Establish durable schema, seed data, sessions, and centralized permissions.
- Novel logic files: [prisma/schema.prisma](/c:/Users/Owner/Desktop/ww19/prisma/schema.prisma), [prisma/seed.ts](/c:/Users/Owner/Desktop/ww19/prisma/seed.ts), [src/lib/auth/session.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/session.ts), [src/lib/auth/permissions.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/permissions.ts), [src/lib/api/route-helpers.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.ts)
- Reviewer checks:
  In [prisma/schema.prisma](/c:/Users/Owner/Desktop/ww19/prisma/schema.prisma), verify unique keys and relations around `WorkflowRun`, `WorkflowStepRun`, and `WorkflowTask`.
  In [src/lib/auth/session.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/session.ts), verify `createSession()` hashes the token and `getUserFromSessionToken()` checks expiry.
  In [src/lib/auth/permissions.ts](/c:/Users/Owner/Desktop/ww19/src/lib/auth/permissions.ts), verify the role matrix matches product intent.
- Strong reviewer catch: A junior reviewer might accept role checks only in the UI; a stronger reviewer insists on server-side guards.

### Slice 2 — Workflow definition authoring and validation
- Purpose: Add versioned workflow definitions and executable workflow JSON validation.
- Novel logic files: [src/lib/workflows/definition-schema.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/definition-schema.ts), [src/lib/validation/api-schemas.ts](/c:/Users/Owner/Desktop/ww19/src/lib/validation/api-schemas.ts), [src/repositories/workflow-definition-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-definition-repository.ts), [src/services/workflow-definition-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-definition-service.ts), [src/app/api/workflows/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflows/route.ts)
- Reviewer checks:
  In [src/lib/workflows/definition-schema.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/definition-schema.ts), verify `superRefine()` catches missing target steps and duplicate keys.
  In [src/services/workflow-definition-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-definition-service.ts), verify the transaction retires the old active version before creating the new one.
  In [src/app/api/workflows/route.ts](/c:/Users/Owner/Desktop/ww19/src/app/api/workflows/route.ts), verify admin-only authorization happens before calling the service.
- Strong reviewer catch: A junior reviewer might approve “update the definition row in place”; a stronger reviewer flags loss of version traceability.

### Slice 3 — Run creation, orchestration engine, and history
- Purpose: Create runs, advance steps, handle conditions, and write execution history.
- Novel logic files: [src/repositories/workflow-run-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.ts), [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts), [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts), [src/lib/workflows/run-state-machine.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/run-state-machine.ts), [src/lib/workflows/expression.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/expression.ts)
- Reviewer checks:
  In [src/services/workflow-run-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-run-service.ts), verify `startWorkflowRun()` pins the run to the active version and scopes the idempotency key by user.
  In [src/services/workflow-engine-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/workflow-engine-service.ts), verify `createNextExecutableStep()` covers task, approval, condition, and terminal cases.
  In [src/lib/workflows/run-state-machine.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/run-state-machine.ts), verify illegal transitions throw.
- Strong reviewer catch: A junior reviewer might focus on happy-path transitions only; a stronger reviewer checks retry and terminal-state behavior.

### Slice 4 — Worker leasing, retries, and approvals
- Purpose: Add durable task execution, retry/backoff, idempotent side-effect handling, and human approvals.
- Novel logic files: [src/repositories/task-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/task-repository.ts), [src/repositories/approval-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/approval-repository.ts), [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts), [src/services/approval-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/approval-service.ts), [src/worker/handlers/index.ts](/c:/Users/Owner/Desktop/ww19/src/worker/handlers/index.ts), [src/worker/index.ts](/c:/Users/Owner/Desktop/ww19/src/worker/index.ts)
- Reviewer checks:
  In [src/repositories/task-repository.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/task-repository.ts), verify `claimNextAvailableTask()` uses one atomic lease query.
  In [src/services/worker-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/worker-service.ts), verify `runIdempotentAction()` persists reusable results and `processNextTask()` always reports failure back to the engine.
  In [src/services/approval-service.ts](/c:/Users/Owner/Desktop/ww19/src/services/approval-service.ts), verify role enforcement happens server-side.
- Strong reviewer catch: A junior reviewer might accept in-memory retry dedupe; a stronger reviewer looks for persisted idempotency state.

### Slice 5 — Monitoring UI, hooks, and focused tests
- Purpose: Add operator-facing pages plus tests for auth, validation, state transitions, and data isolation.
- Novel logic files: [src/hooks/use-runs.ts](/c:/Users/Owner/Desktop/ww19/src/hooks/use-runs.ts), [src/components/runs/run-detail.tsx](/c:/Users/Owner/Desktop/ww19/src/components/runs/run-detail.tsx), [src/components/approvals/approval-queue.tsx](/c:/Users/Owner/Desktop/ww19/src/components/approvals/approval-queue.tsx), [src/lib/api/route-helpers.test.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.test.ts), [src/lib/workflows/definition-schema.test.ts](/c:/Users/Owner/Desktop/ww19/src/lib/workflows/definition-schema.test.ts), [src/repositories/workflow-run-repository.test.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.test.ts)
- Reviewer checks:
  In [src/components/runs/run-detail.tsx](/c:/Users/Owner/Desktop/ww19/src/components/runs/run-detail.tsx), verify the UI surfaces both current state and execution history.
  In [src/lib/api/route-helpers.test.ts](/c:/Users/Owner/Desktop/ww19/src/lib/api/route-helpers.test.ts), verify a shared auth guard rejects the wrong role with `403`.
  In [src/repositories/workflow-run-repository.test.ts](/c:/Users/Owner/Desktop/ww19/src/repositories/workflow-run-repository.test.ts), verify the ownership filter is explicit.
- Strong reviewer catch: A junior reviewer might approve a polished UI even if it only shows final status; a stronger reviewer asks where the operational evidence is.
