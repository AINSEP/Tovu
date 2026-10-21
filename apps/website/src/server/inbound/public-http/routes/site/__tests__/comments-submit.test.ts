import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { CommentSubmission } from "@jini-ai/cms/comments";
import type { CommentIngressPolicy, CommentIngressResult } from "@jini-ai/cms/comments";
import { registerCommentsSubmitRoute, commentFormReturnTo, isSameOriginCommentPost } from "../comments-submit.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";


/**
 * @file Unit-tier coverage for `POST /api/site/comments` (`registerCommentsSubmitRoute`) — this
 * route's builder functions (`buildCommentSubmission`/`buildIngressContext`/`hashClientIp`) have no
 * dedicated test file of their own; the happy path is covered end-to-end by
 * `server/__tests__/routes/comments-e2e.test.ts` and the unguarded-catch 500 path by
 * `server/__tests__/route-async-guards.test.ts`. This file targets the builder's own optional-field
 * normalization branches (parentId/authorEmail/authorUrl present vs. absent, entryId/authorName/body
 * absent, the honeypot ternary, and the ingress-rejection 422 path), none of which either of those
 * two files exercises: the e2e test only ever sends a minimal accepted submission, and the
 * async-guards test only ever forces `ingressPolicy.submit` to THROW (never to resolve `ok: false`).
 *
 * A stub `CommentIngressPolicy` is used (not the real `createCommentIngressPolicy`) so every test
 * can assert on the EXACT `CommentSubmission` this route builds, independent of the real policy's own
 * entry-lookup/rate-limit/honeypot logic (already covered by `features/comments/__tests__`).
 */

const WORKSPACE_ID = "workspace-1";

function buildApp(
  submitImpl: CommentIngressPolicy["submit"],
  ipHashSalt: Promise<string> = Promise.resolve("fixed-audit-salt")
): { app: express.Express; calls: CommentSubmission[] } {
  const calls: CommentSubmission[] = [];
  const ingressPolicy: CommentIngressPolicy = {
    submit: async (submission) => {
      calls.push(submission);
      return submitImpl(submission);
    },
  };
  const app = express();
  app.use(express.json());
  registerCommentsSubmitRoute(app, {
    ingressPolicy, workspaceId: WORKSPACE_ID,
    // Normalization tests isolate ingress behavior from the separately owned HTTP budget.
    rateLimiter: { check: async () => ({ allowed: true }) },
    ipHashSalt,
  });
  return { app, calls };
}

/** Express's own (internal, untyped) per-route layer shape — same technique
 *  `analytics-ingest.test.ts` uses to reach in and call the registered handler DIRECTLY. Needed only
 *  for `req.ip`'s double-`??` fallback: every REAL TCP connection always has SOME socket, so Express
 *  always derives a non-empty `req.ip`, meaning neither `??` side in `hashClientIp` is reachable
 *  through any real network request (this file's own header mirrors `analytics/ingest.ts`'s
 *  identical `req.ip ?? req.socket.remoteAddress ?? ""` shape and its identical unreachability). */
interface ExpressHandlerLayer {
  route?: { path: string; stack: { handle: (req: unknown, res: unknown) => unknown }[] };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

function extractHandler(app: express.Express, path: string): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route '${path}' was not found in the router stack`);
  const handle = layer.route.stack.at(-1)!.handle as (req: unknown, res: unknown, next?: (error?: unknown) => void) => unknown;
  return ((req: unknown, res: unknown, next?: (error?: unknown) => void) => handle({
    protocol: 'http', headers: {}, get: (key: string) => key === 'origin' ? 'http://site.test' : 'site.test', is: () => false,
    ...(req as object),
  }, res, next)) as (req: unknown, res: unknown) => unknown;
}

/** Runs the mounted boundary on an already parsed body; Express owns JSON/urlencoded decoding. */
function directFetch(app: express.Express) {
  return async (_url: string, options: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }) => {
    let status = 200; let payload: unknown;
    const response = { status(code: number) { status = code; return response; }, json(value: unknown) { payload = value; return response; } };
    await extractHandler(app, '/api/site/comments')({ body: JSON.parse(options.body ?? '{}'), ip: '203.0.113.1', socket: {} }, response);
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  };
}

test("comments-submit: parentId/authorEmail/authorUrl present and entryId/authorName/body absent are normalized, the honeypot field is captured, and a 422 ingress rejection is surfaced verbatim", async (t) => {
  const { app, calls } = buildApp(async () => ({ ok: false, reason: "entry-not-found" }));
  const baseUrl = 'http://site.test';
  const fetch = directFetch(app);

  const res = await fetch(`${baseUrl}/api/site/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentId: "parent-x",
      authorEmail: "visitor@example.com",
      authorUrl: "https://visitor.example.com",
      website: "bot-filled-this", // conventional honeypot field name
    }),
  });

  assert.equal(res.status, 422, "every ingress rejection maps to the same generic 422 (this route's own no-oracle contract)");
  const body = (await res.json()) as { error: string; reason: string };
  assert.equal(body.reason, "entry-not-found");

  assert.equal(calls.length, 1);
  const submitted = calls[0];
  assert.equal(submitted.entryId, "", "entryId omitted -> the `??` fallback normalizes it to an empty string, never `undefined`");
  assert.equal(submitted.authorName, "", "authorName omitted -> the `??` fallback normalizes it to an empty string");
  assert.equal(submitted.bodyRaw, "", "body omitted -> the `??` fallback normalizes it to an empty string");
  assert.equal(submitted.parentId, "parent-x", "a present parentId is threaded through as a string -- the ternary's TRUE arm");
  assert.equal(submitted.authorEmail, "visitor@example.com", "a present authorEmail is threaded through -- the ternary's TRUE arm");
  assert.equal(submitted.authorUrl, "https://visitor.example.com", "a present authorUrl is threaded through -- the ternary's TRUE arm");
  assert.equal(submitted.ingressContext.honeypotValue, "bot-filled-this", "a string `website` field is captured as the honeypot value -- the ternary's TRUE arm");
});

test("comments-submit: `req.ip ?? req.socket.remoteAddress ?? \"unknown\"` double fallback, forced via a direct handler call with both left undefined -- still succeeds and hashes \"unknown\"", async () => {
  // Only `id`/`status` are read by the route on the success path (see `registerCommentsSubmitRoute`'s
  // `res.status(201).json({ id: result.comment.id, status: result.comment.status })`) -- a minimal
  // stand-in cast to the full `CommentRecord` shape is deliberate, matching this suite's stub-policy
  // style rather than constructing every field of a real comment record.
  const okResult = {
    ok: true,
    comment: { id: "c1", status: "approved" },
    autoClassified: "approved",
  } as unknown as CommentIngressResult;
  const { app, calls } = buildApp(async () => okResult);
  const handler = extractHandler(app, "/api/site/comments");

  let statusCode: number | undefined;
  let jsonBody: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      jsonBody = payload;
      return res;
    },
  };
  const req = {
    body: { entryId: "entry-1", authorName: "Visitor", body: "hello there" },
    ip: undefined,
    socket: { remoteAddress: undefined },
  };

  await handler(req, res);

  assert.equal(statusCode, 201);
  assert.deepEqual(jsonBody, { id: "c1", status: "approved" });

  assert.equal(
    calls[0].ingressContext.authorIpHash,
    "27b8de53257be3e509f3debb4d628cae66f7c4a91bd23068fbcc1b075d8f485c",
    "both req.ip and req.socket.remoteAddress falling through leaves hashClientIp hashing the literal \"unknown\""
  );
});

test("comments-submit: unexpected ingress and body-conversion failures finish with a secret-free 500", async (t) => {
  const { app } = buildApp(async () => { throw new Error("private database credentials"); });
  const baseUrl = 'http://site.test';
  const fetch = directFetch(app);
  const failed = await fetch(`${baseUrl}/api/site/comments`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ entryId: "entry-1", body: "hello" }), signal: AbortSignal.timeout(3000),
  });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  // Valid JSON with a non-coercible body value fails before ingress is called.
  const { app: malformedApp, calls } = buildApp(async () => ({ ok: false, reason: "entry-not-found" }));
  const malformedBaseUrl = 'http://site.test';
  const malformedFetch = directFetch(malformedApp);
  const malformed = await malformedFetch(`${malformedBaseUrl}/api/site/comments`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: '{"body":{"toString":null,"valueOf":null}}', signal: AbortSignal.timeout(3000),
  });
  assert.equal(malformed.status, 500);
  assert.deepEqual(await malformed.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  assert.deepEqual(calls, []);
});

// REGRESSION (2026-10-08 hardwiring audit #4): fails if the route reads COMMENTS_IP_SALT (or its old
// public fallback) itself instead of hashing with the salt its composition root injected.
test("comments-submit: authorIpHash uses the injected salt, never COMMENTS_IP_SALT from the environment", async (t) => {
  const previousSalt = process.env.COMMENTS_IP_SALT;
  process.env.COMMENTS_IP_SALT = "ambient-env-salt";
  t.after(() => {
    if (previousSalt === undefined) delete process.env.COMMENTS_IP_SALT;
    else process.env.COMMENTS_IP_SALT = previousSalt;
  });
  const okResult = { ok: true, comment: { id: "c1", status: "approved" }, autoClassified: "approved" } as unknown as CommentIngressResult;
  const hashFor = async (salt: string) => {
    const { app, calls } = buildApp(async () => okResult, Promise.resolve(salt));
    const handler = extractHandler(app, "/api/site/comments");
    const res = { status() { return res; }, json() { return res; } };
    await handler({ body: { entryId: "entry-1", authorName: "Visitor", body: "hi" }, ip: "203.0.113.7", socket: {} }, res);
    return calls[0].ingressContext.authorIpHash;
  };
  const injected = await hashFor("fixed-audit-salt");
  assert.ok(typeof injected === "string");
  assert.match(injected, /^[0-9a-f]{64}$/);
  assert.notEqual(injected, await hashFor("ambient-env-salt"), "a different injected salt must change the hash");
  assert.notEqual(injected, await hashFor("dev-only-insecure-salt"), "the injected salt, not the old public constant, decides the hash");
});

test("comments-submit: a salt that never resolves to a usable value fails the request through next(error), not at registration", async () => {
  const { app } = buildApp(async () => { throw new Error("unreachable"); }, Promise.reject(new Error("salt resolution failed")));
  const handler = extractHandler(app, "/api/site/comments") as (req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<unknown>;
  let forwarded: unknown;
  await handler({ body: {} }, {}, (error) => { forwarded = error; });
  assert.ok(forwarded instanceof Error);
  assert.equal((forwarded as Error).message, "salt resolution failed");
});

// REGRESSION (2026-10-08 dev-server boot): a caller missing ipHashSalt crashed boot with an opaque
// "Cannot read properties of undefined (reading 'then')"; it must be a named TypeError instead.
test("comments-submit: registering without ipHashSalt refuses with a named TypeError", () => {
  const app = express();
  assert.throws(
    () => registerCommentsSubmitRoute(app, {
      ingressPolicy: { submit: async () => ({ ok: false, reason: "entry-not-found" }) },
      workspaceId: WORKSPACE_ID,
      rateLimiter: { check: async () => ({ allowed: true }) },
    } as unknown as Parameters<typeof registerCommentsSubmitRoute>[1]),
    { name: "TypeError", message: "registerCommentsSubmitRoute requires deps.ipHashSalt (a Promise<string> from resolveCommentsIpHashSalt at the composition root)" }
  );
});

test('no-JS form uses urlencoded parsing and safe 303 destinations for accepted and rejected comments', async () => {
  for (const accepted of [true, false]) {
    const { app, calls } = buildApp(async () => accepted
      ? { ok: true, comment: { id: 'held', status: 'pending' }, autoClassified: 'pending' } as CommentIngressResult
      : { ok: false, reason: 'honeypot-tripped' });
    const route = (app as unknown as ExpressAppWithRouter)._router.stack.find(layer => layer.route?.path === '/api/site/comments')!.route!;
    assert.equal(route.stack.length, 2, 'native urlencoded parser precedes the submission handler');
    let redirected: unknown;
    await extractHandler(app, '/api/site/comments')({ body: { entryId: 'e', returnTo: '/post?lang=en', website: 'honeypot' },
      ip: '203.0.113.1', socket: {}, is: () => 'application/x-www-form-urlencoded' }, {
      redirect: (status: number, url: string) => { redirected = { status, url }; },
    });
    assert.deepEqual(redirected, { status: 303, url: `/post?lang=en#${accepted ? 'comment-pending' : 'comment-error'}` });
    assert.equal(calls[0].ingressContext.honeypotValue, 'honeypot');
  }
  for (const value of [undefined, 1, '//evil.test', '/\\evil.test', '/post\r\nLocation: evil']) assert.equal(commentFormReturnTo({ value }), '/');
  assert.equal(commentFormReturnTo({ value: '/post?x=1#old' }, {}), '/post?x=1');
});

test('origin is required and forged or cross-site origins never reach hashing, budgets or ingress', async () => {
  const { app, calls } = buildApp(async () => ({ ok: false, reason: 'invalid' }));
  for (const origin of [undefined, 'null', 'https://evil.test', 'http://site.test.evil.test']) {
    let status: unknown;
    const res = { status(code: number) { status = code; return res; }, json() { return res; } };
    await extractHandler(app, '/api/site/comments')({ get: (key: string) => key === 'origin' ? origin : 'site.test' }, res);
    assert.equal(status, 403);
  }
  assert.deepEqual(calls, []);
});

test('provider submission dispatch preserves hashes and refuses disabled/embedded providers', async () => {
  const inputs: unknown[] = [];
  for (const kind of ['stored', 'embedded', 'disabled', 'rejected']) {
    const app = express();
    const active = { kind: kind === 'rejected' ? 'stored' : kind,
      submission: { submit: async (input: unknown) => { inputs.push(input); return kind === 'rejected'
        ? { ok: false, reason: 'honeypot-tripped' } : { ok: true, id: 'c', status: 'pending' }; } } };
    registerCommentsSubmitRoute(app, { workspaceId: 's', ingressPolicy: { submit: async () => { throw new Error('must dispatch provider'); } },
      ipHashSalt: Promise.resolve('salt'), rateLimiter: { check: async () => ({ allowed: true }) },
      providers: { active: async () => ({ adapter: kind === 'disabled' ? undefined : active }) } as unknown as NonNullable<Parameters<typeof registerCommentsSubmitRoute>[1]['providers']>,
    });
    const response = await directFetch(app)('http://site.test', { body: JSON.stringify({ entryId: 'e', authorName: 'Name', body: 'Text', website: '' }) });
    assert.equal(response.status, kind === 'stored' ? 201 : 422);
    assert.deepEqual(await response.json(), kind === 'stored' ? { id: 'c', status: 'pending' }
      : { error: 'comment was not accepted', reason: kind === 'rejected' ? 'honeypot-tripped' : 'comments-disabled' });
  }
  assert.equal(inputs.length, 2);
  assert.match((inputs[0] as { authorIpHash: string }).authorIpHash, /^[a-f0-9]{64}$/);
});

test('same-origin gate: JSON without Origin is a non-browser client; forwarded https, forms and opaque origins are judged by Origin', () => {
  const request = (headers: Record<string, string>, type: string | false = false) => ({
    headers, protocol: 'http', is: (value: string) => (type === value ? type : false),
    get: (key: string) => (key === 'host' ? 'site.test' : headers[key]),
  }) as unknown as Parameters<typeof isSameOriginCommentPost>[0]['request'];
  assert.equal(isSameOriginCommentPost({ request: request({}, 'application/json') }), true);
  assert.equal(isSameOriginCommentPost({ request: request({}, 'application/x-www-form-urlencoded') }), false, 'a browser form always sends Origin');
  assert.equal(isSameOriginCommentPost({ request: request({ origin: 'https://site.test', 'x-forwarded-proto': 'https' }) }, {}), true);
  assert.equal(isSameOriginCommentPost({ request: request({ origin: 'https://site.test' }) }), false, 'scheme must match');
  assert.equal(isSameOriginCommentPost({ request: request({ origin: 'null' }, 'application/json') }), false);
});

test('behind a trusted proxy hop, two visitors sharing the proxy socket get separate rate-limit buckets (not one shared key)', async (t) => {
  const keysFor = async (trustProxy: number | false) => {
    const keys: string[] = [];
    const app = express();
    app.set('trust proxy', trustProxy);
    app.use(express.json());
    registerCommentsSubmitRoute(app, { workspaceId: WORKSPACE_ID, ipHashSalt: Promise.resolve('salt'),
      ingressPolicy: { submit: async () => ({ ok: false, reason: 'entry-not-found' }) },
      rateLimiter: { check: async ({ key }) => { keys.push(key); return { allowed: true }; } } });
    const baseUrl = await startTestServer(app, t);
    for (const visitor of ['198.51.100.7', '198.51.100.8']) {
      const res = await fetch(`${baseUrl}/api/site/comments`, { method: 'POST', body: JSON.stringify({ entryId: 'e', body: 'x' }),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': visitor }, signal: AbortSignal.timeout(3000) });
      assert.equal(res.status, 422);
    }
    return keys;
  };
  const trusted = await keysFor(1);
  assert.equal(trusted.length, 2);
  assert.notEqual(trusted[0], trusted[1]);
  assert.ok(trusted.every(key => /^[a-f0-9]{64}$/.test(key)), 'the key is the salted hash, never the raw address');
  const untrusted = await keysFor(false);
  assert.equal(untrusted[0], untrusted[1], 'without the platform hop the socket peer is the only identity (the reason trust-proxy.ts exists)');
});
