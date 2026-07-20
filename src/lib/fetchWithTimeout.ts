// fetch with a hard timeout, for the long-running AI endpoints (extract,
// analyze, transcribe, ask, ingest). Without this a hung serverless call
// strands the UI on "Reading the document..." forever with no escape.
// Callers should catch, check isTimeoutError(), and offer a retry path that
// re-enables the form.
export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = "FetchTimeoutError";
  }
}

export function isTimeoutError(e: unknown): e is FetchTimeoutError {
  return e instanceof FetchTimeoutError;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 90_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honor a caller-supplied signal (e.g. a Cancel button) alongside the timer.
  const upstream = init.signal;
  let onUpstreamAbort: (() => void) | null = null;
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else {
      onUpstreamAbort = () => controller.abort();
      upstream.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    // Distinguish "timer fired" from "caller cancelled": only the former
    // becomes a FetchTimeoutError.
    if (controller.signal.aborted && !(upstream && upstream.aborted)) {
      throw new FetchTimeoutError(timeoutMs);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    // {once:true} already self-removes once the listener fires; this covers
    // the normal-completion path, where it never fires and would otherwise
    // linger on the caller's signal for the rest of its life.
    if (upstream && onUpstreamAbort) {
      upstream.removeEventListener("abort", onUpstreamAbort);
    }
  }
}
