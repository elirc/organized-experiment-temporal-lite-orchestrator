/*
 * What this file does:
 * Defines the runtime schema for workflow versions so persisted JSON becomes trusted only after validation.
 * What calls it:
 * src/services/workflow-definition-service.ts and API input schemas in src/lib/validation/api-schemas.ts.
 * What it calls:
 * Zod.
 * What a junior engineer would likely get wrong:
 * Treating JSON from the database as implicitly safe instead of validating it at the boundary where business logic starts.
 */
import { z } from "zod";

const retryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10).default(1),
    initialDelayMs: z.number().int().min(1_000).max(86_400_000).default(60_000),
  })
  .default({ maxAttempts: 1, initialDelayMs: 60_000 });

const nextSchema = z.object({
  onSuccess: z.string().nullable(),
});

const approvalNextSchema = z.object({
  onApprove: z.string().nullable(),
  onReject: z.string().nullable(),
});

const conditionRuleSchema = z.object({
  source: z.enum(["input", "context"]),
  path: z.string().min(1),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const conditionBranchSchema = z.object({
  match: z.boolean(),
  nextStepKey: z.string().nullable(),
});

const taskStepSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["API_CALL", "JOB"]),
  handlerKey: z.string().min(1),
  queue: z.string().min(1).default("default"),
  retry: retryPolicySchema,
  next: nextSchema,
});

const approvalStepSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.literal("APPROVAL"),
  approvalRole: z.enum(["ADMIN", "APPROVER"]),
  next: approvalNextSchema,
});

const conditionStepSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.literal("CONDITION"),
  condition: conditionRuleSchema,
  branches: z
    .array(conditionBranchSchema)
    .length(2)
    .refine(
      (branches) => branches.some((branch) => branch.match) && branches.some((branch) => !branch.match),
      "Condition branches must include both true and false paths.",
    ),
});

export const workflowStepSchema = z.discriminatedUnion("type", [
  taskStepSchema,
  approvalStepSchema,
  conditionStepSchema,
]);

export const workflowDefinitionSchema = z
  .object({
    initialStepKey: z.string().min(1),
    steps: z.array(workflowStepSchema).min(1),
  })
  .superRefine((definition, ctx) => {
    const seen = new Set<string>();
    const stepKeys = new Set(definition.steps.map((step) => step.key));

    for (const step of definition.steps) {
      if (seen.has(step.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step key "${step.key}".`,
          path: ["steps"],
        });
      }

      seen.add(step.key);
    }

    if (!stepKeys.has(definition.initialStepKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "initialStepKey must point to a defined step.",
        path: ["initialStepKey"],
      });
    }

    for (const step of definition.steps) {
      const referencedTargets =
        step.type === "APPROVAL"
          ? [step.next.onApprove, step.next.onReject]
          : step.type === "CONDITION"
            ? step.branches.map((branch) => branch.nextStepKey)
            : [step.next.onSuccess];

      for (const target of referencedTargets) {
        if (target && !stepKeys.has(target)) {
          // ⚠️ SENIOR NOTE: Graph validation belongs here because a broken edge should be rejected at definition save time, not discovered by a live workflow run days later.
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.key}" points to unknown target "${target}".`,
            path: ["steps"],
          });
        }
      }
    }
  });

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type TaskWorkflowStep = Extract<WorkflowStep, { type: "API_CALL" | "JOB" }>;
export type ApprovalWorkflowStep = Extract<WorkflowStep, { type: "APPROVAL" }>;
export type ConditionWorkflowStep = Extract<WorkflowStep, { type: "CONDITION" }>;
