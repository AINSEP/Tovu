import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { InMemoryPresentationSettingsRepo, type PresentationSettingsRecord } from "#src/features/presentation/index";
import { NO_THEME_ID } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file The public site with the theme DELIBERATELY turned off — state 3 of the optional-theme
 * feature, end to end through real HTTP.
 *
 * The distinction every assertion here turns on: `resolveActiveTheme` returning `null` means
 * "nothing is installed", which is a genuine 500 and stays one. The sentinel means the operator
 * chose to handle styling themselves and expects a real, complete page back. Overloading the two
 * onto the same `null` would route "deliberately themeless" straight into `sendNoThemesInstalled`'s
 * 500 — the exact defect class this feature exists to remove, so both sides are asserted here
 * rather than only the new one.
 *
 * `themes` is left at its default (every stock theme discovered) on purpose. A test that also
 * emptied the theme list could not tell "the sentinel worked" from "there was no theme to find".
 */

const WORKSPACE_ID = "workspace-local"; // must match seed.ts's seededWorkspace.id

const NO_THEME_SETTINGS: PresentationSettingsRecord = {
  workspaceId: WORKSPACE_ID,
  activeThemeId: NO_THEME_ID,
  updatedAt: "2026-09-12T00:00:00.000Z",
} as PresentationSettingsRecord;

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>> = {}) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

async function startThemelessServer() {
  return startServer({ presentationRepo: new InMemoryPresentationSettingsRepo([NO_THEME_SETTINGS]) });
}

test("GET / with the theme off serves a real, unstyled page — 200, not the no-themes 500", async (t) => {
  const { server, baseUrl } = await startThemelessServer();
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /No themes installed/);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /class="site-header"/, "the unstyled document must still carry its styling hooks");
});

test("GET /:slug with the theme off serves the post, unstyled", async (t) => {
  const { server, baseUrl } = await startThemelessServer();
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/welcome`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /No themes installed/);
  assert.match(html, /Welcome to Tovu/);
});

test("GET /products with the theme off serves the storefront, unstyled", async (t) => {
  const { server, baseUrl } = await startThemelessServer();
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /No themes installed/);
  assert.doesNotMatch(html, /Site error/);
});

test("a themeless public page emits no `data-theme` and no theme badge on ANY route", async (t) => {
  const { server, baseUrl } = await startThemelessServer();
  t.after(() => closeServer(server));

  for (const path of ["/", "/welcome", "/products"]) {
    const res = await fetch(`${baseUrl}${path}`);
    // Asserted FIRST and deliberately: a 500 body contains neither string, so without this the two
    // `doesNotMatch` assertions below pass while the route is completely broken. This test was
    // observed green against exactly that state before the fix.
    assert.equal(res.status, 200, `${path} must actually render before its markup can be judged`);
    const html = await res.text();
    assert.doesNotMatch(html, /data-theme=/, `${path} must not emit data-theme`);
    assert.doesNotMatch(html, /theme-badge/, `${path} must not emit the theme badge`);
  }
});

test("turning the theme off does NOT disable the no-themes 500 — an empty install is still an error", async (t) => {
  // The load-bearing negative. If the sentinel had been implemented by simply making a null theme
  // render unstyled, this would 200 and the genuinely-broken-site signal would be gone for good.
  const { server, baseUrl } = await startServer({ themes: [] });
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("a slug with no post still 404s with the theme off — the themeless path is not a catch-all 200", async (t) => {
  const { server, baseUrl } = await startThemelessServer();
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/definitely-not-a-real-slug`);
  assert.equal(res.status, 404);
});
