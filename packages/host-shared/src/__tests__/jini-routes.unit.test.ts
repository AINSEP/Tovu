import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { jsonResponse, readJsonBody, type ServerRoute } from "@jini-ai/core/contracts/server";
import { allowAllOrigins } from "@jini-ai/core/contracts/server/testing";
import { TOVU_REQUEST_FACTS } from "#src/contracts/core/request-facts";
import { captureRequestFacts } from "#src/server/inbound/shared/request-facts";
import { daemonRouteHost, mountJiniRoutes } from "../jini-routes.js";

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
  assert.deepEqual(await response.json(), { from: { n: 1, s: "é" }, locals: { principalId: "alice", [TOVU_REQUEST_FACTS]: { clientAddress: "127.0.0.1", servingProtocol: "http", secure: false, query: {} } } });
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
  app.use((req, res, next) => { expected = captureRequestFacts({ req }); res.locals[TOVU_REQUEST_FACTS] = { clientAddress: "forged" }; res.locals.other = "kept"; next(); });
  mountJiniRoutes({ app, routes: [{ method: "GET", path: "/probe", handler: ({ locals }) => jsonResponse({ status: 200, body: { facts: locals?.[TOVU_REQUEST_FACTS], other: locals?.other } }) }] });
  const base = await listen(t, app);
  const answer = await (await fetch(`${base}/probe?tabId=a`, { headers: { "x-forwarded-for": "203.0.113.5", "x-forwarded-proto": "https" } })).json() as { facts: unknown; other: unknown };
  assert.deepEqual(answer.facts, expected);
  assert.equal((answer.facts as { clientAddress: string }).clientAddress, "203.0.113.5");
  assert.equal(answer.other, "kept");
});
