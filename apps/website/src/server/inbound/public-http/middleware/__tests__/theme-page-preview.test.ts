import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../../../runtime/composition/app.js";
import express from "express";
import { bootAuthenticated, loginAsBarePrincipal } from "../../../../__tests__/helpers/http-test-server.js";
import { registerAuthRoutes, requireAdminSession } from "../../../admin-http/dev-auth.js";
import { registerThemePagePreview } from "../theme-page-preview.js";
import type { RouteDeps } from "../../../../routes/types.js";

/**
 * @file `registerThemePagePreview` — the three `/theme-explore/...` preview routes, over real HTTP.
 *
 * Before this file only two happy paths were reached (a static page in the theme-file save tests,
 * `fashion-modern/template/home` in the site-title test). Every refusal branch was unasserted:
 * unknown theme, wrong tier, unknown page/partial/template, a template file with no route shape,
 * and — the one that matters most — that the templated route is session-gated and `theme.set`
 * gated while the two static routes stay public. The `no-store` header (a cached preview reads as
 * "my save did not work") was unasserted on the partial and templated routes.
 *
 * Themes: the real built-in `basic-2` (static) and `fashion-modern` (templated), plus a scratch
 * copy of `fashion-modern` with one extra `landing.liquid` template, which has no route shape.
 */

const REPO_THEMES = path.resolve(import.meta.dirname, "../../../../../../../../content/themes");

function scratchTemplatedThemesRoot(t: import("node:test").TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-preview-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const src = path.join(REPO_THEMES, "templated", "fashion-modern");
  const dest = path.join(root, "templated", "fm-scratch");
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of ["tokens.json", "css", "render"]) {
    fs.cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(src, "theme.json"), "utf8")) as Record<string, unknown>;
  fs.writeFileSync(path.join(dest, "theme.json"), JSON.stringify({ ...manifest, id: "fm-scratch", name: "FM Scratch" }));
  fs.writeFileSync(path.join(dest, "render", "pages", "landing.liquid"), "<p>landing</p>");
  return root;
}

async function bootSite(t: import("node:test").TestContext): Promise<{ deps: RouteDeps; baseUrl: string; cookie: string }> {
  const base = createRouteDeps();
  const scratch = discoverAllBuiltInThemes({ dir: scratchTemplatedThemesRoot(t), source: "built-in" });
  assert.ok(scratch.some((th) => th.manifest.id === "fm-scratch"), "precondition: the scratch templated theme was discovered");
  const deps: ReturnType<typeof createRouteDeps> = { ...base, themes: [...base.themes, ...scratch] };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  return { deps, baseUrl, cookie };
}

async function expectText(res: Response, status: number, body: string): Promise<void> {
  const text = await res.text();
  assert.equal(res.status, status, text);
  assert.equal(text, body);
}

test("static page route: a real page renders with Cache-Control: no-store, no session needed", async (t) => {
  const { baseUrl } = await bootSite(t);

  const res = await fetch(`${baseUrl}/theme-explore/basic-2/pricing`);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(await res.text(), /<html/i);
});

test("static page route: unknown theme, unknown page and a non-static theme are each refused with their own message", async (t) => {
  const { baseUrl } = await bootSite(t);

  await expectText(await fetch(`${baseUrl}/theme-explore/no-such-theme/index`), 404, "theme 'no-such-theme' was not found");
  await expectText(await fetch(`${baseUrl}/theme-explore/basic-2/no-such-page`), 404, "page 'no-such-page' was not found in theme 'basic-2'");
  await expectText(
    await fetch(`${baseUrl}/theme-explore/fashion-modern/index`),
    422,
    "theme 'fashion-modern' is a 'templated' theme; only static themes preview this way"
  );
});

test("partial route: a real partial renders no-store; an unknown partial and a non-static theme are refused", async (t) => {
  const { baseUrl } = await bootSite(t);

  const ok = await fetch(`${baseUrl}/theme-explore/basic-2/partial/nav`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.match(await ok.text(), /<html/i, "a partial is wrapped in a host document so it previews standalone");

  await expectText(await fetch(`${baseUrl}/theme-explore/basic-2/partial/no-such-partial`), 404, "partial 'no-such-partial' was not found in theme 'basic-2'");
  await expectText(
    await fetch(`${baseUrl}/theme-explore/fashion-modern/partial/nav`),
    422,
    "theme 'fashion-modern' is a 'templated' theme; only static themes preview this way"
  );
});

test("templated route: no session → 401, and a session without theme.set → 403 FORBIDDEN, while the static routes stay public", async (t) => {
  const { deps, baseUrl } = await bootSite(t);

  const anonymous = await fetch(`${baseUrl}/theme-explore/fashion-modern/template/home`);
  assert.equal(anonymous.status, 401);

  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const forbidden = await fetch(`${baseUrl}/theme-explore/fashion-modern/template/home`, { headers: { cookie: bareCookie } });
  assert.equal(forbidden.status, 403);
  assert.equal(((await forbidden.json()) as { code: string }).code, "FORBIDDEN");

  assert.equal((await fetch(`${baseUrl}/theme-explore/basic-2/index`)).status, 200);
});

test("templated route: 'entry' renders as the post route, no-store", async (t) => {
  const { baseUrl, cookie } = await bootSite(t);

  const res = await fetch(`${baseUrl}/theme-explore/fashion-modern/template/entry`, { headers: { cookie } });

  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
});

test("templated route: unknown theme, a static theme, an unknown template and a template with no route shape are each refused", async (t) => {
  const { baseUrl, cookie } = await bootSite(t);
  const get = (p: string) => fetch(`${baseUrl}/theme-explore/${p}`, { headers: { cookie } });

  await expectText(await get("no-such-theme/template/home"), 404, "theme 'no-such-theme' was not found");
  await expectText(await get("basic-2/template/home"), 422, "theme 'basic-2' is a 'static' theme; only templated themes preview this way");
  await expectText(await get("fashion-modern/template/no-such-template"), 404, "template 'no-such-template' was not found in theme 'fashion-modern'");
  await expectText(await get("fm-scratch/template/landing"), 422, "template 'landing' has no recognized route shape and cannot be previewed here");
});

test("templated route: home, products and product templates each render with their own route context, no-store", async (t) => {
  const { baseUrl, cookie } = await bootSite(t);
  for (const templateId of ["home", "products", "product"]) {
    const res = await fetch(`${baseUrl}/theme-explore/fashion-modern/template/${templateId}`, { headers: { cookie } });
    assert.equal(res.status, 200, `${templateId}: ${await res.clone().text()}`);
    assert.equal(res.headers.get("cache-control"), "no-store", templateId);
  }
});

test("templated route: a failure while gathering render data answers a plain 500 without the cause", async (t) => {
  const { deps, baseUrl, cookie } = await bootSite(t);
  t.mock.method(deps.postRepo, "list", async () => { throw new Error("content store offline"); });
  await expectText(await fetch(`${baseUrl}/theme-explore/fashion-modern/template/home`, { headers: { cookie } }), 500, "preview render failed");
});

test("route-param guards: each preview handler reached without its params refuses an empty theme id instead of crashing", async (t) => {
  const deps = createRouteDeps();
  const routed = express();
  registerThemePagePreview(routed, deps);
  type Layer = { route?: { path: string; stack: Array<{ handle: express.RequestHandler }> } };
  const finalHandler = (routePath: string): express.RequestHandler => {
    const layer = (routed as unknown as { _router: { stack: Layer[] } })._router.stack.find((entry) => entry.route?.path === routePath);
    assert.ok(layer?.route, routePath);
    return layer.route.stack[layer.route.stack.length - 1]!.handle;
  };
  const bare = express();
  bare.use(express.json());
  registerAuthRoutes(bare, deps);
  bare.get("/bare-page", finalHandler("/theme-explore/:themeId/:pageId"));
  bare.get("/bare-partial", finalHandler("/theme-explore/:themeId/partial/:partialId"));
  bare.get("/bare-template", requireAdminSession(deps), finalHandler("/theme-explore/:themeId/template/:templateId"));
  const { baseUrl, cookie } = await bootAuthenticated(bare, t);
  for (const route of ["/bare-page", "/bare-partial", "/bare-template"]) {
    await expectText(await fetch(`${baseUrl}${route}`, { headers: { cookie } }), 404, "theme '' was not found");
  }
});
