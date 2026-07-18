/*
 * What this file does:
 * Registers worker task handlers and defines the handler contract used by the durable task runner.
 * What calls it:
 * src/services/worker-service.ts and src/worker/index.ts.
 * What it calls:
 * Simulated task handlers in this file.
 * What a junior engineer would likely get wrong:
 * Letting handlers mutate orchestration state directly instead of returning output/context data back to the engine service.
 */
import type { Prisma } from "@prisma/client";

import type { findWorkflowTaskById } from "@/repositories/task-repository";

type HydratedTask = NonNullable<Awaited<ReturnType<typeof findWorkflowTaskById>>>;

export type RegisteredTaskHandler = (args: {
  task: HydratedTask;
  run: HydratedTask["stepRun"]["workflowRun"];
  stepRun: HydratedTask["stepRun"];
  runOnce: <T extends Prisma.InputJsonValue>(actionType: string, factory: () => Promise<T>) => Promise<T>;
}) => Promise<{
  output: Prisma.InputJsonValue;
  contextPatch?: Record<string, unknown>;
}>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashToScore(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % 100;
}

function shouldFailOnce(task: HydratedTask) {
  const failOnceHandlers = ((task.stepRun.workflowRun.input as Record<string, unknown>).failOnceHandlers ?? []) as string[];
  return task.attemptCount === 0 && failOnceHandlers.includes(task.handlerKey);
}

const fetchAccountProfile: RegisteredTaskHandler = async ({ task, runOnce }) => {
  const accountId = String((task.stepRun.workflowRun.input as Record<string, unknown>).accountId ?? "unknown-account");

  const profile = await runOnce("fetch-profile", async () => {
    await sleep(400);
    const riskScore = hashToScore(accountId);

    return {
      accountId,
      riskScore,
      customerTier: riskScore >= 70 ? "elevated" : "standard",
    };
  });

  return {
    output: profile,
    contextPatch: {
      riskScore: (profile as Record<string, unknown>).riskScore,
      customerTier: (profile as Record<string, unknown>).customerTier,
    },
  };
};

const generateSummaryPacket: RegisteredTaskHandler = async ({ task, runOnce }) => {
  const packet = await runOnce("generate-packet", async () => {
    await sleep(600);

    return {
      packetId: `pkt-${task.stepRun.id.slice(-8)}`,
      generatedAt: new Date().toISOString(),
      riskScore: (task.stepRun.workflowRun.context as Record<string, unknown>).riskScore ?? null,
    };
  });

  return {
    output: packet,
    contextPatch: {
      packetId: (packet as Record<string, unknown>).packetId,
      generatedAt: (packet as Record<string, unknown>).generatedAt,
    },
  };
};

async function notifyWebhook(task: HydratedTask, runOnce: <T extends Prisma.InputJsonValue>(actionType: string, factory: () => Promise<T>) => Promise<T>, webhookType: string) {
  if (shouldFailOnce(task)) {
    throw new Error(`Simulated first-attempt failure for ${task.handlerKey}.`);
  }

  return runOnce(`webhook-${webhookType}`, async () => {
    await sleep(300);

    return {
      deliveryId: `wh-${task.id.slice(-8)}`,
      deliveredAt: new Date().toISOString(),
      type: webhookType,
    };
  });
}

const notifyFinishedWebhook: RegisteredTaskHandler = async ({ task, runOnce }) => {
  const result = await notifyWebhook(task, runOnce, "finished");
  return { output: result };
};

const notifyRejectedWebhook: RegisteredTaskHandler = async ({ task, runOnce }) => {
  const result = await notifyWebhook(task, runOnce, "rejected");
  return { output: result };
};

export const taskHandlers: Record<string, RegisteredTaskHandler> = {
  "fetch-account-profile": fetchAccountProfile,
  "generate-summary-packet": generateSummaryPacket,
  "notify-finished-webhook": notifyFinishedWebhook,
  "notify-rejected-webhook": notifyRejectedWebhook,
};
