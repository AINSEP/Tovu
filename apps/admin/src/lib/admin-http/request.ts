import { decodeApiError } from "@jini-ai/protocol";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

import { adminFailureChannel, isPageWideFailure, publishAdminFailure } from "../admin-failure-channel";
import { isPageUnloading } from "@jini-ai/admin/shell/lib/page-lifecycle";
import { serverReconnect, shouldRetryAfterReconnect, UPSTREAM_REFUSED_HEADER, UPSTREAM_REFUSED_VALUE, type ServerReconnect } from "../server-reconnect";
import { BASE } from "@jini-ai/admin/shell/lib/admin-http/config";


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

/** Sentinel for "the response body was not parseable JSON", distinct from a body that legitimately
 * parsed to `null`/`{}` — those prove an application answered, and must keep the old behavior. */
const UNPARSEABLE_BODY = Symbol("unparseable-json-body");

/**
 * `fetch`, with the one failure mode it signals by REJECTING translated into an `ApiError` like
 * every other failure here.
 *
 * A rejected `fetch` (a `TypeError`: DNS failure, connection refused at the origin itself, offline,
 * TLS failure) is the case where nothing is listening where the admin app is served from — the
 * neighbouring route to {@link request}'s unparseable-5xx case, and the one that never reaches its
 * error handling at all. Unwrapped it surfaces as the browser's own "Failed to fetch"/"NetworkError
 * when attempting to fetch resource", which is both browser-specific and says nothing about Tovu.
 *
 * `AbortError` is deliberately re-thrown untouched: a caller-cancelled request is not a reachability
 * failure, and reporting it as one would be exactly the misleading-assertion bug this fixes. The
 * original failure text is preserved on `body.cause` rather than discarded.
 *
 * Only a `TypeError` gets wrapped — the type both the browser's `fetch` and Node's `undici` reject
 * with for DNS failure/connection refused/offline/TLS failure, per the paragraph above. Anything
 * else `fetch` rejects with (there is no other real case, but a caller could stub one, e.g. in a
 * test) is not a reachability failure this function has evidence for, and is re-thrown as-is rather
 * than relabeled — the same non-assertion discipline the unparseable-5xx case above already applies.
 *
 * @complexity O(1) plus the request itself.
 * @overallScore 100
 */
/** `cause.name` without assuming `cause instanceof Error` — a fired `AbortSignal.timeout()` rejects
 *  `fetch` with a `DOMException`, and DOMException's `instanceof Error` result is realm-dependent
 *  (true against Node's own global, observed false against a test environment's jsdom-provided
 *  global). Duck-typing `name` is the only check that holds in both. */
function errorName({ value }: { value: unknown }, _optional: Record<string, never> = {}): string | undefined {
  if (!value || typeof value !== "object" || !("name" in value)) return undefined;
  return typeof value.name === "string" ? value.name : undefined;
}

/**
 * Classifies a `fetch()` rejection cause and throws the appropriate translated error — the whole
 * catch-block body {@link fetchOrThrowUnreachable} used to carry inline. Pulled into its own
 * function (2026-09-04, complexity pass) purely to drop nesting: Cognitive Complexity charges extra
 * for a construct nested inside another (here, three `if`s and a ternary all nested inside the
 * `catch`), and that penalty is what pushed the caller to 10 against a 9 ceiling even though
 * cyclomatic complexity (which does not weight nesting) was already within bounds at 7. Moving the
 * SAME checks into a function of their own does not remove any branch — cyclomatic is unchanged —
 * it only resets the nesting depth they're scored at. Always throws; never returns normally, exactly
 * like the catch block it replaces.
 */
function throwTranslatedFetchFailure({ cause }: { cause: unknown }, _optional: Record<string, never> = {}): never {
  if (errorName({ value: cause }) === "AbortError") throw cause;
  if (errorName({ value: cause }) === "TimeoutError") {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError({ message: timeoutApiMessage(), status: 0 }, { code: REQUEST_TIMEOUT_CODE, body: { cause: message } });
  }
  if (!(cause instanceof TypeError)) throw cause;
  // A navigation cancels in-flight fetches with this SAME `TypeError`, after `pagehide` (see
  // `page-lifecycle.ts`). That is a cancellation, not evidence the server is down.
  if (isPageUnloading()) throw new DOMException("request cancelled: the page is unloading", "AbortError");
  throw new ApiError({ message: unreachableApiMessage({}), status: 0 }, { code: API_UNREACHABLE_CODE, body: {
    cause: cause.message,
  } });
}

export async function fetchOrThrowUnreachable({ url, init }: { url: string; init: RequestInit }, _optional: Record<string, never> = {}): Promise<Response> {
  // A caller-supplied signal (none exist today, but `AbortError` handling below already
  // anticipates one) is honored as-is; otherwise every request is bounded so a queued-forever
  // request (see `REQUEST_TIMEOUT_CODE`'s own doc) cannot hang a screen indefinitely.
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal });
  } catch (cause) {
    return throwTranslatedFetchFailure({ cause });
  }
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

/** Builds `fetch`'s own `init`, merging in `request`'s two fixed defaults (`credentials`,
 *  `Content-Type`) under whatever the caller passed. Pulled out of `request` (2026-09-04, complexity
 *  pass) purely to carry the `= {}` default itself: TypeScript still resolves `buildFetchInit(init)`
 *  correctly when `request`'s own `init` argument is omitted (`undefined` triggers this function's
 *  default exactly as it did `request`'s), so no call site — inside or outside this file — changes
 *  behavior; only which function's signature carries the default-parameter branch changes.
 *
 *  `headers` is spread and rebuilt LAST, after `...init`, so `init`'s other fields (`method`, `body`,
 *  `credentials`) can still override the fixed defaults above them, but `init.headers` itself always
 *  merges onto the `Content-Type` default rather than replacing the whole `headers` object outright —
 *  a caller passing one custom header (e.g. `If-Match`) must not silently lose `Content-Type` (see
 *  `setDockerfileSource`'s regression test in `api-endpoint-option-branches.unit.test.ts`). A caller
 *  that sets its own `Content-Type` still wins, since it's spread after the default.
 *
 *  Exported (browser-file-scope-only otherwise) purely so `api-build-fetch-init.unit.test.ts` can
 *  assert this merge order directly — no in-repo caller currently overrides `Content-Type` itself, so
 *  that branch would otherwise be unreachable through the public `api` surface. */
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

export function buildFetchInit(init: RequestInit = {}): RequestInit {
  const callerHeaders = init.headers ?? {};
  // Header names are case-insensitive: a caller's lowercase "content-type" beside this default's
  // capitalised key would be sent as two values joined with a comma, which the server refuses.
  const callerSetsType = new Headers(callerHeaders).has("content-type");
  return {
    credentials: "same-origin",
    ...init,
    headers: callerSetsType ? callerHeaders : { "Content-Type": "application/json", ...callerHeaders },
  };
}

/** Parses `res`'s body as JSON, folding the "not valid JSON at all" case into the same
 *  `UNPARSEABLE_BODY` sentinel {@link request} always used, via `wasUnparseable`. `body` is `{}`
 *  when unparseable (unchanged from `request`'s own prior fallback) and the raw parsed value
 *  otherwise — including a legitimate JSON literal `null`, which is NOT the same thing as
 *  unparseable (see `UNPARSEABLE_BODY`'s own doc). Pulled out of `request` (2026-09-04, complexity
 *  pass) as its own step; the two callers below (`notifyIfUnauthenticated`,
 *  `buildRequestFailedError`) both need `wasUnparseable`, not just `body`. */
async function parseJsonBody(res: Response, { requireJson = false }: { requireJson?: boolean } = {}): Promise<{ body: Record<string, unknown>; wasUnparseable: boolean }> {
  const parsed = await res.json().catch((error: unknown) => {
    if (requireJson) throw error;
    return UNPARSEABLE_BODY;
  });
  const wasUnparseable = parsed === UNPARSEABLE_BODY;
  return { body: wasUnparseable ? {} : parsed, wasUnparseable };
}

/** The one side effect on `request`'s error path: notifying every {@link onUnauthenticated}
 *  listener when, and only when, this non-2xx response is a genuine session invalidation. Gated on
 *  `status === 401 && code === "UNAUTHENTICATED"` specifically — not bare 401, and not 403. Bare 401
 *  is overloaded in this codebase: a relayed third-party failure (bad vendor key) can also be a 401,
 *  see `onUnauthenticated`'s own doc comment. Only
 *  `dev-auth.ts`'s genuine session-invalidity 401s carry this code. 403 means an authenticated
 *  principal lacks a permission, a completely different, per-action condition that must not kick the
 *  operator back to the login screen. Pulled out of `request` (2026-09-04, complexity pass) as its
 *  own step, run before {@link buildRequestFailedError} builds the thrown error. */
function notifyIfUnauthenticated({ status, body }: { status: number; body: Record<string, unknown> }): void {
  if (status === 401 && decodeApiError({ body }).code === "UNAUTHENTICATED") {
    adminFailureChannel.reset();
    for (const listener of unauthenticatedListeners) listener();
  }
}

/** Builds the {@link ApiError} for `request`'s non-2xx branch. Three different failures can leave
 *  the operator staring at this error, and they need different actions:
 *
 *  1. **An application answered and reported a failure** — the body is JSON with an `error`/`code`
 *     envelope. Its own message wins, unchanged.
 *  2. **Nothing was listening upstream.** In dev, Vite's `/api` proxy answers an unreachable target
 *     with a bare `500`, `Content-Type: text/plain`, and a zero-length body (verified live against
 *     this repo's own proxy config, 2026-08-06); a production reverse proxy answers the same shape
 *     with 502/503/504. `fetch` resolves normally in this case — the proxy IS reachable — so this is
 *     the branch that must not report a plain "500".
 *  3. **The origin itself was unreachable**, so `fetch` rejected — handled one level down in
 *     {@link fetchOrThrowUnreachable}, and never reaches this function.
 *
 *  Cases 2 and 3 are the ones the old message got wrong. Note the limit of what case 2 can prove: an
 *  unparseable 5xx is *also* what a genuine server-side crash looks like when it escapes to
 *  Express's default (HTML) error handler rather than this codebase's JSON envelopes — the wire
 *  shape is the same, so this cannot distinguish them, and the message deliberately does not claim
 *  to. It names the likeliest cause, keeps the status for the other one, and points at the server
 *  either way, which is the correct first action for both. Parseable JSON (including a literal
 *  `null` body) is the discriminator that IS reliable: it proves an application, not a proxy,
 *  composed the response, so an otherwise empty error names its request and HTTP status, with
 *  guidance to check for a completed write before trying again.
 *
 *  Pulled out of `request` (2026-09-04, complexity pass) as its own pure step: a `{status, body,
 *  wasUnparseable}` triple in, an `ApiError` out, no `fetch`/parsing involved. */
function buildRequestFailedError({
  status,
  body,
  wasUnparseable,
  init,
  path,
}: {
  status: number;
  body: Record<string, unknown>;
  wasUnparseable: boolean;
  init: RequestInit | undefined;
  path: string;
}): ApiError {
  const noAppEnvelope = wasUnparseable && status >= 500;
  const method = init?.method ?? "GET";
  const fallback = redactSecretShapes({ text: `The API could not finish ${method} ${path} (HTTP ${status}). Check whether your change was saved before trying again. Copy details and report this problem.` }).text;
  const decoded = decodeApiError({ body }, {
    fallbackMessage: noAppEnvelope ? unreachableApiMessage({}, { status }) : fallback,
  });
  const error = new ApiError({ message: decoded.message, status }, { code: noAppEnvelope ? API_UNREACHABLE_CODE : decoded.code, body });
  return error;
}

/**
 * The single fetch seam every `api.*` call goes through: sends JSON, parses JSON, and turns any
 * non-2xx into an {@link ApiError}.
 *
 * `onOk`, when passed, is called with the raw `Response` in `response` immediately before this function resolves
 * on a 2xx — the ONE hook a caller needing something off the wire that isn't in the JSON body (e.g.
 * `getDockerfileSource`/`setDockerfileSource` reading the `ETag` response header, 2026-08-15) can
 * use without reimplementing this function's own fetch/parse/error-shaping. Deliberately not called
 * on the error path: nothing today needs a response header out of a FAILED request, and every
 * caller that does can still read `ApiError.body` (already routed through non-2xx responses).
 *
 * See {@link buildFetchInit}, {@link parseJsonBody}, {@link notifyIfUnauthenticated}, and
 * {@link buildRequestFailedError} for the steps this orchestrates — each carries its own doc for why
 * its branch exists; this function's own job is only the sequencing.
 *
 * @complexity O(1) plus the request and body parse.
 * @overallScore 100
 */
/** One send through the fetch seam, no restart retry. Exported for `server-reconnect` tests only. */
export async function requestOnce<T>(
  { path, init, onOk }: { path: string; init?: RequestInit; onOk?: (required: { response: Response }, optional?: Record<string, never>) => void },
  options: AuthenticatedAdminRequestOptions = {},
): Promise<T> {
  const res = await fetchOrThrowUnreachable({ url: `${options.basePath ?? BASE}${path}`, init: buildFetchInit(init) });
  const { body, wasUnparseable } = await parseJsonBody(res, { requireJson: res.ok && options.requireJson });
  if (!res.ok) {
    notifyIfUnauthenticated({ status: res.status, body });
    const defaultError = buildRequestFailedError({ status: res.status, body, wasUnparseable, init, path });
    const error = options.errorFactory?.({ response: res, error: defaultError }) ?? defaultError;
    // The dev proxy's mark for "the API refused the connection": this request never reached it.
    if (res.headers.get(UPSTREAM_REFUSED_HEADER) === UPSTREAM_REFUSED_VALUE) upstreamRefusedErrors.add(error);
    throw error;
  }
  onOk?.({ response: res });
  return body as T;
}

/** Errors the dev proxy proved never reached the server (see {@link requestOnce}). */
const upstreamRefusedErrors = new WeakSet<object>();

/**
 * Sends once; if the server was unreachable (a restart), waits for `/readyz` to answer and sends
 * once more — reads always, writes only when provably undelivered or `retryWrites` (2026-10-05,
 * `server-reconnect.ts`). Exported for its test; every caller uses {@link request}.
 */
export async function requestRidingOutRestart<T>(
  { send, method }: { send: () => Promise<T>; method: string | undefined },
  { retryWrites = false, reconnect = serverReconnect }: { retryWrites?: boolean; reconnect?: ServerReconnect } = {},
): Promise<T> {
  try {
    const result = await send();
    reconnect.markReachable();
    return result;
  } catch (error) {
    const retry = error instanceof ApiError && shouldRetryAfterReconnect({
      code: error.code, unreachableCode: API_UNREACHABLE_CODE, method, upstreamRefused: upstreamRefusedErrors.has(error), retryWrites,
    });
    if (!retry || !(await reconnect.waitUntilReachable())) throw error;
    return send();
  }
}

/** Publish one unexpected failure after restart recovery settles, preserving the caller's rejection.
 * The captured generation prevents an older session/site response from restoring cleared details.
 * @complexity O(1) orchestration plus existing request/retry and bounded failure formatting.
 * @overallScore 98 — approved backend copy remains a server disclosure contract.
 */
export async function request<T>({ path }: { path: string }, { init, onOk, options = {} }: { init?: RequestInit; onOk?: (required: { response: Response }, optional?: Record<string, never>) => void; options?: AuthenticatedAdminRequestOptions } = {}): Promise<T> {
  const generation = adminFailureChannel.getGeneration();
  const method = init?.method ?? "GET";
  try {
    return await requestRidingOutRestart({ send: () => requestOnce<T>({ path, init, onOk }, options), method }, options);
  } catch (error) {
    // Only the final unexpected failure is shared; callers keep their original error and body.
    publishFinalFailure({ error, path, method, generation }, { failureEntry: options.failureEntry, basePath: options.basePath ?? BASE });
    throw error;
  }
}

/** Shares a final 5xx or no-response failure as one admin notice. A 4xx is the caller's to explain. */
function publishFinalFailure(
  { error, path, method, generation }: { error: unknown; path: string; method: string; generation: number },
  { failureEntry, basePath }: { failureEntry?: "page"; basePath?: string } = {},
): void {
  try {
    if (error instanceof ApiError && isPageWideFailure({ status: error.status, method, code: error.code })) {
      publishAdminFailure({ body: error.body, path, method, status: error.status, generation, ...(failureEntry ? { entry: failureEntry } : {}) }, { basePath });
    }
  } catch { /* Notice effects must never replace the original request rejection. */ }
}

export interface AuthenticatedAdminRequestOptions {
  /** Explicit local API owners only: never send admin cookies to a provider URL. */
  basePath?: "/api/admin/v1" | "/api/assistant/chats" | "/api/agents";
  signal?: AbortSignal;
  headers?: Record<string, string>;
  keepalive?: boolean;
  onOk?: (required: { response: Response }, optional?: Record<string, never>) => void;
  retryWrites?: boolean;
  /** Transcript/inventory readers reject malformed successful JSON instead of accepting `{}`. */
  requireJson?: boolean;
  /** The shared posts routes also serve pages; a caller that knows the row is a page says so, so the failure notice says "page". */
  failureEntry?: "page";
  /** Preserve an adapter's status-bearing error contract after session invalidation is checked. */
  errorFactory?: (input: { response: Response; error: ApiError }) => ApiError;
}

/** The fetch init fragment for a body: none, a raw Blob with its own type, or JSON. */
function requestPayload({ body }: { body: unknown }, _optional: Record<string, never> = {}): { body?: BodyInit; headers?: Record<string, string> } {
  if (body === undefined) return {};
  if (body instanceof Blob) return { body, headers: { "Content-Type": body.type || "application/octet-stream" } };
  return { body: JSON.stringify(body) };
}

/** Authenticated package adapters share cookies, bounded requests and session invalidation
 * with every native screen; paths are relative to the explicitly selected local API prefix. */
export function authenticatedAdminRequest<T>(
  { path, method, body }: { path: string; method: string; body?: unknown },
  options: AuthenticatedAdminRequestOptions = {},
): Promise<T> {
  const payload = requestPayload({ body });
  return request<T>({ path }, { init: {
    method,
    ...payload,
    headers: { ...payload.headers, ...options.headers },
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.keepalive === undefined ? {} : { keepalive: options.keepalive }),
  }, onOk: options.onOk, options });
}

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
