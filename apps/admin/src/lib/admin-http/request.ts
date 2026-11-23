import { decodeApiError } from "@jini-ai/protocol";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { createAdminHttp } from "@jini-ai/admin/shell/lib/admin-http/request";
import type { AdminHttpOptions } from "@jini-ai/core/admin-runtime";

import { adminFailureChannel, isPageWideFailure, publishAdminFailure } from "../admin-failure-channel";
import { isPageUnloading } from "@jini-ai/admin/shell/lib/page-lifecycle";
import { serverReconnect, shouldRetryAfterReconnect, UPSTREAM_REFUSED_HEADER, UPSTREAM_REFUSED_VALUE } from "../server-reconnect";
import { BASE } from "./config";


export class ApiError extends Error {
  readonly status: number;
  /** Canonical error `code` from the response body (`FORBIDDEN`, `GRANT_EXCEEDS_ISSUER`,
   * `VALIDATION_ERROR`, `RESOURCE_CONFLICT`, ...) when the server sent one — SPEC-006 errors.spec.md. */
  readonly code?: string;
  /** Raw parsed JSON error body, when present — lets a caller read route-specific fields beyond
   * `code`/`message` (e.g. the comments moderation routes' 409 `currentVersion`, SPEC-036 REQ-07)
   * without a bespoke `ApiError` subclass per route. */
  readonly body?: Record<string, unknown>;
  constructor({ message, status }: { message: string; status: number }, { code, body }: { code?: string; body?: Record<string, unknown> } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * `ApiError.code` for "no Tovu API answered this request" — client-synthesized, not a server code
 * (the server never sent one, which is the whole point). Lets a screen branch on the condition
 * without string-matching the operator copy below.
 */
export const API_UNREACHABLE_CODE = "API_UNREACHABLE";

/**
 * `ApiError.code` for "no response arrived within {@link DEFAULT_REQUEST_TIMEOUT_MS}" —
 * client-synthesized, like {@link API_UNREACHABLE_CODE} above, for the sibling failure mode that
 * code cannot cover: `fetch` only rejects when the origin itself refuses the connection. It does
 * NOT reject when the origin is reachable but the browser has no free connection to send the
 * request on at all — every open admin tab keeps one `EventSource` connection to
 * `.../settings/events` open for its entire life (`lib/settings-events.ts`, "deliberately not
 * closed"), and this app is served over plain HTTP/1.1 in both dev and production, where Chrome caps
 * concurrent connections to one origin at 6. Enough long-lived tabs/streams against the same origin
 * exhausts that budget, and any OTHER request — reachable server, correct auth, nothing wrong with
 * either side — then queues in the browser forever with no error to catch (live-found 2026-08-17: the
 * Themes screen's `getPresentation()` call hung indefinitely with no server-side activity and no
 * client-side rejection). Bounding every request here converts that silent, permanent hang into a
 * visible, retriable one.
 */
export const REQUEST_TIMEOUT_CODE = "REQUEST_TIMEOUT";

/** How long a request may go unanswered before {@link fetchOrThrowUnreachable} gives up on it.
 *  Most real calls through `request()` are CRUD round trips measured in low tens of milliseconds
 *  locally, and the few genuinely long-running operations (static export/publish) are start/poll,
 *  never a single blocking call — EXCEPT `uploadMedia`, which sends a whole file as base64 JSON
 *  through this same seam and can legitimately run long: `server/runtime/composition/app.ts` accepts request bodies up
 *  to 15mb (`express.json({ limit: "15mb" })`), which a slow/mobile upload could take the better
 *  part of a minute to send. 60s comfortably covers that worst real case while staying far short of
 *  "hangs forever" — the failure this timeout exists to convert into something visible. */
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function timeoutApiMessage(): string {
  return `The Tovu API did not respond within ${DEFAULT_REQUEST_TIMEOUT_MS / 1000}s — the browser may be out of free connections for this origin (try closing other admin tabs) or the server is unresponsive`;
}

/**
 * Operator copy for a request that never reached a Tovu API able to answer it.
 *
 * Replaces the old `request failed (500)`, which cost a real debugging hour on 2026-08-06: a bare
 * status *asserts a server exists and returned a server error*, so the operator reads it as "the
 * API crashed" and goes looking at application code, when in fact nothing was listening at all.
 * The status is kept in the message when we have one, because that is the only thing that
 * distinguishes the two routes described on {@link request} for a human reading the screen.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function unreachableApiMessage(_required: Record<string, never>, { status }: { status?: number } = {}): string {
  const detail = status === undefined ? "" : ` (HTTP ${status})`;
  return `cannot reach the Tovu API${detail} — is the server running?`;
}

type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();

/**
 * Subscribe to "the server just told us this tab's session is no longer valid" — a real 401 from
 * `request()` below, carrying `code: "UNAUTHENTICATED"`, not a client-side guess. Returns an
 * unsubscribe function.
 *
 * Exists because `apps/admin/src/App.hooks.ts`'s `useAdminSession` only ever checked auth ONCE, at boot
 * (`api.me()` on mount) — a session that expires or is invalidated (server restart, admin revoke)
 * mid-tab left `user` stuck non-null forever, so `App.tsx`'s `if (!user) return <Login .../>` gate
 * never re-fired. Every OTHER screen's own `request()` call kept 401ing silently instead — the
 * live bug (2026-08-17): source control, deployments, assistant, and recovery all "loading forever"
 * with no indication of why, because none of those screens' own error handling was built to
 * recognize "you're logged out" as distinct from "the network/server is having a problem."
 * `useAdminSession` is the single subscriber (see that file) — it calls its own `setUser(null)` on
 * notification, which re-triggers the EXISTING `<Login>` gate rather than adding a second one.
 *
 * Gated on `code === "UNAUTHENTICATED"`, not bare `status === 401`, since found by adversarial
 * review the same day: 401 is not exclusively "this session is invalid": a route that relays a
 * third-party service's own 401 (a bad vendor key) returns one too — the removed Composio connector
 * routes did exactly that. Treating every 401 as a logout would silently log the whole tab out over
 * one bad vendor key. Every genuine session-invalidity 401 (`dev-auth.ts`) sets
 * `code: "UNAUTHENTICATED"`; a relayed vendor error does not.
 */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

/**
 * The Fetch standard's ceiling on the combined body size of all in-flight `keepalive` requests
 * (64 KiB). A `fetch` whose keepalive body exceeds it rejects rather than being sent.
 */
export const KEEPALIVE_MAX_BODY_BYTES = 64 * 1024;

/**
 * Whether `body` is small enough to ride a `keepalive` fetch — measured in BYTES, not characters:
 * the ceiling is on the encoded payload, and a body of astral-plane characters is up to four bytes
 * each, so a `length` check would wave through a body four times over the limit.
 *
 * Conservative on purpose. The ceiling is shared across every in-flight keepalive request, so a
 * body at exactly the limit can still be refused when something else is in flight; being under it
 * is necessary, not sufficient. That is acceptable here because the fallback is an ordinary fetch,
 * which is what this path did before keepalive existed.
 *
 * @complexity Time O(n) in body length; space O(n) for the encoded copy.
 */
export function bodyFitsKeepalive({ body }: { body: string }, _optional: Record<string, never> = {}): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BODY_BYTES;
}

/** The local API owners this admin may send its cookies to; never a provider URL. */
type AdminApiBasePath = "/api/admin/v1" | "/api/assistant/chats" | "/api/agents";

/** Per-call options for {@link request}, {@link requestOnce} and {@link authenticatedAdminRequest}. */
export type AuthenticatedAdminRequestOptions = AdminHttpOptions<ApiError, AdminApiBasePath, "page">;

/**
 * The one composed session client (`createAdminHttp`, `@jini-ai/admin`). Every behaviour rule lives
 * there; this host binds Tovu's error class, copy, reconnect policy, failure channel and session
 * listeners. The bound operations below keep their existing names and shapes, so no importer
 * changes.
 *
 * Copy bindings (moved here from the old in-file request stages):
 * - `unreachable`: no Tovu API answered. A bare `request failed (500)` once cost a debugging hour
 *   (2026-08-06) because a status asserts a server exists. In dev, Vite's `/api` proxy answers an
 *   unreachable target with a bare text `500`; production proxies answer 502/503/504.
 * - `requestFailed`: an application answered with an empty error. It names the request and status
 *   and is passed through `redactSecretShapes`, since a path can carry a secret-shaped segment.
 *
 * Session invalidation resets the failure channel BEFORE notifying listeners, so a stale notice
 * from the old session is never shown on the login screen.
 */
const adminHttp = createAdminHttp<ApiError, AdminApiBasePath, "page">({
  timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  ports: {
    // Resolved at call time, so a test's stubbed global fetch/AbortSignal is the one used.
    fetch: ({ url, init }) => fetch(url, init),
    timeoutSignal: ({ ms }) => AbortSignal.timeout(ms),
    isPageUnloading: () => isPageUnloading(),
    resolveBasePath: ({ basePath }) => basePath ?? BASE,
    isUpstreamRefused: ({ response }) => response.headers.get(UPSTREAM_REFUSED_HEADER) === UPSTREAM_REFUSED_VALUE,
    decodeApiError: (required, optional) => decodeApiError(required, optional),
    createError: (required, optional) => new ApiError(required, optional),
    isRequestError: (required): required is { error: ApiError } => required.error instanceof ApiError,
    messages: {
      timeout: () => timeoutApiMessage(),
      unreachable: ({ status }) => unreachableApiMessage({}, status === undefined ? {} : { status }),
      requestFailed: ({ method, path, status }) => redactSecretShapes({ text: `The API could not finish ${method} ${path} (HTTP ${status}). Check whether your change was saved before trying again. Copy details and report this problem.` }).text,
    },
    reconnect: serverReconnect,
    shouldRetry: (required) => shouldRetryAfterReconnect(required),
    sessionInvalidated: () => {
      adminFailureChannel.reset();
      for (const listener of unauthenticatedListeners) listener();
    },
    getFailureGeneration: () => adminFailureChannel.getGeneration(),
    reportFailure: ({ error, path, method, generation, basePath, failureEntry }) => {
      // A 4xx is the caller's to explain; only a final 5xx or no-response failure is page-wide.
      if (!isPageWideFailure({ status: error.status, method, code: error.code })) return;
      publishAdminFailure({ body: error.body, path, method, status: error.status, generation, ...(failureEntry ? { entry: failureEntry } : {}) }, { basePath });
    },
  },
});

/** `fetch` bounded by the request deadline; a rejection becomes an {@link ApiError} (or AbortError). */
export const fetchOrThrowUnreachable = adminHttp.fetchOrThrowUnreachable;
/** One send through the seam, no restart retry. Exported for `server-reconnect` tests and the
 *  owner-auth clients that must not retry. */
export const requestOnce = adminHttp.requestOnce;
/** Sends once, then once more after `/readyz` answers when the first send never reached the server. */
export const requestRidingOutRestart = adminHttp.requestRidingOutRestart;
/** The single fetch seam every `api.*` call goes through; publishes only the final failure. */
export const request = adminHttp.request;
/** Authenticated package adapters share cookies, bounded requests and session invalidation with
 *  every native screen; paths are relative to the explicitly selected local API prefix. */
export const authenticatedAdminRequest = adminHttp.authenticatedAdminRequest;


/**
 * Shared translation from a thrown request error to operator-facing copy — the "opt-out by
 * default" base every screen should build on, instead of each one copy-pasting this exact base
 * case under its own locally-defined `describeApiError` (audit cross-cutting finding #2,
 * `ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`: `request()` above throws
 * `body.error` verbatim with no shared translation layer, so operator-quality copy was opt-in per
 * screen — roughly two dozen screens had independently rebuilt this exact fallback chain, and any
 * screen whose author forgot would show the operator a raw server/developer string). An
 * `ApiError` already carries the server's own message; this only decides what to show when that
 * message is empty, or when `e` isn't an `ApiError` at all (a network failure, a thrown non-Error
 * value, …).
 *
 * A screen with real per-`code` handling should check its own codes first and fall through to
 * this for the rest, rather than reimplementing the base case:
 *
 * ```ts
 * import { describeApiError as describeApiErrorDefault } from "../lib/api";
 *
 * function describeApiError({ e, fallback }: { e: unknown; fallback: string }, _optional: Record<string, never> = {}): string {
 *   if (e instanceof ApiError && e.code === "MY_SCREEN_SPECIFIC_CODE") return "...";
 *   return describeApiErrorDefault({ e, fallback });
 * }
 * ```
 *
 * Deliberately NOT a single shared code→message table covering every screen's codes: the same
 * `code` means different things in different domains here (`RESOURCE_CONFLICT` is "still
 * referenced elsewhere" on `Roles.tsx`, "that slug is already taken" on `Workspace.tsx`, "that
 * username is already in use" on `Users.tsx` — three genuinely different operator-facing meanings
 * for one code, not a divergence a shared table could resolve without a screen-specific parameter
 * every caller would have to thread through anyway). Consolidating those into one wrong answer
 * would be a regression, not a fix — see the audit fix's own instruction to preserve each
 * screen's existing per-code copy rather than picking one.
 *
 * @complexity O(1) — two `instanceof` checks, no iteration.
 * @overallScore 100
 */
export function describeApiError({ e, fallback }: { e: unknown; fallback: string }, _optional: Record<string, never> = {}): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message || fallback : fallback;
}
