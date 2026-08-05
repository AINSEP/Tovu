/**
 * @file ADR-049 (process-shape correction) — Tovu never spawns a coding-agent CLI itself. This
 * module is a thin, session-authenticated reverse proxy in front of the standalone agent daemon
 * (`src/assistant/agent-daemon-server.ts`, a separate OS process `src/index.ts` spawns after its
 * own boot completes). It owns exactly one thing the daemon cannot: verifying the browser's admin
 * session. Everything downstream of that is the daemon's to decide, so this module's job is to
 * report the verified principal accurately and nothing more — stamped into a new run's
 * `contextRef` at creation, and asserted in `RUN_PRINCIPAL_HEADER` on every request thereafter so
 * the daemon can compare it against the run's recorded owner (`src/assistant/run-ownership.ts`).
 * Authorization deliberately does NOT live here: the daemon owns run state, so it is the only
 * process where an ownership record and the run it protects share a lifetime.
 *
 * `/api/delegated-tool-calls` is NOT mounted here. Tool execution moved into the daemon process
 * entirely (see that file's module doc for why: `DelegatedToolBridge` writes `tool_use`/
 * `tool_result` straight into the run's own event log via `lifecycle.emit()`, so it has to live
 * wherever that `RunLifecycle` really is). A spawned CLI's injected `.mcp.json` calls the
 * daemon's own origin directly — this module is never in that path.
 *
 * Authentication, both directions: inbound, `requireAdminSession` gates every route below.
 * Outbound, `forwardToAgentDaemon` attaches `Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN>` —
 * the daemon rejects any request without it (`src/assistant/daemon-auth.ts`), so this proxy is the
 * only thing on the machine that can reach it. That env var is read INSIDE the request path, never
 * at module scope like `AGENT_DAEMON_URL` below: ES module imports are all evaluated before
 * `src/index.ts`'s own top-level `main()` call runs, and `main()` is what mints the token — a
 * module-scope read would capture `undefined` forever.
 *
 * Header forwarding: `Last-Event-ID` is forwarded on every proxied request. The daemon's SSE route
 * (`@jini-ai/http-kit`'s `requestedAfterCursor`) reads exactly that header to resume a stream after
 * a cursor; dropping it made a browser tab's automatic `EventSource` reconnect replay the run's
 * entire event history from the start, duplicating every message already shown in the chat pane.
 *
 * MCP-UI redemption is no longer a pure passthrough. `proxyMcpUiToolCall` now tries LOCAL delivery
 * first, against `byokSurfaceExchanges` — the same `SurfaceExchangeStore` reference
 * `modules/assistant-byok.ts` composed its tool surface with, passed in by `app.ts` at boot (not
 * rebuilt here; a second instance would leave every BYOK-mode exchange unreachable). Only when that
 * store reports `unknown-or-closed` — meaning the exchange isn't one of this process's own BYOK
 * parks — does the request fall through to the daemon, on the theory that it belongs to a Local CLI
 * run instead. A `binding-mismatch` is answered locally without forwarding: that reason means the
 * exchange WAS found here, just not for this caller, and forwarding an id the daemon has never seen
 * would only spend a wasted round trip discovering the same 409 the local store already knows.
 */
import type { AgentSummary } from "@jini-ai/http-kit";
import type { Express, NextFunction, Request, Response } from "express";

import { A2UI_ACTIONS_PATH } from "../../assistant/a2ui-actions-route";
import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/daemon-auth";
import { getLiveClaudeModels, unionModels } from "../../assistant/live-model-cache";
import { isMcpUiToolCallAllowed } from "../../assistant/mcp-ui-tool-calls";
import { MCP_UI_TOOL_CALLS_PATH } from "../../assistant/mcp-ui-tool-calls-route";
import { RUN_PRINCIPAL_HEADER } from "../../assistant/run-ownership";
import { SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "../../assistant/surface-exchanges";
import { getAuthedPrincipal, requireAdminSession } from "../middleware/dev-auth";
import { isAssistantDaemonKnownFailed } from "../readiness-state";
import type { RouteDeps } from "../routes/types";
import type { ServerModuleHandle } from "./types";

const AGENT_DAEMON_URL =
  process.env.JINI_AGENT_DAEMON_URL ?? `http://127.0.0.1:${Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319)}`;

/** Streams `upstream`'s response back onto `res` as it arrives — required for the SSE run-events
 * endpoint, where buffering the whole body first would defeat live streaming entirely.
 *
 * Cancels on `res`'s `"close"`, not `req`'s. Node's `IncomingMessage` ("`req`") emits `"close"` once
 * its body has been fully consumed — for a request with a JSON body (e.g. `POST /api/runs`, whose
 * body Express's global `express.json()` parser (`src/server/app.ts`) already reads in full before
 * this function ever runs), that happens almost immediately, independent of the actual client
 * connection. A listener attached here — necessarily AFTER the `await fetch(...)` to the daemon in
 * `forwardToAgentDaemon`, itself after body-parsing — is registered too late to ever observe that
 * emission, so `req.on("close", ...)` was silently inert for every proxied POST: measured directly
 * (2026-08-05, isolated repro against this exact Express/Node version — see QA/E2E's report), an
 * identical EARLY listener caught `"close"` ~1ms after body-parsing, ~200ms before the response was
 * even sent, while a LATE listener at this function's real placement never fired at all. `res.on
 * ("close")`, by contrast, ties to the response's own lifecycle (finishes normally, or the
 * connection is torn down) — measured to fire correctly in both directions: never early on a
 * healthy request (POST or a fully-read multi-chunk SSE stream), and immediately on a genuine
 * mid-flight disconnect (POST or SSE). Same remedy `@jini-ai/daemon`'s http-kit commit `898303a5`
 * documents for the identical failure. */
async function relayResponse(upstream: globalThis.Response, req: Request, res: Response): Promise<void> {
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (!upstream.body) {
    res.end();
    return;
  }
  const reader = upstream.body.getReader();
  res.on("close", () => {
    reader.cancel().catch(() => undefined);
  });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

/**
 * Builds the outbound header set for one proxied request. Every entry is resolved per-request, not
 * once at module load — see this file's header for why the token in particular must not be
 * captured at module scope.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function outboundHeaders(req: Request, res: Response): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (token) headers.Authorization = `Bearer ${token}`;

  // Who the daemon is being asked to act for. The bearer token above says "this is Tovu's proxy";
  // this says "and it is speaking for this admin", which is what the daemon compares against the
  // run's recorded owner (`src/assistant/run-ownership.ts`). Safe to assert here and nowhere else:
  // `requireAdminSession` gates every route this function serves, so the value is always a
  // server-verified session principal and never anything the browser chose.
  headers[RUN_PRINCIPAL_HEADER] = getAuthedPrincipal(res).id;

  // Reconnect cursor for the SSE run-events stream. The browser's `EventSource` sets this itself
  // on every automatic reconnect; without it the daemon replays the run from event 0.
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

/** True for a JSON object body, false for an array/null/primitive — same guard
 *  `mcp-ui-tool-calls-route.ts` uses for the identical `body.params` shape on the daemon side. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
 * Checked FIRST, before any `fetch` is attempted, by every function below that talks to the
 * daemon. `isAssistantDaemonKnownFailed()` is `true` only once `index.ts`'s own spawn of the
 * daemon has confirmed-crashed — a much stronger signal than "the request failed to connect",
 * because "something answered on the daemon's port" is not proof of health: a leaked port can
 * still be squatted by an orphaned daemon from a PREVIOUS run, which would otherwise go on
 * answering requests as if it were the daemon this boot just spawned. Once we know our own spawn
 * is dead, we stop trusting the port at all and fail immediately instead of racing a `fetch`
 * against whatever (if anything) is actually listening there.
 *
 * @returns `true` if a 503 was already sent (caller must return without proceeding).
 */
function respondIfDaemonKnownFailed(res: Response): boolean {
  if (!isAssistantDaemonKnownFailed()) return false;
  res.status(503).json({ error: "the agent daemon failed to start for this boot", code: "AGENT_DAEMON_BOOT_FAILED" });
  return true;
}

/**
 * Fetches from the daemon with the boot-window retry described above, but does NOT relay the
 * response itself — every caller decides that: `proxyPassthrough`/`proxyRunStart` stream it
 * unmodified via {@link relayResponse}, while `respondWithEnrichedAgentList` needs the parsed body
 * to rewrite before it reaches the browser. Splitting the fetch from the relay is what makes that
 * second caller possible without duplicating the retry/known-failed/token-header logic below.
 *
 * @returns the upstream response, or `null` once this function has already written a response of
 *   its own (503 known-failed, or 502 genuinely unreachable) — the caller's contract is to return
 *   immediately on `null` without touching `res` again.
 */
async function forwardToAgentDaemon(req: Request, res: Response, body?: unknown): Promise<globalThis.Response | null> {
  if (respondIfDaemonKnownFailed(res)) return null;
  const target = `${AGENT_DAEMON_URL}${req.originalUrl}`;
  const deadline = Date.now() + DAEMON_CONNECT_RETRY_MS;

  for (;;) {
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: outboundHeaders(req, res),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (daemonUnreachableSince !== null) {
        console.log(
          `[assistant] agent daemon reachable after ${Math.round((Date.now() - daemonUnreachableSince) / 100) / 10}s`
        );
        daemonUnreachableSince = null;
      }
      return upstream;
    } catch (error) {
      // Only "nothing is listening yet" is worth waiting out. Anything else — DNS, TLS, an abort, a
      // daemon that answered badly — is a real failure and retrying would just delay the report.
      if (isConnectionRefused(error) && Date.now() < deadline) {
        if (daemonUnreachableSince === null) {
          daemonUnreachableSince = Date.now();
          // ONE concise line, not a stack. During boot this is expected, and a 10-line
          // `TypeError: fetch failed` per poll buried the real startup output.
          console.log(`[assistant] waiting for the agent daemon at ${AGENT_DAEMON_URL}…`);
        }
        await new Promise((r) => setTimeout(r, DAEMON_CONNECT_RETRY_INTERVAL_MS));
        continue;
      }
      // Genuinely unreachable. The full error is kept here — this one IS a fault worth a stack.
      console.error(`[assistant] agent daemon unreachable at ${AGENT_DAEMON_URL}`, error);
      daemonUnreachableSince = null;
      res.status(502).json({ error: "assistant is unavailable", code: "BAD_GATEWAY" });
      return null;
    }
  }
}

/** The one route that needs its body rewritten before forwarding: stamps the session-authenticated
 * principal into `contextRef` so the daemon (no cookie of its own) can answer `resolveDelegatedPrincipal`
 * for this run later, and can record who owns it. Every other route is a transparent pass-through
 * — they carry the same principal in a header instead, since they have no body to stamp. */
async function proxyRunStart(req: Request, res: Response): Promise<void> {
  const principal = getAuthedPrincipal(res);
  const body = (req.body ?? {}) as { contextRef?: unknown; agentId?: unknown; idempotencyKey?: unknown };

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(typeof body.contextRef === "string" ? body.contextRef : "{}") as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "'contextRef' must be a JSON-encoded object", code: "VALIDATION_ERROR" });
    return;
  }

  const upstream = await forwardToAgentDaemon(req, res, {
    ...body,
    contextRef: JSON.stringify({ ...decoded, principalId: principal.id }),
  });
  if (!upstream) return;
  await relayResponse(upstream, req, res);
}

async function proxyPassthrough(req: Request, res: Response): Promise<void> {
  const upstream = await forwardToAgentDaemon(req, res, req.method === "GET" || req.method === "HEAD" ? undefined : req.body);
  if (!upstream) return;
  await relayResponse(upstream, req, res);
}

/**
 * `GET /api/agents` / `POST /api/agents/rescan`'s dedicated handler — the one route pair that
 * needs the daemon's JSON body parsed and rewritten rather than streamed through unmodified.
 * Design: `ADS-memory/reports/local-cli-live-model-discovery-design-2026-08-05.md` §3.1.
 *
 * Both routes answer the identical `{agents: AgentSummary[]}` shape (`@jini-ai/http-kit`'s
 * `agentListRoute`/`rescanAgentsRoute`, both `ok({agents: await ...()})`), so one handler serves
 * both. For the one entry with `id === "claude"`, enriches `models`/`modelsSource` with a live
 * discovery call against the ADMIN's own stored `anthropic` execution credential (never the SITE's
 * — see `live-model-cache.ts`'s header) — UNIONED into the static fallback list, never replacing
 * it (design §3.5: the bare `sonnet`/`opus`/`haiku` aliases are resolved by the CLI itself at spawn
 * time and must never be at risk of being dropped by an API-account-scoped live list that doesn't
 * contain them). `modelsSource` is only overwritten to `"live"` when the live call actually
 * contributed at least one entry — a `null`/empty result leaves the daemon's own
 * `models`/`modelsSource: "fallback"` byte-identical, which is what makes the credential branch a
 * pure enrichment step rather than something the picker can be gated or degraded by.
 *
 * Falls back to relaying the daemon's raw body/status unmodified whenever the response isn't the
 * `{agents: [...]}` shape this handler expects (non-2xx, a parse failure, or simply no `agents`
 * key) — this handler must never turn a daemon-side error into a worse one by discarding it.
 */
async function respondWithEnrichedAgentList(req: Request, res: Response, routeDeps: RouteDeps): Promise<void> {
  const upstream = await forwardToAgentDaemon(req, res, req.method === "GET" || req.method === "HEAD" ? undefined : req.body);
  if (!upstream) return;

  const rawText = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);

  let payload: { agents?: unknown } | undefined;
  try {
    payload = rawText ? (JSON.parse(rawText) as { agents?: unknown }) : undefined;
  } catch {
    res.send(rawText);
    return;
  }
  if (!upstream.ok || !payload || !Array.isArray(payload.agents)) {
    res.send(rawText);
    return;
  }

  const agents = payload.agents as AgentSummary[];
  const principal = getAuthedPrincipal(res);
  const enriched = await Promise.all(
    agents.map(async (agent): Promise<AgentSummary> => {
      if (agent.id !== "claude") return agent;
      const live = await getLiveClaudeModels(
        { repo: routeDeps.adminExecutionCredentialRepo, sealer: routeDeps.siteAssistantSecretSealer },
        { workspaceId: routeDeps.workspaceId, principalId: principal.id }
      );
      if (!live || live.length === 0) return agent;
      return { ...agent, models: unionModels(agent.models ?? [], live), modelsSource: "live" };
    })
  );

  res.json({ ...payload, agents: enriched });
}

/**
 * `POST /api/admin/v1/mcp-ui/tool-calls` (ADR-053 Decision 3, extended for BYOK below) — the
 * redemption half of the MCP-UI confirmation pattern: a human clicked a rendered dialog
 * (`McpUiSurfaceCard` / `useMcpUiHost`), and `@jini-ai/chat`'s `createMcpUiToolCaller` posted
 * `{toolName, params}` here.
 *
 * Not `proxyPassthrough`: that client deliberately validates neither field (its own module doc says
 * so — a View's HTML is untrusted, so a client-side check would be a check the attacker writes both
 * sides of), which makes the allowlist check below load-bearing rather than decorative. Checked
 * again, authoritatively, by `mcp-ui-tool-calls-route.ts` on the daemon side and, for a locally-held
 * exchange, by `SurfaceExchangeStore.deliver`'s own binding check below — either way, THIS check
 * exists only to fail fast and keep an obviously-bad request off the wire at all; removing it would
 * not reopen a hole, but would turn a cheap 403 into wasted work.
 *
 * Two possible destinations now, tried in order:
 * 1. **Local delivery**, against `byokSurfaceExchanges` — reachable because this route and
 *    `modules/assistant-byok.ts`'s tool surface share ONE process and were handed the SAME store
 *    reference by `app.ts` at boot. Tried first because it costs one in-memory map lookup, vs. an
 *    HTTP round trip for the daemon fallback. A `binding-mismatch` is answered here, not forwarded —
 *    see this file's own header for why that reason specifically must not fall through.
 * 2. **Forward to the daemon** — the pre-existing behavior, unchanged, for anything the local store
 *    reports `unknown-or-closed` (including every request with no `exchangeId` at all, which never
 *    reaches the local branch below): `forwardToAgentDaemon` attaches the daemon bearer token and
 *    {@link RUN_PRINCIPAL_HEADER} exactly like every other route in this module, and the daemon-side
 *    route trusts both the same way `run-ownership.ts`'s routes do.
 */
async function proxyMcpUiToolCall(req: Request, res: Response, byokSurfaceExchanges: SurfaceExchangeStore): Promise<void> {
  const body = (req.body ?? {}) as { toolName?: unknown; params?: unknown; exchangeId?: unknown };
  const toolName = body.toolName;
  if (typeof toolName !== "string" || toolName.length === 0) {
    res.status(400).json({ error: "'toolName' must be a non-empty string", code: "VALIDATION_ERROR" });
    return;
  }
  if (!isMcpUiToolCallAllowed(toolName)) {
    res.status(403).json({ error: `'${toolName}' is not an MCP-UI-redeemable tool`, code: "TOOL_NOT_ALLOWLISTED" });
    return;
  }

  // Same extraction `mcp-ui-tool-calls-route.ts` uses on the daemon side: a top-level `exchangeId`
  // for a channel that can name one directly, falling back to the MCP-UI-specific callback param
  // (an mcp-ui surface can only answer by issuing a tool call, so its correlation has to ride inside
  // that call's own params — see `surface-exchanges.ts`'s doc on `SURFACE_EXCHANGE_ID_PARAM`).
  const params = isPlainObject(body.params) ? body.params : {};
  const exchangeId = typeof body.exchangeId === "string" ? body.exchangeId : params[SURFACE_EXCHANGE_ID_PARAM];
  if (typeof exchangeId === "string" && exchangeId.length > 0) {
    const principalId = getAuthedPrincipal(res).id;
    const delivered = byokSurfaceExchanges.deliver({ exchangeId, params, toolId: toolName, principalId });
    if (delivered.ok) {
      // Deliberately not the tool's result — same reasoning as the daemon-side route's identical
      // 202: the agent's own held-open call is what returns that, to the model, where it belongs.
      res.status(202).json({ delivered: true });
      return;
    }
    if (delivered.reason === "binding-mismatch") {
      // Found locally, just not for this caller/tool — a real rejection, not "try elsewhere". Same
      // 409 shape `mcp-ui-tool-calls-route.ts` uses for its own version of this same check.
      res.status(409).json({
        error: "that dialog is no longer waiting for an answer",
        code: "SURFACE_NOT_PENDING",
        reason: delivered.reason,
      });
      return;
    }
    // `delivered.reason === "unknown-or-closed"`: not necessarily wrong here — this exchange id may
    // belong to the DAEMON's own store (a Local CLI run), which this process cannot see. Fall
    // through and let the daemon answer authoritatively for its own exchanges.
  }

  await forwardToAgentDaemon(req, res, req.body);
}

/**
 * `POST /api/attachments`'s dedicated proxy — every other route in this module forwards through
 * `forwardToAgentDaemon`'s `JSON.stringify(req.body)` path, which is wrong here on purpose: the
 * real (and only) client, `@jini-ai/chat/react`'s `createDaemonAttachmentUploader`, always sends
 * `content-type: application/octet-stream` with the raw file bytes as the body — re-serializing
 * `req.body` as JSON would send `"{}"` (an empty object, `express.json()`'s default for a body it
 * did not parse) instead of the file.
 *
 * That `content-type` mismatch is exactly what keeps this safe to read directly: Tovu's app-wide
 * `app.use(express.json({limit:"15mb"}))` (`server/app.ts`) only consumes a request whose
 * `content-type` it recognizes as JSON — for anything else it calls `next()` without touching the
 * stream at all, so `req` (a `http.IncomingMessage`, itself an async-iterable readable stream)
 * reaches this handler completely intact regardless of where in the middleware stack this route
 * was registered relative to that parser. `@jini-ai/http-kit`'s `attachments.ts` module doc calls
 * out exactly this class of bug ("a dropped `.json` file... `express.json()` eats the body") for
 * the daemon's OWN mount of this route pack — the same reasoning applies one hop earlier, here.
 *
 * No `RUN_PRINCIPAL_HEADER` stamp: unlike every other forwarded route, an attachment upload has no
 * `runId` yet (a run doesn't exist until `POST /api/runs`, which happens after the composer has
 * already staged its uploads) — there is nothing for the daemon's per-run ownership check to
 * compare against, and the daemon-side attachment store does not read that header. Authentication
 * is still enforced twice: `requireAdminSession` below (browser session) and the bearer token this
 * function still attaches (proves the call came from Tovu's own proxy, not an arbitrary local
 * process) — see `daemon-auth.ts`.
 */
async function forwardAttachmentUpload(req: Request, res: Response): Promise<void> {
  if (respondIfDaemonKnownFailed(res)) return;
  const target = `${AGENT_DAEMON_URL}${req.originalUrl}`;
  const headers: Record<string, string> = {
    "content-type": req.get("content-type") ?? "application/octet-stream",
  };
  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (token) headers.Authorization = `Bearer ${token}`;

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers,
      // `req` is a Node `Readable` (an `IncomingMessage`), which Node's `fetch` accepts directly as
      // a streaming request body — `duplex: "half"` is what the Fetch spec requires to opt into
      // that; omitting it throws synchronously before any request is even sent.
      body: req as unknown as BodyInit,
      duplex: "half",
    } as RequestInit);
  } catch (error) {
    console.error(`[assistant] agent daemon unreachable at ${AGENT_DAEMON_URL}`, error);
    res.status(502).json({ error: "assistant is unavailable", code: "BAD_GATEWAY" });
    return;
  }
  await relayResponse(upstream, req, res);
}

/**
 * @param byokSurfaceExchanges - The SAME `SurfaceExchangeStore` `modules/assistant-byok.ts`'s tool
 * surface was composed with (`ByokToolSurface.surfaceExchanges`), built once by `app.ts` and passed
 * to both modules. Required, not defaulted: a locally-constructed fallback here would silently
 * diverge from the BYOK module's own store the first time someone forgot to thread it through, and
 * every confirmation would 404/409 against an exchange this store never opened.
 */
export function createAssistantModule(routeDeps: RouteDeps, byokSurfaceExchanges: SurfaceExchangeStore): ServerModuleHandle {
  return {
    name: "assistant",
    registerRoutes: (app: Express) => {
      app.use("/api/runs", requireAdminSession(routeDeps));
      app.post("/api/runs", (req: Request, res: Response, next: NextFunction) => {
        proxyRunStart(req, res).catch(next);
      });
      // `@jini-ai/http-kit`'s `registerRunRoutes` mounts `GET /api/runs` (list runs, optionally
      // filtered by `?contextRef=`) on the daemon alongside the `:runId` routes. It was missing
      // here, so the daemon's list endpoint was unreachable and 404'd at Tovu's own router.
      // Registered ahead of `GET /api/runs/:runId` to keep the exact-path match unambiguous.
      // The daemon answers it with the caller's own runs only — http-kit's version lists every
      // run on the box, which would hand one admin the ids of every other admin's runs.
      app.get("/api/runs", (req, res, next) => proxyPassthrough(req, res).catch(next));
      app.get("/api/runs/:runId", (req, res, next) => proxyPassthrough(req, res).catch(next));
      app.get("/api/runs/:runId/events", (req, res, next) => proxyPassthrough(req, res).catch(next));
      app.post("/api/runs/:runId/cancel", (req, res, next) => proxyPassthrough(req, res).catch(next));

      app.use("/api/agents", requireAdminSession(routeDeps));
      app.get("/api/agents", (req, res, next) => respondWithEnrichedAgentList(req, res, routeDeps).catch(next));
      app.post("/api/agents/rescan", (req, res, next) => respondWithEnrichedAgentList(req, res, routeDeps).catch(next));

      // Agent-driven control of the admin's own tab (`page.navigate`, `page.scroll_to`, …). The
      // stream carries invocations down to the browser and the response route carries answers
      // back; both are `@jini-ai/http-kit`'s, mounted on the daemon by `agent-daemon-server.ts`.
      //
      // Proxied rather than reached directly for the same reason every other route here is: the
      // daemon requires a bearer token the browser must never hold, and `requireAdminSession`
      // is what proves a caller is an admin at all. The stream in particular depends on
      // `relayResponse` above streaming rather than buffering — it is SSE, exactly like
      // `/api/runs/:runId/events`, and buffering it would mean the tab never receives an
      // invocation until the connection closed.
      app.use("/api/frontend-sessions", requireAdminSession(routeDeps));
      app.get("/api/frontend-sessions/stream", (req, res, next) => proxyPassthrough(req, res).catch(next));
      app.post("/api/frontend-sessions/:sessionId/responses", (req, res, next) =>
        proxyPassthrough(req, res).catch(next),
      );

      // Composer image/file uploads (`@jini-ai/chat/react`'s `uploadAttachments` prop,
      // `AssistantDock.tsx`). Same session-auth requirement as every other route in this module —
      // an unauthenticated upload endpoint is an arbitrary-file-write primitive reachable by
      // anyone who can reach this port, so this gate is not optional. `POST` needs the dedicated
      // raw-stream proxy above; `DELETE`'s body is real small JSON
      // (`{batchId, paths}` — `create-daemon-attachment-uploader.ts`'s `deletePartialUpload`), so
      // the ordinary `proxyPassthrough` JSON path is correct for it unchanged.
      app.use("/api/attachments", requireAdminSession(routeDeps));
      app.post("/api/attachments", (req: Request, res: Response, next: NextFunction) => {
        forwardAttachmentUpload(req, res).catch(next);
      });
      app.delete("/api/attachments", (req, res, next) => proxyPassthrough(req, res).catch(next));

      // The MCP-UI confirmation redemption endpoint (ADR-053 Decision 3) — see
      // `proxyMcpUiToolCall`'s own doc. Session-gated like every route above; distinct from
      // `/api/delegated-tool-calls`, which is intentionally NOT mounted in this module at all (see
      // this file's header) and whose trust boundary this endpoint does not reuse or widen.
      app.use(MCP_UI_TOOL_CALLS_PATH, requireAdminSession(routeDeps));
      app.post(MCP_UI_TOOL_CALLS_PATH, (req: Request, res: Response, next: NextFunction) => {
        proxyMcpUiToolCall(req, res, byokSurfaceExchanges).catch(next);
      });

      // A2UI's own inbound endpoint (`a2ui-actions-route.ts`) — an ordinary forward, not
      // `proxyMcpUiToolCall`'s dedicated function: there is no `toolName` on an A2UI action to
      // pre-check against an allowlist (the daemon-side route has none either — see that file's own
      // doc for why A2UI has no execution surface to allowlist in the first place), so
      // `proxyPassthrough` is the correct, unmodified forward, same as `/api/frontend-sessions/*`
      // just above.
      app.use(A2UI_ACTIONS_PATH, requireAdminSession(routeDeps));
      app.post(A2UI_ACTIONS_PATH, (req: Request, res: Response, next: NextFunction) => {
        proxyPassthrough(req, res).catch(next);
      });
    },
  };
}
