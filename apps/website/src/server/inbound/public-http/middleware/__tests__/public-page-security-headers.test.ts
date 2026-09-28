import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file Public pages carry `nosniff`, a `Referrer-Policy`, and a REPORT-ONLY CSP
 * (build-vs-borrow-verified 2026-09-28 §5b), mounted through the real `createApp()` so the test
 * proves the middleware sits ahead of every public route. Admin paths are left alone.
 */

process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

function assertPublicSecurityHeaders(res: Response, label: string): void {
  assert.equal(res.headers.get("x-content-type-options"), "nosniff", label);
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin", label);
  const csp = res.headers.get("content-security-policy-report-only") ?? "";
  assert.match(csp, /(^|; )default-src 'self'(;|$)/, label);
  assert.match(csp, /(^|; )object-src 'none'(;|$)/, label);
  assert.match(csp, /(^|; )base-uri 'self'(;|$)/, label);
  assert.match(csp, /(^|; )script-src 'self' 'unsafe-inline'/, label);
  assert.match(csp, /(^|; )img-src 'self' data: https:(;|$)/, label);
  assert.doesNotMatch(csp, /frame-ancestors/, `${label}: frame-ancestors is deliberately unset`);
}

test("public pages get nosniff, Referrer-Policy and a report-only CSP; the CSP never blocks", async (t) => {
  const deps = createRouteDeps();
  await deps.seoReady;
  const htmlPage = {
    id: randomUUID(),
    workspaceId: deps.workspaceId,
    title: "Raw HTML page",
    slug: "raw-html-page",
    bodyJson: {},
    status: "published",
    kind: "page",
    bodyFormat: "html",
    bodyHtml: `<p>hi</p><script>window.inlineRan = true;</script>`,
    templateChoice: "",
    updatedAt: new Date().toISOString(),
    version: 1,
    memberAccessJson: null,
  } as unknown as PostRecord;
  await deps.postRepo.save(htmlPage);
  const baseUrl = await startTestServer(createApp(deps), t);

  for (const path of ["/", "/welcome", "/raw-html-page"]) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 200, path);
    assertPublicSecurityHeaders(res, path);
    assert.equal(res.headers.get("content-security-policy"), null, `${path}: no ENFORCED page CSP yet`);
    await res.text();
  }
});

test("admin paths are not given the public-page headers", async (t) => {
  const baseUrl = await startTestServer(createApp(createRouteDeps()), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/me`);
  await res.text();
  assert.equal(res.headers.get("content-security-policy-report-only"), null);
});
