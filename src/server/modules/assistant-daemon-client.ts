/**
 * @file Shared plumbing for talking to the standalone agent daemon
 * (`src/assistant/agent-daemon-server.ts`) over HTTP — extracted from `assistant.ts` (2026-08-18,
 * ADR-059) so `assistant-ag-ui.ts` can reach the SAME daemon process without either duplicating
 * this file's retry/known-failed/token-header logic or building a second one. `assistant.ts`
 * itself is the only other caller and its behavior is unchanged by this extraction — every
 * exported name here has the exact body it had inline in that file before this split.
 *
 * `AGENT_DAEMON_URL` is resolved ONCE at module scope, same as it always was — see
 * `assistant-proxy-routes.test.ts`'s own header for why that matters for tests (the stand-in
 * daemon must be listening, and `JINI_AGENT_DAEMON_URL`/`JINI_AGENT_DAEMON_PORT` must be set,
 * BEFORE this module is first imported).
 */
import http from "node:http";
import { Readable } from "node:stream";

import type { Request, Response } from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR, RUN_PRINCIPAL_HEADER } from "../../assistant/index.js";
import { ensureAssistantDaemonStarted } from "../agent-daemon/daemon-supervisor.js";
import { getAuthedPrincipal } from "../middleware/dev-auth.js";
import { getAssistantDaemonFailureReasonCode, isAssistantDaemonKnownFailed } from "../readiness-state.js";

export const AGENT_DAEMON_URL =
  process.env.JINI_AGENT_DAEMON_URL ?? `http://127.0.0.1:${Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319)}`;

/**
 * Builds the outbound header set for one proxied request. Every entry is resolved per-request, not
 * once at module load — the token in particular must not be captured at module scope: ES module
 * imports are all evaluated before `src/index.ts`'s own top-level `main()` call runs, and `main()`
 * is what mints the token.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function outboundHeaders(req: Request, res: Response): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (token) headers.Authorization = `Bearer ${token}`;

  // Who the daemon is being asked to act for. The bearer token above says "this is Tovu's proxy";
  // this says "and it is speaking for this admin", which is what the daemon compares against the
  // run's recorded owner (`src/assistant/run-ownership.ts`). Safe to assert here and nowhere else:
  // every caller of this function sits behind `requireAdminSession`, so the value is always a
  // server-verified session principal and never anything the browser chose.
  headers[RUN_PRINCIPAL_HEADER] = getAuthedPrincipal(res).id;

  // Reconnect cursor for an SSE stream. The browser's `EventSource` sets this itself on every
  // automatic reconnect; without it the daemon replays the run from event 0.
  const lastEventId = req.get("last-event-id");
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;

  return headers;
}

/**
 * How long a proxied request will keep retrying a refused connection before giving up.
 *
 * Sized for the boot window, not for an outage. `src/index.ts` spawns the daemon from INSIDE
 * `app.listen()`'s callback, so this server accepts requests several seconds before :4319 exists —
 * and the admin dock starts polling the moment the page loads. Every one of those polls used to
 * answer 502 and print a full `TypeError: fetch failed` stack, which read like a crash and was
 * really "not finished starting".
 *
 * Retrying makes those requests SUCCEED once the daemon arrives, rather than merely failing quietly.
 * Bounded so a genuinely dead daemon still fails fast enough to be visible.
 */
const DAEMON_CONNECT_RETRY_MS = 8_000;
const DAEMON_CONNECT_RETRY_INTERVAL_MS = 250;

/** True for the "nothing is listening on that port yet" shape specifically — NOT for a daemon that
 *  answered with an error, which is a real failure and must not be retried. */
function isConnectionRefused(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | undefined)?.cause;
  return cause?.code === "ECONNREFUSED" || cause?.code === "ECONNRESET";
}

/** Set while a retry loop is in progress, so a page's worth of concurrent polls logs ONE line
 *  between them instead of one per request. Reset on the first success. */
let daemonUnreachableSince: number | null = null;

/**
 * Checked FIRST, before any `fetch` is attempted, by {@link fetchAgentDaemon}.
 * `isAssistantDaemonKnownFailed()` is `true` once `daemon-supervisor.ts` knows the daemon is not
 * usable — either it never got a process running for this boot at all (a spawn-level `error`), OR
 * automatic respawn gave up after repeated crashes (the crash-loop or port-conflict cap tripped,
 * which can happen hours into a boot that started fine). Either way this is a much stronger signal
 * than "the request failed to connect", because "something answered on the daemon's port" is not
 * proof of health: a leaked port can still be squatted by an orphaned daemon from a PREVIOUS run,
 * which would otherwise go on answering requests as if it were the daemon this boot just spawned.
 * Once we know the daemon is not usable, we stop trusting the port at all and fail immediately
 * instead of racing a `fetch` against whatever (if anything) is actually listening there.
 *
 * This is also the on-demand self-healing seam: every request short-circuited here calls
 * {@link ensureAssistantDaemonStarted}, not just the first one, because that function is
 * single-flight and cooldown-guarded on its own side (`daemon-supervisor.ts`'s `ensureStarted()`)
 * — a daemon that already has a spawn attempt running or scheduled treats the extra calls as cheap
 * no-ops, and a durably broken one is re-armed no more often than its own 30s cooldown floor
 * allows.
 *
 * Deliberately NOT awaited and does not change THIS request's outcome: `ensureStarted()` is
 * synchronous and never waits for the daemon to become healthy (there is no such signal in this
 * codebase — see `daemon-supervisor.ts`'s own header), so recovery is purely a background side
 * effect for future requests. This request always answers 503 immediately either way; blocking it
 * on a daemon that may never come back up would just add a second way for it to hang.
 *
 * @returns `true` if a 503 was already sent (caller must return without proceeding).
 */
export function respondIfDaemonKnownFailed(res: Response): boolean {
  if (!isAssistantDaemonKnownFailed()) return false;

  const recovery = ensureAssistantDaemonStarted();
  if (!recovery.ok) {
    // ONE concise line, matching this module's own `daemonUnreachableSince` logging convention —
    // worth an operator seeing (it names WHY on-demand recovery didn't fire this time: never
    // started this boot, or cooling down after a recent attempt), not worth a stack trace.
    console.error(`[assistant] on-demand daemon recovery did not start: ${recovery.reason}`);
  }

  // "unavailable", not "failed to start" — true for BOTH latch causes (never started this boot, or
  // gave up after crash-looping). `reasonCode` is the exact string `daemon-supervisor.ts` latched
  // (see `getAssistantDaemonFailureReasonCode`'s own doc) so a caller can tell those two situations
  // apart instead of guessing from "unavailable" alone; `null` is defensive only — this branch is
  // unreachable unless something is latched.
  res.status(503).json({
    error: "the agent daemon is currently unavailable",
    code: "AGENT_DAEMON_KNOWN_FAILED",
    reasonCode: getAssistantDaemonFailureReasonCode(),
  });
  return true;
}

/** Resolves the target URL and verb for one proxied request — `options.path`/`options.method` when
 *  the caller supplies them, else the request's own path/verb (see {@link fetchAgentDaemon}'s own
 *  doc for which callers need which). Split out of `fetchAgentDaemon` so its two `??` fallbacks are
 *  scored in this small function's own complexity budget instead of the loop-and-retry function's. */
function resolveDaemonRequest(req: Request, options: { path?: string; method?: string }): { target: string; method: string } {
  return { target: `${AGENT_DAEMON_URL}${options.path ?? req.originalUrl}`, method: options.method ?? req.method };
}

/** Builds one `fetch()` call's `RequestInit`, JSON-encoding `body` only when the caller supplied
 *  one (a proxied GET must not send a `body` at all). */
function buildDaemonFetchInit(req: Request, res: Response, method: string, body: unknown): RequestInit {
  return { method, headers: outboundHeaders(req, res), body: body === undefined ? undefined : JSON.stringify(body) };
}

/** Clears the "waiting for the daemon" latch and logs recovery — called unconditionally after every
 *  successful `fetch`, a no-op when the latch was never set (the common case: most requests never
 *  hit the boot window at all). */
function markDaemonReachable(): void {
  if (daemonUnreachableSince === null) return;
  console.log(`[assistant] agent daemon reachable after ${Math.round((Date.now() - daemonUnreachableSince) / 100) / 10}s`);
  daemonUnreachableSince = null;
}

/** Sets the "waiting for the daemon" latch and logs ONE line the first time a retry loop starts —
 *  a no-op on every subsequent retry within the same loop, so concurrent/repeated polls don't each
 *  print their own line (see {@link daemonUnreachableSince}'s own doc). */
function noteDaemonUnreachableWaiting(): void {
  if (daemonUnreachableSince !== null) return;
  daemonUnreachableSince = Date.now();
  // ONE concise line, not a stack. During boot this is expected, and a 10-line
  // `TypeError: fetch failed` per poll buried the real startup output.
  console.log(`[assistant] waiting for the agent daemon at ${AGENT_DAEMON_URL}…`);
}

/** True only for the "nothing is listening yet, and we're still inside the retry window" shape.
 *  Anything else — DNS, TLS, an abort, a daemon that answered badly, or a window that's expired —
 *  is a real failure and retrying would just delay the report. */
function shouldRetryConnection(error: unknown, deadline: number): boolean {
  return isConnectionRefused(error) && Date.now() < deadline;
}

/** Writes the terminal 502 for a genuinely unreachable daemon. The full error is kept here — this
 *  one IS a fault worth a stack, unlike the boot-window retries above. */
function respondDaemonUnreachable(res: Response, error: unknown): null {
  console.error(`[assistant] agent daemon unreachable at ${AGENT_DAEMON_URL}`, error);
  daemonUnreachableSince = null;
  res.status(502).json({ error: "assistant is unavailable", code: "BAD_GATEWAY" });
  return null;
}

/**
 * Fetches from the daemon with the boot-window retry described above. Does NOT relay the response
 * itself — every caller decides that (stream it through unmodified, or read the parsed body first).
 *
 * @param options.path - The daemon-side path to fetch, e.g. `/api/runs` or
 *   `/api/runs/<id>/events`. Defaults to `req.originalUrl` (Tovu's own inbound path), which is
 *   correct for a caller that mounts a route at the SAME path the daemon exposes (every route in
 *   `assistant.ts`). A caller whose own route path differs from the daemon path it needs to reach
 *   (`assistant-ag-ui.ts`, whose one route fans out to two different daemon endpoints) must pass
 *   this explicitly.
 * @param options.method - Defaults to `req.method`, for the same "same path, same verb" reason.
 * @returns the upstream response, or `null` once this function has already written a response of
 *   its own (503 known-failed, or 502 genuinely unreachable) — the caller's contract is to return
 *   immediately on `null` without touching `res` again.
 */
export async function fetchAgentDaemon(
  req: Request,
  res: Response,
  options: { path?: string; method?: string; body?: unknown } = {},
): Promise<globalThis.Response | null> {
  if (respondIfDaemonKnownFailed(res)) return null;
  const { target, method } = resolveDaemonRequest(req, options);
  const deadline = Date.now() + DAEMON_CONNECT_RETRY_MS;

  for (;;) {
    try {
      const upstream = await fetch(target, buildDaemonFetchInit(req, res, method, options.body));
      markDaemonReachable();
      return upstream;
    } catch (error) {
      if (!shouldRetryConnection(error, deadline)) return respondDaemonUnreachable(res, error);
      noteDaemonUnreachableWaiting();
      await new Promise((r) => setTimeout(r, DAEMON_CONNECT_RETRY_INTERVAL_MS));
    }
  }
}

/** Thin wrapper matching `assistant.ts`'s original call shape exactly: forward the SAME path/method
 *  this request arrived on, with an optional rewritten body. */
export async function forwardToAgentDaemon(req: Request, res: Response, body?: unknown): Promise<globalThis.Response | null> {
  return fetchAgentDaemon(req, res, { body });
}

/** True for the "nothing is listening on that port yet" shape from a raw `node:http` request error
 *  (`error.code` directly) — the `node:http` equivalent of {@link isConnectionRefused}, which reads
 *  `error.cause.code` because `fetch`'s own errors wrap the underlying cause one level deeper. */
function isNodeConnectionRefused(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  return code === "ECONNREFUSED" || code === "ECONNRESET";
}

/** One `node:http` GET attempt against the daemon, settled instead of thrown so
 *  {@link fetchAgentDaemonEventStream}'s retry loop can inspect a failed attempt without a
 *  try/catch per iteration — the same shape `fetchAgentDaemon`'s own loop gets for free from
 *  `fetch()`'s rejected promise, reproduced by hand here since `http.request` reports failure via an
 *  `"error"` event instead. */
function requestDaemonEventStream(
  target: string,
  headers: Record<string, string>,
): Promise<{ statusCode: number; body: ReadableStream<Uint8Array> } | { error: unknown }> {
  return new Promise((resolve) => {
    const upstreamReq = http.request(target, { method: "GET", headers }, (upstreamRes) => {
      resolve({ statusCode: upstreamRes.statusCode ?? 502, body: Readable.toWeb(upstreamRes) as ReadableStream<Uint8Array> });
    });
    upstreamReq.on("error", (error) => resolve({ error }));
    upstreamReq.end();
  });
}

/**
 * {@link fetchAgentDaemon}'s events-stream-specific sibling — GET only, and deliberately built on
 * `node:http` instead of the global `fetch`.
 *
 * Node's `fetch` (undici) applies a default ~300s IDLE-body timeout to every request, refreshed only
 * by actual bytes received; the daemon's own SSE channel sends none while a tool call is parked
 * waiting on a human (`tool-surface-exchanges.ts`'s `DEFAULT_SURFACE_IDLE_TTL_MS` alone is 5 minutes,
 * right at that default, with no heartbeat/ping anywhere in the channel to reset it) — so a
 * genuinely-still-open wait was being torn down by `fetch` as if the connection had stalled, well
 * before the daemon ever produced the model's post-tool-call answer. `node:http`'s classic
 * `ClientRequest` sets no such timeout by default, which is what a stream whose only real deadline is
 * the daemon's own exchange TTL needs.
 *
 * Same boot-window connection-refused retry as `fetchAgentDaemon`, mirrored here rather than shared,
 * because the underlying transport — and so its error shape (`error.code` vs `error.cause.code`) —
 * differs.
 */
export async function fetchAgentDaemonEventStream(
  req: Request,
  res: Response,
  path: string,
): Promise<{ statusCode: number; body: ReadableStream<Uint8Array> } | null> {
  if (respondIfDaemonKnownFailed(res)) return null;
  const target = `${AGENT_DAEMON_URL}${path}`;
  const headers = outboundHeaders(req, res);
  const deadline = Date.now() + DAEMON_CONNECT_RETRY_MS;

  for (;;) {
    const attempt = await requestDaemonEventStream(target, headers);
    if (!("error" in attempt)) {
      markDaemonReachable();
      return attempt;
    }
    if (!isNodeConnectionRefused(attempt.error) || Date.now() >= deadline) {
      return respondDaemonUnreachable(res, attempt.error);
    }
    noteDaemonUnreachableWaiting();
    await new Promise((r) => setTimeout(r, DAEMON_CONNECT_RETRY_INTERVAL_MS));
  }
}
