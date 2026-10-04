import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createPublicPageSecurityHeaders } from "../public-page-security-headers.js";

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
  await deps.postRepo.save({ ...htmlPage, id: randomUUID(), slug: "security-header-page", title: "Security header page", bodyHtml: "<p>Fixture page</p>" });
  const baseUrl = await startTestServer(createApp(deps), t);

  // The home listing needs no seeded content; both named pages are saved above.
  for (const path of ["/", "/security-header-page", "/raw-html-page", "/security-header-missing-page"]) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, path === "/security-header-missing-page" ? 404 : 200, path);
    assertPublicSecurityHeaders(res, path);
    assert.equal(res.headers.get("content-security-policy"), null, `${path}: no ENFORCED page CSP yet`);
    await res.text();
  }
  const submitted = await fetch(`${baseUrl}/forms/security-header-missing-form/submit`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: "name=Visitor",
    redirect: "manual",
  });
  assert.equal(submitted.status, 303);
  assertPublicSecurityHeaders(submitted, "form submit redirect");
  await submitted.text();
});

test("admin paths are not given the public-page headers", async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), "security-headers-admin-"));
  const previousDist = process.env.TOVU_ADMIN_DIST;
  const previousProxy = process.env.TOVU_ADMIN_DEV_PROXY_URL;
  t.after(async () => {
    if (previousDist === undefined) delete process.env.TOVU_ADMIN_DIST;
    else process.env.TOVU_ADMIN_DIST = previousDist;
    if (previousProxy === undefined) delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
    else process.env.TOVU_ADMIN_DEV_PROXY_URL = previousProxy;
    await rm(distDir, { recursive: true, force: true });
  });
  await writeFile(path.join(distDir, "index.html"), "<h1>Admin fixture</h1>");
  process.env.TOVU_ADMIN_DIST = distDir;
  delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  const baseUrl = await startTestServer(createApp(createRouteDeps()), t);
  for (const path of ["/admin", "/admin/users", "/api/admin/v1/me"]) {
    const res = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    await res.text();
    assert.equal(res.headers.get("content-security-policy-report-only"), null, path);
    // serve-static's /admin -> /admin/ redirect sets its own nosniff header.
    // Pin that admin baseline; the isolated middleware test below proves exclusion even
    // when a later admin handler supplies the same header as the public middleware.
    assert.equal(res.headers.get("x-content-type-options"), path === "/admin" ? "nosniff" : null, path);
    if (path === "/admin") {
      assert.equal(res.status, 301);
      assert.equal(res.headers.get("location"), "/admin/");
    } else if (path === "/admin/users") {
      assert.equal(res.status, 200);
    }
    assert.equal(res.headers.get("referrer-policy"), null, path);
  }
});

test("public middleware excludes all three headers on admin paths before downstream handlers", async (t) => {
  const app = express();
  app.use(createPublicPageSecurityHeaders({
    "X-Content-Type-Options": "fixture-nosniff",
    "Referrer-Policy": "fixture-referrer",
    "Content-Security-Policy-Report-Only": "fixture-csp",
  }));
  app.use((_req, res) => res.status(200).end());
  const baseUrl = await startTestServer(app, t);
  for (const route of ["/public", "/admin", "/admin/users", "/api/admin/v1/me"]) {
    const res = await fetch(`${baseUrl}${route}`);
    assert.equal(res.status, 200, route);
    assert.equal(res.headers.get("x-content-type-options"), route === "/public" ? "fixture-nosniff" : null, route);
    assert.equal(res.headers.get("referrer-policy"), route === "/public" ? "fixture-referrer" : null, route);
    assert.equal(res.headers.get("content-security-policy-report-only"), route === "/public" ? "fixture-csp" : null, route);
    await res.text();
  }
});
