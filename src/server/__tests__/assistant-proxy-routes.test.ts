import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/daemon-auth";
import { RUN_PRINCIPAL_HEADER } from "../../assistant/run-ownership";
import type { RouteDeps } from "../routes/types";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server";

/**
 * @file Route-level tests for `server/modules/assistant.ts`, the session-gated reverse proxy in
 * front of the standalone agent daemon. A stand-in daemon records exactly what arrives on the
 * wire, so these are end-to-end assertions about the proxy hop, not assertions about its internals.
 *
 * Covers three fixes:
 * 1. every forwarded request carries `Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN>` — the
 *    credential the real daemon's `requireAgentDaemonToken` gate demands. The token is read per
 *    request, never at module scope, because module evaluation happens before `src/index.ts`'s
 *    `main()` mints it.
 * 2. `Last-Event-ID` is forwarded. The daemon's SSE route (`@jini-ai/http-kit`'s
 *    `requestedAfterCursor`) resumes from that header; dropping it made a browser tab's automatic
 *    `EventSource` reconnect replay the whole run and duplicate every chat message.
 * 3. `GET /api/runs` (list runs) is proxied at all — `registerRunRoutes` mounts it on the daemon,
 *    but Tovu's proxy never forwarded it, so it 404'd at Tovu's own router.
 * 4. every forwarded request names the session-verified principal in `RUN_PRINCIPAL_HEADER`, and
 *    names it from `res.locals` rather than from anything inbound. That header is the only thing
 *    telling the daemon which admin a request speaks for; the daemon's own ownership enforcement
 *    (`assistant/run-ownership.ts`) is worth nothing if the proxy forgets it or forwards a
 *    browser-supplied one.
 *
 * `assistant.ts` resolves the daemon origin ONCE at module scope (`AGENT_DAEMON_URL`), so the
 * stand-in daemon is started and the module imported exactly once per test process — see
 * {@link harness}.
 */

const TOKEN = "f".repeat(64);

interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

let recorded: RecordedRequest[] = [];

/** The stand-in agent daemon: records every inbound request, then answers in the shape the real route would. */
async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      recorded.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });

      if ((req.url ?? "").includes("/events")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(`id: cursor-7\ndata: {"kind":"end"}\n\n`);
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ runs: [{ id: "run-1" }] }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}

/**
 * One-time process-wide setup: the stand-in daemon must be listening and `JINI_AGENT_DAEMON_URL`
 * must be set BEFORE `server/modules/assistant.ts` is first evaluated, hence the dynamic imports
 * (`server/app.ts` imports the assistant module statically, so it has to be deferred too).
 */
let harnessPromise: Promise<{ buildApp: () => express.Express; daemon: Server }> | null = null;
function harness() {
  harnessPromise ??= (async () => {
    const { origin, server } = await startStandInDaemon();
    process.env.JINI_AGENT_DAEMON_URL = origin;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;

    const { createRouteDeps } = await import("../app");
    const { createAssistantModule } = await import("../modules/assistant");
    const { registerAuthRoutes } = await import("../middleware/dev-auth");
    const { createSurfaceExchangeStore } = await import("../../assistant/surface-exchanges");

    return {
      daemon: server,
      buildApp: () => {
        const deps: RouteDeps = createRouteDeps();
        const app = express();
        app.use(express.json());
        registerAuthRoutes(app, deps);
        // A fresh, empty store: none of this file's requests carry an exchangeId, so the local-first
        // delivery branch never triggers and every request still reaches the stand-in daemon exactly
        // as before — see `modules/assistant.ts`'s own doc for why the real store must be shared with
        // `assistant-byok.ts` in production, which this proxy-only harness has no need to compose.
        createAssistantModule(deps, createSurfaceExchangeStore()).registerRoutes(app);
        return app;
      },
    };
  })();
  return harnessPromise;
}

async function bootProxy(t: import("node:test").TestContext) {
  const { buildApp } = await harness();
  recorded = [];
  const baseUrl = await startTestServer(buildApp(), t);
  const cookie = await loginAsOwner(baseUrl);
  return { baseUrl, cookie };
}

test.after(async () => {
  const built = await harnessPromise;
  if (built) await new Promise<void>((resolve) => built.daemon.close(() => resolve()));
});

test("GET /api/runs is proxied to the daemon instead of 404ing at Tovu's own router", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });

  assert.equal(res.status, 200, "the run-list route must reach the daemon, not fall through to a 404");
  assert.deepEqual(await res.json(), { runs: [{ id: "run-1" }] }, "the daemon's body must be relayed verbatim");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].method, "GET");
  assert.equal(recorded[0].url, "/api/runs");
});

test("GET /api/runs preserves the ?contextRef= query the daemon's list route filters on", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/runs?contextRef=chat-42`, { headers: { cookie } });

  assert.equal(res.status, 200);
  assert.equal(recorded[0].url, "/api/runs?contextRef=chat-42");
});

test("GET /api/runs is still session-gated — no cookie means 401 and the daemon is never called", async (t) => {
  const { baseUrl } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/runs`);

  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { code: string }).code, "UNAUTHENTICATED");
  assert.equal(recorded.length, 0, "an unauthenticated caller must never reach the daemon");
});

test("Last-Event-ID is forwarded on the SSE run-events route, so a reconnect resumes instead of replaying", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/runs/run-1/events`, {
    headers: { cookie, "last-event-id": "cursor-7" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(recorded[0].headers["last-event-id"], "cursor-7", "the daemon reads exactly this header to resume a stream");
  assert.match(await res.text(), /cursor-7/, "the daemon's stream body must be relayed back to the browser");
});

test("Last-Event-ID is omitted (not sent empty) when the browser did not supply one — a first connect must not look like a resume", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  await fetch(`${baseUrl}/api/runs/run-1/events`, { headers: { cookie } });

  assert.equal(recorded[0].headers["last-event-id"], undefined);
});

test("every proxied request carries the daemon bearer token", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/runs/run-1`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/runs/run-1/events`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/runs/run-1/cancel`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  await fetch(`${baseUrl}/api/agents`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/agents/rescan`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contextRef: JSON.stringify({ prompt: "hello" }) }),
  });

  assert.equal(recorded.length, 7);
  for (const request of recorded) {
    assert.equal(
      request.headers.authorization,
      `Bearer ${TOKEN}`,
      `${request.method} ${request.url} must present the daemon token`
    );
  }
});

test("every proxied request asserts the session-verified principal the daemon authorizes against", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as {
    user: { id: string };
  };

  await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/runs/run-1`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/runs/run-1/events`, { headers: { cookie } });
  await fetch(`${baseUrl}/api/runs/run-1/cancel`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });

  assert.equal(recorded.length, 4);
  for (const request of recorded) {
    assert.equal(
      request.headers[RUN_PRINCIPAL_HEADER],
      me.user.id,
      `${request.method} ${request.url} must name the caller, or the daemon cannot tell one admin's run from another's`
    );
  }
});

test("a browser-supplied principal header is overwritten, never trusted", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as {
    user: { id: string };
  };

  await fetch(`${baseUrl}/api/runs/run-1`, { headers: { cookie, [RUN_PRINCIPAL_HEADER]: "principal-someone-else" } });

  assert.equal(
    recorded[0].headers[RUN_PRINCIPAL_HEADER],
    me.user.id,
    "the header is built from res.locals, so an inbound value can never survive the hop"
  );
});

test("the run-start body rewrite still stamps the session principal into contextRef alongside the new headers", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  await fetch(`${baseUrl}/api/runs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "last-event-id": "cursor-3" },
    body: JSON.stringify({ contextRef: JSON.stringify({ prompt: "make me a content type" }), agentId: "claude" }),
  });

  const forwarded = JSON.parse(recorded[0].body) as { contextRef: string; agentId: string };
  const contextRef = JSON.parse(forwarded.contextRef) as { prompt: string; principalId: string };

  assert.equal(forwarded.agentId, "claude");
  assert.equal(contextRef.prompt, "make me a content type");
  assert.ok(contextRef.principalId.length > 0, "the daemon has no cookie of its own — the proxy must stamp the principal");
  assert.equal(recorded[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(recorded[0].headers["last-event-id"], "cursor-3", "header forwarding applies to every route, not just the SSE one");
});
