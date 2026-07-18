/*
 * What this file does:
 * Runs the background worker loop that polls for available tasks and executes them with durable leases.
 * What calls it:
 * The npm "worker" script.
 * What it calls:
 * src/services/worker-service.ts and src/worker/handlers/index.ts.
 * What a junior engineer would likely get wrong:
 * Stopping the loop on the first task failure instead of treating handler errors as data the workflow engine should process.
 */
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { processNextTask } from "@/services/worker-service";
import { taskHandlers } from "@/worker/handlers";

void env;

let shouldContinue = true;
const workerId = process.env.WORKER_ID ?? `worker-${randomUUID().slice(0, 8)}`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[${workerId}] worker started`);

  while (shouldContinue) {
    const result = await processNextTask({
      handlers: taskHandlers,
      workerId,
    });

    if (result.status === "idle") {
      await sleep(2_000);
      continue;
    }

    console.log(`[${workerId}]`, result);
    await sleep(250);
  }

  console.log(`[${workerId}] worker stopped`);
}

process.on("SIGINT", () => {
  shouldContinue = false;
});

process.on("SIGTERM", () => {
  shouldContinue = false;
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
