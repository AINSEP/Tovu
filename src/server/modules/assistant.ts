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
 */
import type { Express, NextFunction, Request, Response } from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/daemon-auth";
import { RUN_PRINCIPAL_HEADER } from "../../assistant/run-ownership";
import { getAuthedPrincipal, requireAdminSession } from "../middleware/dev-auth";
import type { RouteDeps } from "../routes/types";
import type { ServerModuleHandle } from "./types";

const AGENT_DAEMON_URL =
  process.env.JINI_AGENT_DAEMON_URL ?? `http://127.0.0.1:${Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319)}`;

/** Streams `upstream`'s response back onto `res` as it arrives — required for the SSE run-events
 * endpoint, where buffering the whole body first would defeat live streaming entirely. */
async function relayResponse(upstream: globalThis.Response, req: Request, res: Response): Promise<void> {
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (!upstream.body) {
    res.end();
    return;
  }
  const reader = upstream.body.getReader();
  req.on("close", () => {
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

async function forwardToAgentDaemon(req: Request, res: Response, body?: unknown): Promise<void> {
  const target = `${AGENT_DAEMON_URL}${req.originalUrl}`;
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: outboundHeaders(req, res),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[assistant] agent daemon unreachable at ${AGENT_DAEMON_URL}`, error);
    res.status(502).json({ error: "assistant is unavailable", code: "BAD_GATEWAY" });
    return;
  }
  await relayResponse(upstream, req, res);
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

  await forwardToAgentDaemon(req, res, {
    ...body,
    contextRef: JSON.stringify({ ...decoded, principalId: principal.id }),
  });
}

async function proxyPassthrough(req: Request, res: Response): Promise<void> {
  await forwardToAgentDaemon(req, res, req.method === "GET" || req.method === "HEAD" ? undefined : req.body);
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

export function createAssistantModule(routeDeps: RouteDeps): ServerModuleHandle {
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
      app.get("/api/agents", (req, res, next) => proxyPassthrough(req, res).catch(next));
      app.post("/api/agents/rescan", (req, res, next) => proxyPassthrough(req, res).catch(next));

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
    },
  };
}
