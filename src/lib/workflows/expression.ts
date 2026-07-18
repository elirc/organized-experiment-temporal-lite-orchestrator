/*
 * What this file does:
 * Evaluates the small condition language used by branching workflow steps.
 * What calls it:
 * src/services/workflow-engine-service.ts when a CONDITION step runs.
 * What it calls:
 * Types from src/lib/workflows/definition-schema.ts.
 * What a junior engineer would likely get wrong:
 * Using eval or Function here, which turns user-authored workflow data into arbitrary code execution.
 */
import type { WorkflowDefinition } from "@/lib/workflows/definition-schema";

type ConditionRule = Extract<
  WorkflowDefinition["steps"][number],
  { type: "CONDITION" }
>["condition"];

function getPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

export function evaluateCondition(
  rule: ConditionRule,
  args: { input: Record<string, unknown>; context: Record<string, unknown> },
) {
  const left = getPathValue(rule.source === "input" ? args.input : args.context, rule.path);
  const right = rule.value;

  switch (rule.operator) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
  }
}
