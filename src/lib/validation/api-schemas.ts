/*
 * What this file does:
 * Defines request payload schemas for public REST endpoints.
 * What calls it:
 * Route handlers in src/app/api/.../route.ts.
 * What it calls:
 * src/lib/workflows/definition-schema.ts and Zod.
 * What a junior engineer would likely get wrong:
 * Reusing database types as request validation, which leaves holes around required user input and external payload shape.
 */
import { z } from "zod";

import { workflowDefinitionSchema } from "@/lib/workflows/definition-schema";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const createWorkflowSchema = z.object({
  key: z.string().min(3).regex(/^[a-z0-9-]+$/),
  name: z.string().min(3),
  description: z.string().max(500).optional(),
  definition: workflowDefinitionSchema,
});

export const startWorkflowRunSchema = z.object({
  workflowDefinitionId: z.string().cuid(),
  displayName: z.string().min(3).max(120),
  idempotencyKey: z.string().min(6).max(100),
  // ⚠️ SENIOR NOTE: Keeping run input as unknown values preserves a hard validation boundary; downstream services must explicitly interpret shape they depend on.
  input: z.record(z.string(), z.unknown()),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().max(500).optional(),
});
