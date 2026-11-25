import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { jsonResponse, readJsonBody, type ServerRoute } from "@jini-ai/core/contracts/server";
import { allowAllOrigins } from "@jini-ai/core/contracts/server/testing";
import { JINI_REQUEST_FACTS } from "@jini-ai/core/contracts/site/request-facts";
import { captureRequestFacts } from "#src/platform/express/request-facts";
import { createRecordingObservability, createRecordingReporter } from "@jini-ai/core/errors/testing";
import { agentRoutes } from "@jini-ai/daemon/http";
import { daemonRouteHost, expressSendResponse, mountJiniRouteInPlace, mountJiniRoutes, NO_OPERATION_TRACKING } from "../jini-routes.js";

/** @file `mountJiniRoutes` on a real Express app and socket, and the host object the daemon scope hands Jini's route groups. */

async function listen(t: TestContext, app: express.Express): Promise<string> {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
const says = (word: string): ServerRoute["handler"] => () => jsonResponse({ status: 200, body: { from: word } });
const from = async (response: Response): Promise<unknown> => (await response.json() as { from: unknown }).from;

test("a list is mounted at the line of the call: a gate above it runs first, a route above it wins, and it wins over a route below", async t => {
  const app = express();
  let reached = 0;
  app.use((req, res, next) => { if (req.headers.authorization === "Bearer yes") next(); else res.status(401).json({ from: "gate" }); });
  app.get("/shared-above", (_req, res) => { res.json({ from: "express-above" }); });
  mountJiniRoutes({ app, routes: [
    { method: "GET", path: "/shared-above", handler: says("list") },
    { method: "GET", path: "/shared-below", handler: () => { reached += 1; return jsonResponse({ status: 200, body: { from: "list" } }); } },
  ] });
  app.get("/shared-below", (_req, res) => { res.json({ from: "express-below" }); });
  const origin = await listen(t, app);
  const headers = { authorization: "Bearer yes" };
  assert.equal((await fetch(`${origin}/shared-below`)).status, 401);
  assert.equal(reached, 0);
  assert.equal(await from(await fetch(`${origin}/shared-above`, { headers })), "express-above");
  assert.equal(await from(await fetch(`${origin}/shared-below`, { headers })), "list");
});

test("a mounted list answers the spellings Express answered: another case, a trailing slash, OPTIONS, and 400 for a bad escape in an id", async t => {
  const app = express();
  mountJiniRoutes({ app, routes: [
    { method: "GET", path: "/api/things", handler: says("list") },
    { method: "GET", path: "/api/things/:id", handler: ({ params }) => jsonResponse({ status: 200, body: { from: params.id } }) },
  ] });
  const origin = await listen(t, app);
  assert.equal(await from(await fetch(`${origin}/API/Things/`)), "list");
  assert.equal(await from(await fetch(`${origin}/api/things/Ab/`)), "Ab");
  const options = await fetch(`${origin}/api/things`, { method: "OPTIONS" });
  assert.deepEqual([options.status, options.headers.get("allow"), await options.text()], [200, "GET,HEAD", "GET,HEAD"]);
  const bad = await fetch(`${origin}/api/things/%E0%A4%A`);
  assert.deepEqual([bad.status, bad.headers.get("content-type")], [400, "text/html; charset=utf-8"]);
});

test("a path the list does not own and a method it does not have fall through to the routes below", async t => {
  const app = express();
  mountJiniRoutes({ app, routes: [{ method: "GET", path: "/api/runs", handler: says("list") }] });
  app.post("/api/runs", (_req, res) => { res.json({ from: "express-post" }); });
  app.get("/api/other", (_req, res) => { res.json({ from: "express-other" }); });
  const origin = await listen(t, app);
  assert.equal(await from(await fetch(`${origin}/api/runs`)), "list");
  assert.equal(await from(await fetch(`${origin}/api/runs`, { method: "POST" })), "express-post");
  assert.equal(await from(await fetch(`${origin}/api/other`)), "express-other");
  assert.equal((await fetch(`${origin}/api/nowhere`)).status, 404);
});

test("a route reads the body the parser above already parsed, and sees what a gate above put on res.locals, plus the request facts", async t => {
  const app = express();
  app.use(express.json({ limit: "6mb" }));
  app.use((_req, res, next) => { res.locals.principalId = "alice"; next(); });
  mountJiniRoutes({ app, routes: [{ method: "POST", path: "/echo", handler: async ({ request, locals }) => {
    const body = await readJsonBody({ request }, { maxBytes: 1024 });
    return jsonResponse({ status: 200, body: { from: body.ok ? body.value : "unreadable", locals: locals ?? null } });
  } }] });
  const response = await fetch(`${await listen(t, app)}/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: '{ "n": 1, "s": "é" }' });
  assert.deepEqual(await response.json(), { from: { n: 1, s: "é" }, locals: { principalId: "alice", [JINI_REQUEST_FACTS]: { clientAddress: "127.0.0.1", servingProtocol: "http", secure: false, query: {} } } });
});

const bodyKind: ServerRoute = { method: "POST", path: "/upload", handler: async ({ request }) => {
  if (request.body === null) return jsonResponse({ status: 200, body: { from: "no-body" } });
  return jsonResponse({ status: 200, body: { from: [...new Uint8Array(await request.arrayBuffer())] } });
} };

test("a raw-body list gets the untouched bytes, or no body when the parser above consumed them", async t => {
  const app = express();
  app.use(express.json({ limit: "6mb" }));
  mountJiniRoutes({ app, routes: [bodyKind] }, { rawBody: true });
  const origin = await listen(t, app);
  const bytes = await fetch(`${origin}/upload`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: Uint8Array.from([0, 127, 128, 255]) });
  assert.deepEqual(await from(bytes), [0, 127, 128, 255]);
  const consumed = await fetch(`${origin}/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: '{ "spaced" : 1 }' });
  assert.equal(await from(consumed), "no-body");
});

test("without rawBody the consumed upload would arrive as re-serialized JSON, which is why an upload list must say rawBody", async t => {
  const app = express();
  app.use(express.json({ limit: "6mb" }));
  mountJiniRoutes({ app, routes: [bodyKind] });
  const response = await fetch(`${await listen(t, app)}/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: '{ "spaced" : 1 }' });
  assert.equal(Buffer.from(await from(response) as number[]).toString("utf8"), '{"spaced":1}');
});

test("the daemon route host: the scope's context as given, a body limit no parser-accepted body can exceed, a real constant-time compare, real unref'd timers, and request IDs", async () => {
  const context = { originPolicy: allowAllOrigins };
  const host = daemonRouteHost({ context, parserLimitBytes: 6 * 1024 * 1024 });
  assert.equal(host.context, context);
  assert.equal(host.jsonBodyMaxBytes, 33_030_144);
  assert.equal(daemonRouteHost({ context, parserLimitBytes: 102_400 }).jsonBodyMaxBytes, 537_600);

  const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
  assert.equal(host.timingSafeEqual({ left: bytes("secret-a"), right: bytes("secret-a") }), true);
  assert.equal(host.timingSafeEqual({ left: bytes("secret-a"), right: bytes("secret-b") }), false);
  // Node's own compare refuses unequal lengths; callers go through the matcher that checks length first.
  assert.throws(() => host.timingSafeEqual({ left: bytes("short"), right: bytes("longer") }), RangeError);

  let ticks = 0;
  const handle = host.scheduler.every({ callback: () => { ticks += 1; }, intervalMs: 5 });
  assert.equal((handle as NodeJS.Timeout).hasRef(), false);
  await new Promise((resolve) => setTimeout(resolve, 40));
  host.scheduler.cancel({ handle });
  const seen = ticks;
  assert.ok(seen >= 2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(ticks, seen);

  const reported: unknown[] = [];
  const failure = new Error("boom");
  const answer = host.reportInternalError({ report: { error: failure }, logSource: "jini-routes-test", message: "It failed." }, { onInternalError: (report) => { reported.push(report); } });
  assert.equal(answer.code, "INTERNAL_ERROR");
  assert.equal(answer.message, "It failed.");
  assert.match(String(answer.requestId), /^[0-9a-f-]{36}$/);
  assert.equal(reported.length, 1);
  assert.equal((reported[0] as { error: unknown; correlationId: string }).error, failure);
  assert.equal((reported[0] as { correlationId: string }).correlationId, answer.requestId);
});

// Pin A9: every route a list mounts through `mountJiniRoutes` is given this request's facts, and nothing set earlier can stand in for them.
test("mountJiniRoutes gives a route the request facts in locals, overwriting any facts set earlier in res.locals", async t => {
  const app = express();
  app.set("trust proxy", 1);
  let expected: unknown;
  app.use((req, res, next) => { expected = captureRequestFacts({ req }); res.locals[JINI_REQUEST_FACTS] = { clientAddress: "forged" }; res.locals.other = "kept"; next(); });
  mountJiniRoutes({ app, routes: [{ method: "GET", path: "/probe", handler: ({ locals }) => jsonResponse({ status: 200, body: { facts: locals?.[JINI_REQUEST_FACTS], other: locals?.other } }) }] });
  const base = await listen(t, app);
  const answer = await (await fetch(`${base}/probe?tabId=a`, { headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "https" } })).json() as { facts: unknown; other: unknown };
  assert.deepEqual(answer.facts, expected);
  assert.equal((answer.facts as { clientAddress: string }).clientAddress, "203.0.113.5");
  assert.equal(answer.other, "kept");
});

/** A finished HTML answer with two cookies, as a callback page route builds one. */
const page: ServerRoute = { method: "GET", path: "/page", handler: () => {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "text/html; charset=utf-8" });
  headers.append("set-cookie", "a=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  headers.append("set-cookie", "b=; Max-Age=0");
  return new Response("<p>done</p>", { status: 201, headers });
} };

test("an in-place route written with expressSendResponse answers as res.send did: status, its own headers, each cookie on its own line, length and a weak ETag; HEAD has no body", async t => {
  const app = express();
  mountJiniRouteInPlace({ app, route: page }, { writeResponse: expressSendResponse });
  const origin = await listen(t, app);
  const response = await fetch(`${origin}/page`);
  assert.deepEqual(
    [response.status, response.headers.get("cache-control"), response.headers.get("content-type"), response.headers.get("content-length"), response.headers.getSetCookie(), await response.text()],
    [201, "no-store", "text/html; charset=utf-8", "11", ["a=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT", "b=; Max-Age=0"], "<p>done</p>"],
  );
  assert.match(response.headers.get("etag") ?? "", /^W\/"b-/);
  const head = await fetch(`${origin}/page`, { method: "HEAD" });
  assert.deepEqual([head.status, head.headers.get("etag"), await head.text()], [201, response.headers.get("etag"), ""]);
});

test("an in-place route keeps the bridge's writer unless told otherwise: the answer as built, no ETag added", async t => {
  const app = express();
  mountJiniRouteInPlace({ app, route: page });
  const response = await fetch(`${await listen(t, app)}/page`);
  assert.deepEqual([response.status, response.headers.get("etag"), response.headers.getSetCookie().length, await response.text()], [201, null, 2, "<p>done</p>"]);
});

// P4-T2 host edge: a route host built with its site's `errors` and a mount given the same reporter put the
// site's Jini routes in reporter mode — one ERR- id, shared by the reply and the site's one record.
const ISO = "2026-01-01T00:00:00.000Z";
const failingAgents = { listAgents: () => { throw new Error("inventory exploded"); } };
const errorIdOf = async (response: Response): Promise<string> => {
  const text = await response.text();
  const id = /ERR-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(text)?.[0];
  assert.ok(id, `no ERR- id in ${text}`);
  return id;
};
const recordedIds = (entries: readonly { level: string; meta?: Record<string, unknown> }[]): unknown[] =>
  entries.filter((entry) => entry.level === "error").map((entry) => entry.meta?.errorId);

test("a Jini route mounted through daemonRouteHost answers with the reporter's ERR id", async t => {
  const { reporter, entries, reports } = createRecordingReporter({ ids: ["ERR-0000-0000-0000-0001", "ERR-0000-0000-0000-0002"], iso: ISO });
  const host = daemonRouteHost({ context: { originPolicy: allowAllOrigins }, parserLimitBytes: 102_400, errors: { reporter, observability: NO_OPERATION_TRACKING } });
  const app = express();
  mountJiniRoutes({ app, routes: agentRoutes({ deps: failingAgents, host }) }, { reporter });
  const response = await fetch(`${await listen(t, app)}/api/agents`);
  assert.equal(response.status, 500);
  assert.equal(await errorIdOf(response), "ERR-0000-0000-0000-0001");
  assert.deepEqual(recordedIds(entries), ["ERR-0000-0000-0000-0001"]);
  assert.equal(reports.length, 1);
  // An in-route caller's own incident goes through the same reporter: its answer and the record share the next id.
  const answer = host.reportInternalError({ report: { error: new Error("handled in route") }, logSource: "jini-routes-test", message: "It failed." });
  assert.equal(answer.requestId, "ERR-0000-0000-0000-0002");
  assert.deepEqual(recordedIds(entries), ["ERR-0000-0000-0000-0001", "ERR-0000-0000-0000-0002"]);
});

test("a pre-header failure reaches the next Express error handler without a record from the bridge", async t => {
  const { reporter, entries, reports } = createRecordingReporter({ ids: ["ERR-0000-0000-0000-0001"], iso: ISO });
  const app = express();
  mountJiniRoutes({ app, routes: [{ method: "GET", path: "/throws", handler: () => { throw new Error("before headers"); } }] }, { reporter });
  const handled: unknown[] = [];
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { handled.push(error); res.status(599).json({ from: "express-error" }); });
  const response = await fetch(`${await listen(t, app)}/throws`);
  assert.deepEqual([response.status, await from(response)], [599, "express-error"]);
  assert.equal((handled[0] as Error).message, "before headers");
  assert.deepEqual([entries.length, reports.length], [0, 0]);
});

/** A route whose answer dies after its headers were written: only the bridge can see that failure. */
const diesAfterHeaders: ServerRoute = { method: "GET", path: "/stream", handler: () => new Response(new ReadableStream({
  start(controller) { controller.enqueue(new TextEncoder().encode("partial")); },
  pull(controller) { controller.error(new Error("stream died")); },
}), { status: 200, headers: { "content-type": "text/plain" } }) };

test("a stream that dies after its headers is one record under the mount's reporter", async t => {
  const { reporter, entries, reports } = createRecordingReporter({ ids: ["ERR-0000-0000-0000-0001"], iso: ISO });
  const app = express();
  mountJiniRoutes({ app, routes: [diesAfterHeaders] }, { reporter });
  const response = await fetch(`${await listen(t, app)}/stream`);
  assert.equal(response.status, 200);
  await response.text().catch(() => undefined);
  for (let tries = 0; tries < 50 && entries.length === 0; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(recordedIds(entries), ["ERR-0000-0000-0000-0001"]);
  assert.equal(reports.length, 1);
});

/** One site's daemon scope: its own reporter over its own recording tracker, its own host and app. */
async function siteFixture(t: TestContext, { ids }: { ids: readonly string[] }) {
  const recorded = createRecordingReporter({ ids, iso: ISO });
  const operations = createRecordingObservability();
  const host = daemonRouteHost({ context: { originPolicy: allowAllOrigins }, parserLimitBytes: 102_400, errors: { reporter: recorded.reporter, observability: operations.observability } });
  const app = express();
  mountJiniRoutes({ app, routes: agentRoutes({ deps: failingAgents, host }) }, { reporter: recorded.reporter });
  return { ...recorded, origin: await listen(t, app) };
}

test("one site's route incident never reaches the other site's tracker", async t => {
  const siteA = await siteFixture(t, { ids: ["ERR-000A-0000-0000-0001"] });
  const siteB = await siteFixture(t, { ids: ["ERR-000B-0000-0000-0001"] });
  assert.equal(await errorIdOf(await fetch(`${siteA.origin}/api/agents`)), "ERR-000A-0000-0000-0001");
  assert.deepEqual([recordedIds(siteA.entries), siteA.reports.length], [["ERR-000A-0000-0000-0001"], 1]);
  assert.deepEqual([siteB.entries.length, siteB.reports.length], [0, 0]);
  // And the other way round, so neither site can be the one that happens to own a shared binding.
  assert.equal(await errorIdOf(await fetch(`${siteB.origin}/api/agents`)), "ERR-000B-0000-0000-0001");
  assert.deepEqual([recordedIds(siteB.entries), siteB.reports.length], [["ERR-000B-0000-0000-0001"], 1]);
  assert.deepEqual([recordedIds(siteA.entries), siteA.reports.length], [["ERR-000A-0000-0000-0001"], 1]);
});
