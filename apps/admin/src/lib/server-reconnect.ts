/**
 * @file Riding out a server restart (2026-10-05, big-chat-capabilities plan S3). When the API is
 * briefly gone — `tsx watch` reloading on a save, or `npm run dev` restarting it onto a newly
 * switched site — `request()` (`api.ts`) waits here for `/readyz` to answer again and retries,
 * instead of failing the screen (the owner's login failed with ECONNREFUSED through the Vite proxy
 * exactly this way). The status drives the "Server restarting…" banner
 * (`components/ServerRestartingBanner`).
 *
 * Which failures may be retried is {@link shouldRetryAfterReconnect}'s call: reads always; a write
 * only when it provably never reached the server (the dev proxy marks a refused upstream with
 * {@link UPSTREAM_REFUSED_HEADER}), or when the caller says repeating it is harmless (login). A
 * write that may have half-run on the dying server is never repeated.
 *
 * No React here: a tiny store plus `useSyncExternalStore` in the banner's hook.
 */

/** Set by the admin dev proxy (`apps/admin/dev-proxy-upstream-close.ts`) on the 503 it answers
 *  when the API refused the connection — proof the request never reached the server. */
export const UPSTREAM_REFUSED_HEADER = "x-tovu-upstream-status";
export const UPSTREAM_REFUSED_VALUE = "upstream-refused";

export type ServerConnectionStatus = "online" | "reconnecting" | "unreachable";

export interface ServerReconnectDeps {
  /** `true` once the real server answers `/readyz` (either its 200 or its 503 JSON). */
  probe: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface ServerReconnectOptional {
  pollMs?: number;
  /** Long enough for a dev restart (tsc compile ~5-10s, plus a site's first boot), short enough that
   *  a server that is really down is reported within a minute. */
  timeoutMs?: number;
}

export interface ServerReconnect {
  getStatus(): ServerConnectionStatus;
  subscribe(listener: () => void): () => void;
  /** Polls until the server answers or the timeout passes. Concurrent callers share one poll.
   *  @returns whether the server is back. */
  waitUntilReachable(): Promise<boolean>;
}

/**
 * @complexity O(timeoutMs / pollMs) probes per outage, shared by every waiting request.
 */
export function createServerReconnect(deps: ServerReconnectDeps, optional: ServerReconnectOptional = {}): ServerReconnect {
  const pollMs = optional.pollMs ?? 500;
  const timeoutMs = optional.timeoutMs ?? 60_000;
  let status: ServerConnectionStatus = "online";
  let inFlight: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();

  function setStatus(next: ServerConnectionStatus): void {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  }

  async function poll(): Promise<boolean> {
    setStatus("reconnecting");
    const deadline = deps.now() + timeoutMs;
    while (!(await deps.probe())) {
      if (deps.now() >= deadline) {
        setStatus("unreachable");
        return false;
      }
      await deps.sleep(pollMs);
    }
    setStatus("online");
    return true;
  }

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    waitUntilReachable() {
      inFlight ??= poll().finally(() => (inFlight = null));
      return inFlight;
    },
  };
}

/**
 * Whether a failed request should wait for the server and be sent once more.
 * @param input.code - The `ApiError` code (`api.ts`'s `API_UNREACHABLE_CODE` is the only one retried).
 * @param input.method - The request's HTTP method (absent = GET).
 * @param input.upstreamRefused - The dev proxy proved the request never reached the server.
 * @param input.retryWrites - The caller says repeating this write is harmless (login).
 * @complexity O(1); cyclomatic 4.
 */
export function shouldRetryAfterReconnect(input: {
  code: string | undefined;
  unreachableCode: string;
  method: string | undefined;
  upstreamRefused: boolean;
  retryWrites: boolean;
}): boolean {
  if (input.code !== input.unreachableCode) return false;
  const method = (input.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  return input.upstreamRefused || input.retryWrites;
}

/** The real probe: `/readyz` answering with its own JSON (200 ready, or 503 not-ready) means the
 *  server is up; anything else — refused, a proxy's text 5xx, a timeout — means not yet. */
async function probeReadyz(): Promise<boolean> {
  try {
    const res = await fetch("/readyz", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(2_000) });
    const body: unknown = await res.json();
    return typeof (body as { ready?: unknown } | null)?.ready === "boolean";
  } catch {
    return false;
  }
}

/** Gives up at once without probing — what the suite gets, see {@link serverReconnect}. */
const neverReconnects: ServerReconnect = {
  getStatus: () => "online",
  subscribe: () => () => {},
  waitUntilReachable: async () => false,
};

/**
 * The one instance the app uses. Under vitest (`MODE === "test"`) it never waits or probes: an extra
 * `/readyz` fetch would eat a test's queued fetch stub, and every unreachable-path test would stall a
 * minute. Tests of this behaviour build their own with {@link createServerReconnect} and pass it to
 * `api.ts`'s `requestRidingOutRestart`.
 */
export const serverReconnect: ServerReconnect = import.meta.env.MODE === "test"
  ? neverReconnects
  : createServerReconnect({
    probe: probeReadyz,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  });
