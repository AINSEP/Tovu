import assert from "node:assert/strict";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../http/index.js";
import { AkismetSpamCheck } from "../spam.external.js";
import type { CommentRecord, CommentSubmission } from "../types.js";

/**
 * @file SPEC-035 — `AkismetSpamCheck`, the external `SpamCheckPort` adapter (ADR-006 rule-of-two
 * "plausible next" half). Exercised against a small, self-contained fake `HttpClientPort` — NEVER
 * a real network call, matching this codebase's `RecordingHttpClient` (`integrations/http.
 * memory.ts`) pattern, kept local here rather than imported cross-feature (that class isn't part
 * of `integrations`'s public `index.ts` surface).
 */

type ScriptedResponse = HttpResponse | (() => HttpResponse);

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: readonly ScriptedResponse[];
  private cursor = 0;

  constructor(responses: readonly ScriptedResponse[] = [{ status: 200, headers: {}, bodyText: "false" }]) {
    this.responses = responses;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const entry = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (typeof entry === "function") return entry();
    return entry;
  }
}

const CONFIG = { apiKey: "test-api-key", blog: "https://example.com" };

function makeSubmission(overrides: Partial<CommentSubmission> = {}): CommentSubmission {
  return {
    workspaceId: "workspace-1",
    entryId: "entry-1",
    parentId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.com",
    authorUrl: "https://visitor.example",
    bodyRaw: "A normal comment.",
    authorPrincipalId: null,
    ingressContext: { authorIpHash: "salted-hash-not-a-real-ip" },
    ...overrides,
  };
}

function makeComment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: "comment-1",
    workspaceId: "workspace-1",
    entryId: "entry-1",
    parentId: null,
    threadRootId: "comment-1",
    depth: 0,
    status: "spam",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.com",
    authorUrl: null,
    authorIpHash: "salted-hash",
    bodyText: "A normal comment.",
    spamScore: 0.9,
    spamProvider: "akismet",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

test("check() POSTs to the comment-check endpoint, form-encoded, without a user_ip field", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "false" }]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  await adapter.check(makeSubmission());

  assert.equal(http.calls.length, 1);
  const req = http.calls[0];
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://test-api-key.rest.akismet.com/1.1/comment-check");
  assert.equal(req.headers["content-type"], "application/x-www-form-urlencoded");
  assert.ok(req.body, "a body must be sent");
  const params = new URLSearchParams(req.body);
  assert.equal(params.get("blog"), "https://example.com");
  assert.equal(params.get("comment_author"), "Visitor");
  assert.equal(params.get("comment_content"), "A normal comment.");
  assert.equal(params.has("user_ip"), false, "no raw IP is ever available to send");
  assert.equal(params.has("user_agent"), false);
});

test("check() maps a plain 'true' response to isSpam with a high-but-not-maximal score", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "true" }]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  const verdict = await adapter.check(makeSubmission());
  assert.equal(verdict.isSpam, true);
  assert.equal(verdict.score, 0.85);
  assert.equal(verdict.provider, "akismet");
});

test("check() maps 'true' + X-akismet-pro-tip: discard to full-confidence score 1", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: { "x-akismet-pro-tip": "discard" }, bodyText: "true" }]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  const verdict = await adapter.check(makeSubmission());
  assert.equal(verdict.isSpam, true);
  assert.equal(verdict.score, 1);
});

test("check() maps a 'false' response to not-spam, score 0", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "false" }]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  const verdict = await adapter.check(makeSubmission());
  assert.equal(verdict.isSpam, false);
  assert.equal(verdict.score, 0);
});

test("check() fails OPEN (never flags as spam) on a non-2xx response", async () => {
  const http = new FakeHttpClient([{ status: 500, headers: {}, bodyText: "internal error" }]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  const verdict = await adapter.check(makeSubmission());
  assert.equal(verdict.isSpam, false);
  assert.equal(verdict.score, 0);
  assert.equal(verdict.provider, "akismet-unavailable");
});

test("check() fails OPEN on a thrown transport error (network failure/timeout)", async () => {
  const http = new FakeHttpClient([
    () => {
      throw new Error("ECONNREFUSED");
    },
  ]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  const verdict = await adapter.check(makeSubmission());
  assert.equal(verdict.isSpam, false);
  assert.equal(verdict.score, 0);
  assert.equal(verdict.provider, "akismet-unavailable");
});

test("report() POSTs to submit-spam / submit-ham depending on the verdict", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "Thanks" }]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  await adapter.report({ workspaceId: "workspace-1", comment: makeComment(), verdict: "spam" });
  assert.equal(http.calls[0].url, "https://test-api-key.rest.akismet.com/1.1/submit-spam");

  const http2 = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "Thanks" }]);
  const adapter2 = new AkismetSpamCheck(http2, CONFIG);
  await adapter2.report({ workspaceId: "workspace-1", comment: makeComment(), verdict: "ham" });
  assert.equal(http2.calls[0].url, "https://test-api-key.rest.akismet.com/1.1/submit-ham");
});

test("report() swallows a transport error rather than throwing (best-effort feedback)", async () => {
  const http = new FakeHttpClient([
    () => {
      throw new Error("ECONNREFUSED");
    },
  ]);
  const adapter = new AkismetSpamCheck(http, CONFIG);
  await assert.doesNotReject(() => adapter.report({ workspaceId: "workspace-1", comment: makeComment(), verdict: "spam" }));
});
