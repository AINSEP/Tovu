import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../../../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal } from "../../../../__tests__/helpers/http-test-server.js";
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
