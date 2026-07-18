/*
 * What this file does:
 * Provides a tiny client-side fetch wrapper that normalizes the API's { data, error } envelope.
 * What calls it:
 * React Query hooks under src/hooks/*.
 * What it calls:
 * The browser fetch API.
 * What a junior engineer would likely get wrong:
 * Duplicating response parsing and error extraction in every hook until mutation behavior becomes inconsistent.
 */
export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new ClientApiError(payload.error?.message ?? "Request failed.", response.status, payload.error?.details);
  }

  return payload.data as T;
}
