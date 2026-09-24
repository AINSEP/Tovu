import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { loginAsOwner, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import {
  isAuthenticatedBodyPath,
  jsonBodyLimitForAuthenticatedRequest,
  LARGE_UPLOAD_JSON_BODY_LIMIT,
  AUTHENTICATED_JSON_BODY_LIMIT,
} from "../json-body-parsers.js";

/**
 * @file The app's JSON body limits: unauthenticated routes parse at most a small body, and only an
 * authenticated caller's body is ever parsed at the large admin/upload limits — AFTER the session
 * gate, so an anonymous caller cannot make the server buffer and parse tens of megabytes.
 */

const TOO_LARGE = { error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" };

function jsonOfSize(bytes: number): string {
  const prefix = '{"pad":"';
  const suffix = '"}';
  return `${prefix}${"a".repeat(bytes - prefix.length - suffix.length)}${suffix}`;
}

async function boot(t: import("node:test").TestContext): Promise<string> {
  return startTestServer(createApp(createRouteDeps()), t);
}

test("a public route rejects a 200 KB JSON body with a JSON 413", async (t) => {
  const baseUrl = await boot(t);
  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/ws/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: jsonOfSize(200 * 1024),
  });
  assert.equal(res.status, 413);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await res.json(), TOO_LARGE);
});

test("an anonymous admin request is refused by the session gate before its body is parsed", async (t) => {
  const baseUrl = await boot(t);
  // Malformed JSON: if anything parsed it before the gate, this would be a body-parser 400.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "unauthenticated", code: "UNAUTHENTICATED" });
});

test("an authenticated media upload still accepts a 20 MB body", async (t) => {
  const baseUrl = await boot(t);
  const cookie = await loginAsOwner(baseUrl);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: jsonOfSize(20 * 1024 * 1024),
  });
  assert.notEqual(res.status, 413);
});

test("an authenticated ordinary admin route accepts 1 MB but rejects 16 MB with a JSON 413", async (t) => {
  const baseUrl = await boot(t);
  const cookie = await loginAsOwner(baseUrl);
  const url = `${baseUrl}/api/admin/v1/workspaces/ws/redirects`;
  const small = await fetch(url, { method: "POST", headers: { "content-type": "application/json", cookie }, body: jsonOfSize(1024 * 1024) });
  assert.notEqual(small.status, 413);
  const big = await fetch(url, { method: "POST", headers: { "content-type": "application/json", cookie }, body: jsonOfSize(16 * 1024 * 1024) });
  assert.equal(big.status, 413);
  assert.deepEqual(await big.json(), TOO_LARGE);
});

test("login stays reachable (parsed at the public limit, ahead of the gate)", async (t) => {
  const baseUrl = await boot(t);
  assert.notEqual(await loginAsOwner(baseUrl), "");
});

test("isAuthenticatedBodyPath matches every session-gated prefix on a segment boundary, case-insensitively", () => {
  for (const p of ["/api/admin/v1/x", "/API/Admin/v1/x", "/api/runs", "/api/runs/1/cancel", "/api/assistant/chats/9", "/api/agents/rescan", "/api/tools", "/api/frontend-sessions/s/responses", "/api/attachments"]) {
    assert.equal(isAuthenticatedBodyPath(p), true, p);
  }
  for (const p of ["/api/admin/v1/auth/login", "/api/admin/v1/auth/boot-session", "/api/adminx", "/api/members/v1/workspaces/w/sign-in", "/forms/a/submit", "/api/site-assistant/chat"]) {
    assert.equal(isAuthenticatedBodyPath(p), false, p);
  }
});

test("jsonBodyLimitForAuthenticatedRequest gives the upload limit only to the three large-body routes", () => {
  assert.equal(jsonBodyLimitForAuthenticatedRequest("POST", "/api/admin/v1/workspaces/w/media"), LARGE_UPLOAD_JSON_BODY_LIMIT);
  assert.equal(jsonBodyLimitForAuthenticatedRequest("PUT", "/api/admin/v1/workspaces/w/publish-content/blobs/abc"), LARGE_UPLOAD_JSON_BODY_LIMIT);
  assert.equal(jsonBodyLimitForAuthenticatedRequest("POST", "/api/admin/v1/workspaces/w/publish-content/bundles"), LARGE_UPLOAD_JSON_BODY_LIMIT);
  assert.equal(jsonBodyLimitForAuthenticatedRequest("PATCH", "/api/admin/v1/workspaces/w/media"), AUTHENTICATED_JSON_BODY_LIMIT);
  assert.equal(jsonBodyLimitForAuthenticatedRequest("POST", "/api/admin/v1/workspaces/w/media/1/extra"), AUTHENTICATED_JSON_BODY_LIMIT);
  assert.equal(jsonBodyLimitForAuthenticatedRequest("POST", "/api/runs"), AUTHENTICATED_JSON_BODY_LIMIT);
});
