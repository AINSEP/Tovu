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
 *
 * The daemon-talking plumbing below (`AGENT_DAEMON_URL`, `outboundHeaders`, the retry/known-failed
 * `fetch` wrapper) moved to `assistant-daemon-client.ts` (2026-08-18, ADR-059) so
 * `assistant-ag-ui.ts` can reach the same daemon process without duplicating it. Pure extraction —
 * every function this file still calls has the exact body it had inline here before the split.
 */
import type { AgentSummary } from "@jini-ai/http-kit";
import type { Express, NextFunction, Request, Response } from "express";

import {
  A2UI_ACTIONS_PATH,
  AGENT_DAEMON_TOKEN_ENV_VAR,
  getLiveClaudeModels,
  unionModels,
  isMcpUiToolCallAllowed,
  MCP_UI_TOOL_CALLS_PATH,
  SURFACE_EXCHANGE_ID_PARAM,
  type SurfaceExchangeStore,
} from "../../assistant";
import { registerMcpUiSandboxProxyRoute } from "../../assistant/mcp-ui-sandbox-proxy-route";
import { getAuthedPrincipal, requireAdminSession } from "../middleware/dev-auth";
import type { RouteDeps } from "../routes/types";
import { AGENT_DAEMON_URL, forwardToAgentDaemon, respondIfDaemonKnownFailed } from "./assistant-daemon-client";
import type { ServerModuleHandle } from "./types";

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

/** True for a JSON object body, false for an array/null/primitive — same guard
 *  `mcp-ui-tool-calls-route.ts` uses for the identical `body.params` shape on the daemon side. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!upstream.ok || !payload) {
    // A non-2xx status or an empty body is an ordinary daemon-side error — the daemon itself is
    // the right place for that to be logged (or not), not this proxy hop.
    res.send(rawText);
    return;
  }
  if (!Array.isArray(payload.agents)) {
    // A 2xx response that isn't the `{agents: [...]}` shape this handler expects is NOT an
    // ordinary error — it means enrichment silently stops happening (indistinguishable from "the
    // admin has no API key" from the browser's side) with no other signal anywhere. Worth an
    // operator seeing; everything else in this function is deliberately quiet by design (see the
    // header on `getLiveClaudeModels` for the same reasoning applied to the credential branch).
    console.warn(
      `[assistant] ${req.method} ${req.originalUrl} — daemon responded 2xx without an 'agents' array; relaying unmodified, live model enrichment skipped for this response`,
    );
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

  // `forwardToAgentDaemon` deliberately does NOT relay (see its doc comment) — each caller relays
  // for itself. Without the two lines below this route fetches the daemon's answer and then never
  // writes to `res`, so the fall-through above hangs the browser until it times out and the MCP-UI
  // confirmation dialog never resolves.
  const upstream = await forwardToAgentDaemon(req, res, req.body);
  if (!upstream) return;
  await relayResponse(upstream, req, res);
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
      registerMcpUiSandboxProxyRoute(app);

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

      // Browser-reachable tool CATALOG enumeration — `search`/`describe` over the same 131-tool
      // registry `buildAssistantToolRegistrations` populates (`tool-catalog-query.ts`), proxied
      // from `@jini-ai/http-kit`'s `registerToolCatalogRoutes` (mounted daemon-side by
      // `agent-daemon-server.ts`). That daemon route is `requireSameOrigin`-gated and, before this,
      // reachable only by the spawned `jini-mcp` subprocess's own loopback `fetch` (no `Origin`
      // header, so it passes the daemon's same-origin check the way a browser's cross-origin
      // request never could) plus the daemon bearer token. `proxyPassthrough` satisfies both of
      // those the identical way that subprocess does: `forwardToAgentDaemon`'s outbound `fetch`
      // carries no `Origin` header either (Node's `fetch`, not a browser's) and attaches the same
      // bearer token every other route in this module does — so this proxy reaches the daemon route
      // exactly like its one existing legitimate caller, without loosening `requireSameOrigin`
      // itself by one bit. `requireAdminSession` below is the ONLY new gate a browser caller must
      // pass, replacing "must be that subprocess" with "must be a signed-in admin".
      //
      // BOUNDARY, stated plainly because the next reader will otherwise conflate it with item 1's
      // MCP-UI allowlist: this exposes tool **names and descriptions** to an authenticated admin
      // session, in the admin's own page. It is **read-only enumeration, never execution** — no
      // `toolName`/`params` body is accepted here, there is no POST/PUT/DELETE mounted on this
      // path, and nothing on this path can reach `ToolExecutor.execute`. A tool becomes callable
      // from the browser only through `MCP_UI_TOOL_CALLS_PATH`'s own allowlist
      // (`mcp-ui-tool-calls.ts`) — a completely separate trust decision this route does not make or
      // widen.
      //
      // Degrades the same way every other proxied route already does, with no extra code needed
      // here: `forwardToAgentDaemon` answers 503 immediately (known-failed boot, no daemon `fetch`
      // attempted) or 502 (genuinely unreachable) rather than hanging or throwing — a non-2xx JSON
      // error the browser-side `ComposerCapabilitySource` this backs
      // (`apps/admin/src/features/plugins/tool-catalog-composer-source.ts`) catches and treats as
      // "nothing to add", falling back to the bundled composer catalog rather than breaking it.
      app.use("/api/tools", requireAdminSession(routeDeps));
      app.get("/api/tools/search", (req, res, next) => proxyPassthrough(req, res).catch(next));
      app.get("/api/tools/:id", (req, res, next) => proxyPassthrough(req, res).catch(next));

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
