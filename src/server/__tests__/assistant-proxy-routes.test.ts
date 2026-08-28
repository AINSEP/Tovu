import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR, MCP_UI_TOOL_CALLS_PATH, RUN_PRINCIPAL_HEADER } from "../../assistant/index.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../runtime/lifecycle/readiness-state.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server.js";

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
 * 5. the degraded-boot defect fix: once `readiness-state.ts`'s `recordAssistantDaemonFailure` has
 *    latched (which `index.ts`'s `spawnAgentDaemon()` does when its own child crashes), every
 *    proxied route must short-circuit to an immediate 503 WITHOUT ever calling `fetch` — proven by
 *    asserting the stand-in daemon recorded zero requests, not merely by the response code, because
 *    a wrong-but-plausible fix could still 503 while leaking the request to the (stand-in, healthy)
 *    daemon first.
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

      // A distinct run id, checked BEFORE the generic `/events` branch below (whose URL it would
      // also match): two SSE chunks written with a real delay between them, for the "is this
      // actually streamed, not buffered" test — see that test's own doc for why the generic
      // `/events` stand-in above can't answer this question (it flushes its whole body in one
      // `res.end()` call, so it can't distinguish incremental relay from full buffering).
      if ((req.url ?? "").includes("/runs/run-stream/events")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`id: chunk-1\ndata: {"kind":"first"}\n\n`);
        setTimeout(() => {
          res.write(`id: chunk-2\ndata: {"kind":"second"}\n\n`);
          res.end();
        }, 200);
        return;
      }
      if ((req.url ?? "").includes("/events")) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(`id: cursor-7\ndata: {"kind":"end"}\n\n`);
        return;
      }
      // Stand-in for `@jini-ai/http-kit`'s real tool-catalog routes (`registerToolCatalogRoutes`,
      // mounted daemon-side by `agent-daemon-server.ts`) — answers the same two shapes the real
      // route does, so the proxy tests below assert against realistic response bodies rather than
      // the generic `{runs: [...]}` fallback every other route in this stand-in happens to share.
      if ((req.url ?? "").startsWith("/api/tools/search")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            hits: [{ id: "content_post_search", description: "Finds posts and pages by relevance.", source: "content", score: 4.2 }],
          }),
        );
        return;
      }
      if ((req.url ?? "").startsWith("/api/tools/")) {
        const id = decodeURIComponent((req.url ?? "").slice("/api/tools/".length));
        if (id === "content_post_search") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              id: "content_post_search",
              description: "Finds posts and pages by relevance.",
              source: "content",
              inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
            }),
          );
        } else {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: `unknown tool id '${id}'` } }));
        }
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

    const { createRouteDeps } = await import("../runtime/composition/app.js");
    const { createAssistantModule } = await import("../runtime/composition/modules/assistant.js");
    const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
    const { createSurfaceExchangeStore } = await import("../../contracts/core/tool-surface-exchanges.js");

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

/**
 * `forwardToAgentDaemon` was refactored to return the upstream `Response` instead of relaying it
 * internally — `proxyPassthrough` now calls `relayResponse` itself. That refactor is shared by
 * EVERY proxied route, including this one, which carries live chat over SSE — a regression here
 * would freeze or drop a user's chat mid-stream, not just show a stale model list. None of the
 * assertions above actually distinguish "streamed incrementally" from "buffered whole, then
 * flushed" — the stand-in daemon's normal `/events` branch answers its entire body in one
 * `res.end()` call, so every existing assertion (status, headers, final body content) would pass
 * identically either way. This test is the one that would fail if the refactor had accidentally
 * introduced buffering: the stand-in daemon writes two SSE chunks 200ms apart, and a genuinely
 * relayed response must deliver data to the client with a real gap in between, not all at once
 * when the connection finally closes.
 */
test("a streamed multi-chunk SSE response is relayed incrementally as it arrives, not buffered until the connection closes", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/runs/run-stream/events`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.ok(res.body, "expected a readable stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const start = Date.now();
  let combined = "";
  let firstChunkAt: number | null = null;
  let lastChunkAt = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const elapsed = Date.now() - start;
    if (firstChunkAt === null) firstChunkAt = elapsed;
    lastChunkAt = elapsed;
    combined += decoder.decode(value, { stream: true });
  }

  assert.match(combined, /chunk-1/);
  assert.match(combined, /chunk-2/);
  assert.ok(combined.indexOf("chunk-1") < combined.indexOf("chunk-2"), "chunk-1 must arrive before chunk-2 in the combined body");
  assert.ok(
    firstChunkAt !== null && firstChunkAt < 100,
    `expected the first chunk to reach the client quickly, not held back until the daemon closed the connection; got ${firstChunkAt}ms`,
  );
  assert.ok(
    lastChunkAt - (firstChunkAt ?? 0) >= 150,
    `expected a real gap between the first and last chunk arriving — a buffer-then-flush-once relay would deliver both together; got ${lastChunkAt - (firstChunkAt ?? 0)}ms`,
  );
});

/**
 * Regression test for `proxyMcpUiToolCall`'s fall-through branch (`server/modules/assistant.ts`,
 * the route ending around line 403-409). `forwardToAgentDaemon` was refactored to return
 * `Response | null` instead of relaying internally, and this one call site was not migrated: it
 * fetched the daemon's answer and never wrote to `res`, hanging the browser until timeout so the
 * MCP-UI confirmation dialog never resolved. Fixed in `7b5ae83`. The bug shipped past a green
 * 33/33 suite because nothing drove this path — found by a manual call-site audit, not a test.
 *
 * The path: an `exchangeId` NOT present in `byokSurfaceExchanges` (this harness's store is always
 * fresh and empty — see {@link harness}), so local `deliver()` returns `unknown-or-closed` and
 * control falls through to the daemon. That is a legitimate case, not an error one: the exchange
 * may belong to a Local CLI run's daemon-side store, which this process cannot see (see
 * `assistant.ts:398-400`'s own comment). The daemon must still get to answer, and that answer must
 * still reach the client.
 *
 * The pre-fix failure mode is a HANG, not a mismatched assertion — an unbounded `fetch` here would
 * make a broken re-test of this file hang forever instead of failing. `AbortSignal.timeout` bounds
 * the client-side wait so a regression fails loudly instead of freezing the run.
 */
test("an MCP-UI tool call for an exchangeId the daemon owns falls through, and the daemon's answer reaches the client", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      toolName: "content_post_delete",
      exchangeId: "exchange-owned-by-a-local-cli-daemon-run",
      params: {},
    }),
    signal: AbortSignal.timeout(2000),
  });

  assert.equal(res.status, 200, "the daemon's status must reach the client, not hang until the browser times out");
  assert.deepEqual(
    await res.json(),
    { runs: [{ id: "run-1" }] },
    "the daemon's body must be relayed verbatim, not silently dropped"
  );
  assert.equal(
    recorded.length,
    1,
    "the local store found nothing for this exchangeId, so exactly one request should have fallen through to the stand-in daemon"
  );
  assert.equal(recorded[0].method, "POST");
  assert.equal(recorded[0].url, MCP_UI_TOOL_CALLS_PATH);
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

test("a known-failed daemon short-circuits every proxied route to an immediate 503, never reaching the daemon's port", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  // Simulates what `index.ts`'s `spawnAgentDaemon()` does on a real EADDRINUSE crash. The stand-in
  // daemon in this harness is fully healthy and listening — that is the point: today's code (before
  // this fix) would happily reach it and get a 200, exactly like the ordinary passing tests above.
  // A leaked port in production is squatted by a DIFFERENT (orphaned) process, not by nothing, so
  // "the daemon answered" must stop being trusted once we know OUR OWN spawn is dead.
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());

  const res = await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "the agent daemon is currently unavailable",
    code: "AGENT_DAEMON_KNOWN_FAILED",
    reasonCode: "agent daemon could not bind 127.0.0.1:4319 — address already in use",
  });
  assert.equal(
    recorded.length,
    0,
    "the stand-in daemon is healthy and would have answered 200 — reaching it at all means the short-circuit didn't fire before the fetch"
  );
});

test("a known-failed daemon triggers ensureAssistantDaemonStarted() as a self-healing side effect, on every short-circuited request", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());

  // This test process never calls `daemon-supervisor.ts`'s `startAssistantDaemon()` (that spawns a
  // real OS process, which no other test in this file does either), so `ensureAssistantDaemonStarted()`
  // deterministically answers `{ok: false, reason: "the assistant daemon was never started this
  // process boot"}` — see that function's own contract. `respondIfDaemonKnownFailed` logs exactly one
  // line whenever the recovery attempt reports `ok: false`, which is the only externally-observable
  // signal that the call happened at all (the function itself has no other side effect in this state).
  // Capturing that line is what proves the wiring, not just the 503 status code every other
  // known-failed test in this file already asserts.
  const errorLines: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    errorLines.push(args.map(String).join(" "));
  });

  const res = await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });

  assert.equal(res.status, 503, "the short-circuit must still answer 503 immediately — recovery never blocks THIS request");
  assert.ok(
    errorLines.some(
      (line) => line.includes("on-demand daemon recovery") && line.includes("never started this process boot")
    ),
    `expected a recovery-attempt log line proving ensureAssistantDaemonStarted() was called; got: ${JSON.stringify(errorLines)}`
  );
});

test("a known-failed daemon also short-circuits the SSE run-events route", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());

  const res = await fetch(`${baseUrl}/api/runs/run-1/events`, { headers: { cookie } });

  assert.equal(res.status, 503);
  assert.equal(recorded.length, 0);
});

test("a known-failed daemon short-circuits the dedicated attachment-upload proxy too, which has its own fetch path", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());

  const res = await fetch(`${baseUrl}/api/attachments`, {
    method: "POST",
    headers: { cookie, "content-type": "application/octet-stream" },
    body: Buffer.from("file bytes"),
  });

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "the agent daemon is currently unavailable",
    code: "AGENT_DAEMON_KNOWN_FAILED",
    reasonCode: "agent daemon could not bind 127.0.0.1:4319 — address already in use",
  });
  assert.equal(recorded.length, 0);
});

test("clearing the failure (the future-retry hook) restores normal proxying", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");

  const failed = await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });
  assert.equal(failed.status, 503);

  clearAssistantDaemonFailure();
  const recovered = await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });

  assert.equal(recovered.status, 200, "clearing the latch must let the very next request reach the daemon again");
  assert.equal(recorded.length, 1);
});

/**
 * ---- Tool catalog enumeration (`GET /api/tools/search`, `GET /api/tools/:id`) ----
 *
 * The browser-reachable proxy in front of the daemon's `requireSameOrigin`-gated
 * `registerToolCatalogRoutes` (see `modules/assistant.ts`'s own doc at the mount site for the full
 * same-origin trace). Written and first run against the pre-change router — where both routes
 * 404 at Tovu's own Express app before ever reaching the stand-in daemon — as this dispatch's
 * required RED evidence; see the Programmer handoff for the verbatim red output.
 */

test("GET /api/tools/search is proxied to the daemon and its real response shape is relayed verbatim", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/tools/search?q=search+posts&limit=5`, { headers: { cookie } });

  assert.equal(res.status, 200, "the tool-catalog search route must reach the daemon, not 404 at Tovu's own router");
  assert.deepEqual(await res.json(), {
    hits: [{ id: "content_post_search", description: "Finds posts and pages by relevance.", source: "content", score: 4.2 }],
  });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].method, "GET");
  assert.equal(recorded[0].url, "/api/tools/search?q=search+posts&limit=5", "the query string must reach the daemon unmodified");
});

test("GET /api/tools/:id is proxied to the daemon, including its 404 for an unknown id", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const found = await fetch(`${baseUrl}/api/tools/content_post_search`, { headers: { cookie } });
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), {
    id: "content_post_search",
    description: "Finds posts and pages by relevance.",
    source: "content",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  });

  const missing = await fetch(`${baseUrl}/api/tools/no_such_tool`, { headers: { cookie } });
  assert.equal(missing.status, 404, "the daemon's own not-found response must be relayed, not swallowed into a 200");

  assert.equal(recorded.length, 2);
});

test("the tool catalog routes are session-gated like every other route in this module — no cookie, no daemon call", async (t) => {
  const { baseUrl } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/tools/search?q=search`);

  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { code: string }).code, "UNAUTHENTICATED");
  assert.equal(recorded.length, 0, "an unauthenticated caller must never reach the daemon's tool catalog either");
});

test("the tool catalog proxy carries the daemon bearer token, same as every other proxied route", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  await fetch(`${baseUrl}/api/tools/search?q=search`, { headers: { cookie } });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].headers.authorization, `Bearer ${TOKEN}`);
});

test("a known-failed daemon also short-circuits the tool catalog routes to 503, never reaching the daemon's port", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());

  const res = await fetch(`${baseUrl}/api/tools/search?q=search`, { headers: { cookie } });

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "the agent daemon is currently unavailable",
    code: "AGENT_DAEMON_KNOWN_FAILED",
    reasonCode: "agent daemon could not bind 127.0.0.1:4319 — address already in use",
  });
  assert.equal(recorded.length, 0, "the stand-in daemon is healthy and would have answered — reaching it means the short-circuit didn't fire");
});

test("READ-ONLY BOUNDARY: no write verb is mounted on the tool catalog path — this proxy can enumerate, never execute", async (t) => {
  const { baseUrl, cookie } = await bootProxy(t);

  const post = await fetch(`${baseUrl}/api/tools/search`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  const put = await fetch(`${baseUrl}/api/tools/content_post_search`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  const del = await fetch(`${baseUrl}/api/tools/content_post_search`, { method: "DELETE", headers: { cookie } });

  // Express answers a path with no matching verb 404 (no route) rather than proxying it anywhere —
  // the load-bearing fact here is that NONE of these reached the stand-in daemon.
  assert.notEqual(post.status, 200);
  assert.notEqual(put.status, 200);
  assert.notEqual(del.status, 200);
  assert.equal(recorded.length, 0, "a write verb against the tool-catalog path must never reach the daemon — enumeration only, per this route's own boundary");
});
