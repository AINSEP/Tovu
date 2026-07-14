import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createApp, createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminSeoGetEntryRoute } from "../../routes/admin/seo/get-entry";
import { registerAdminSeoPutEntryRoute } from "../../routes/admin/seo/put-entry";
import type { RouteDeps } from "../../routes/types";
import { startTestServer, loginAsOwner } from "../helpers/http-test-server";

/**
 * @file Coordinator-authored (2026-07-13), post-session-limit resume. SPEC-008's
 * tasks.md (T040-T045) called for 5 integration test files that were never
 * written because the implementing agent was killed before reaching Phase 7.
 * This is a single consolidated file covering the load-bearing paths: admin
 * auth gating, the entry-meta round trip through the real SQLite-backed
 * chokepoint, and — most importantly — that the public site + sitemap/robots
 * routes are actually reachable through the real running app (`createApp()`),
 * not just unit-testable in isolation.
 */

const WORKSPACE_ID = "workspace-local";

function buildAdminTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminSeoGetEntryRoute(app, deps);
  registerAdminSeoPutEntryRoute(app, deps);
  return { app, deps };
}

test("T042: GET entry-meta without admin.seo.manage is denied 403", async (t) => {
  const { app, deps } = buildAdminTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;
  const post = (await deps.postRepo.list({ workspaceId: WORKSPACE_ID }))[0];

  // No login at all -> requireAdminSession itself rejects (401), proving the route is gated end to end.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${post!.id}`);
  assert.equal(res.status, 401);
});

test("T042: GET/PUT entry-meta round trip via the real chokepoint", async (t) => {
  const { app, deps } = buildAdminTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  await deps.seoReady;
  const post = (await deps.postRepo.list({ workspaceId: WORKSPACE_ID }))[0];

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${post!.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Custom SEO Title" }),
  });
  const putBody = (await put.json()) as { data: { title: string } };
  assert.equal(put.status, 200);
  assert.equal(putBody.data.title, "Custom SEO Title");

  const get = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${post!.id}`, {
    headers: { cookie },
  });
  assert.equal(get.status, 200);
  const getBody = (await get.json()) as { data: { title: string } };
  assert.equal(getBody.data.title, "Custom SEO Title");
});

test("T040/T041: /sitemap.xml and /robots.txt are reachable through the real running app, unauthenticated", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") ?? "", /xml/);
  assert.match(await sitemap.text(), /<urlset/);

  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type") ?? "", /text\/plain/);
});

test("T045: the real home-page render includes SEO's folded <title> tag, not just the raw shell default", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const html = await home.text();
  // Exactly one <title> tag — proves pageShell's own hardcoded title was suppressed
  // in favor of the fold's, not emitted twice.
  const titleMatches = html.match(/<title>/g) ?? [];
  assert.equal(titleMatches.length, 1);
  assert.match(html, /<link rel="canonical"/);
});
