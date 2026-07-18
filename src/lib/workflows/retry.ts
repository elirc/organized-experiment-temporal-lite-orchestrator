/*
 * What this file does:
 * Calculates exponential backoff with a cap for retried workflow tasks.
 * What calls it:
 * src/services/worker-service.ts when a task handler fails.
 * What it calls:
 * No external modules; just math utilities.
 * What a junior engineer would likely get wrong:
 * Retrying immediately forever, which can convert one bad handler bug into a database and API outage.
 */
const MAX_DELAY_MS = 1000 * 60 * 60;

export function calculateRetryDelayMs(initialDelayMs: number, attemptNumber: number) {
  const rawDelay = initialDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1));
  const jitter = Math.min(5_000, Math.floor(rawDelay * 0.1));

  // ⚠️ SENIOR NOTE: Jitter prevents synchronized retries from stampeding the same dependency after a shared outage.
  return Math.min(MAX_DELAY_MS, rawDelay + jitter);
}
