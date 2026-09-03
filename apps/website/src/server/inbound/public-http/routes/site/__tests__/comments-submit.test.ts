import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import express from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { CommentSubmission } from "#src/features/comments/index";
import type { CommentIngressPolicy, CommentIngressResult } from "#src/features/comments/ports";
import { registerCommentsSubmitRoute } from "../comments-submit.js";

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
  submitImpl: CommentIngressPolicy["submit"]
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
  registerCommentsSubmitRoute(app, { ingressPolicy, workspaceId: WORKSPACE_ID });
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
  return layer.route.stack[0].handle;
}

test("comments-submit: parentId/authorEmail/authorUrl present and entryId/authorName/body absent are normalized, the honeypot field is captured, and a 422 ingress rejection is surfaced verbatim", async (t) => {
  const { app, calls } = buildApp(async () => ({ ok: false, reason: "entry-not-found" }));
  const baseUrl = await startTestServer(app, t);

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

  const salt = process.env.COMMENTS_IP_SALT ?? "dev-only-insecure-salt";
  const expectedHash = createHash("sha256").update(`unknown:${salt}`).digest("hex");
  assert.equal(
    calls[0].ingressContext.authorIpHash,
    expectedHash,
    "both req.ip and req.socket.remoteAddress falling through leaves hashClientIp hashing the literal \"unknown\""
  );
});
