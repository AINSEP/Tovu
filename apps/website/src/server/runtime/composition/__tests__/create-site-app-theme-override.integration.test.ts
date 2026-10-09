import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { bootSite } from "#src/server/__tests__/helpers/unrun-site-boot";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

import { resolveActiveThemeId } from "#src/features/presentation/index";
import { resolveActiveTheme, type DiscoveredTheme } from "#src/features/theme/index";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file `createSiteApp({ themeId })` in BOTH composition roots: the app it builds renders the site's
 * own pages through that theme instead of the active one, without activating it — what
 * `web_screenshot_page`'s `themeId` needs to see a theme copy before the owner approves it.
 *
 * The override is a construction-time option of that one app instance, never request input: the
 * serving app (`createApp(deps)` with no option) must ignore every query parameter and header a
 * visitor could send. The probe theme is a clone of the active one under a unique id, so the test
 * depends on no particular installed theme.
 */

const PROBE_ID = "render-override-probe";

/** Adds a renderable copy of the active theme under {@link PROBE_ID} (mutated in place, as discovery does). */
async function addProbeTheme(deps: NewsletterRouteDeps): Promise<void> {
  const active = resolveActiveTheme(deps, await resolveActiveThemeId(deps));
  assert.ok(active && active !== "none", "fixture: the composition renders some theme");
  const probe = { ...(active as DiscoveredTheme), manifest: { ...(active as DiscoveredTheme).manifest, id: PROBE_ID } };
  deps.themes.push(probe);
}

async function home(baseUrl: string, init: RequestInit = {}, query = ""): Promise<string> {
  const response = await fetch(`${baseUrl}/${query}`, init);
  assert.equal(response.status, 200);
  return response.text();
}

async function assertOverrideRenders(deps: NewsletterRouteDeps, t: TestContext): Promise<void> {
  await addProbeTheme(deps);
  const overridden = await home(await startTestServer(deps.createSiteApp({ themeId: PROBE_ID }), t));
  assert.match(overridden, new RegExp(PROBE_ID), "createSiteApp({ themeId }) renders through that theme");
  const plain = await home(await startTestServer(deps.createSiteApp(), t));
  assert.doesNotMatch(plain, new RegExp(PROBE_ID), "createSiteApp() still renders the active theme");
  assert.notEqual(await resolveActiveThemeId(deps), PROBE_ID, "the override never activates the theme");
}

test("in-memory root: createSiteApp({ themeId }) renders the site's pages through that theme without activating it", async (t) => {
  await assertOverrideRenders(createRouteDeps(), t);
});

test("SQLite root: createSiteApp({ themeId }) renders the site's pages through that theme without activating it", async (t) => {
  await assertOverrideRenders((await bootSite(t, "sqlite")).deps, t);
});

test("the serving app ignores every visitor-supplied way to name a theme", async (t) => {
  const deps = createRouteDeps();
  await addProbeTheme(deps);
  const baseUrl = await startTestServer(createApp(deps), t);
  const html = await home(baseUrl, { headers: { "x-theme-id": PROBE_ID, "x-tovu-theme": PROBE_ID, cookie: `themeId=${PROBE_ID}` } }, `?themeId=${PROBE_ID}&theme=${PROBE_ID}&themeIdOverride=${PROBE_ID}`);
  assert.doesNotMatch(html, new RegExp(PROBE_ID));
});
