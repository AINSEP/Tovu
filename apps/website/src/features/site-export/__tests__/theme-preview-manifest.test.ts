/**
 * @file `buildPreviewExportManifest` without preview variants: a host with no settings store, or a
 * site whose preview switcher is off, exports exactly the ordinary route manifest as one theme.
 * The enabled multi-theme export is pinned in `theme/__tests__/preview-switcher.integration.test.ts`.
 */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { readPreviewSwitcher } from "#src/features/theme/preview-switcher";
import { buildRouteManifest } from "../route-manifest.js";
import { buildPreviewExportManifest } from "../theme-preview-manifest.js";

test("a host without a settings store exports the plain manifest as a single theme", async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  const { settingsRepo: _settingsRepo, ...withoutSettings } = deps;

  const { manifest, themeCount } = await buildPreviewExportManifest({ routeDeps: withoutSettings });

  assert.equal(themeCount, 1);
  assert.deepEqual(manifest.routes.map(route => route.path), (await buildRouteManifest(deps)).routes.map(route => route.path));
  assert.ok(!manifest.routes.some(route => route.path.startsWith("/_themes/")));
});

test("a site whose preview switcher is off exports no theme variants", async () => {
  const deps = createRouteDeps();
  const { manifest, themeCount } = await buildPreviewExportManifest({ routeDeps: deps });
  assert.equal(themeCount, 1);
  assert.ok(manifest.routes.length > 0);
  assert.ok(!manifest.routes.some(route => route.path.startsWith("/_themes/")));
});

test("an enabled switcher still exports only the active theme when previews are explicitly disabled", async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await deps.siteConsentReady;
  const themes: DiscoveredTheme[] = ["preview-one", "preview-two"].map(id => ({
    manifest: { id, name: id, version: "1.0.0", tier: "static", engine: 1, apiVersion: 2, templates: [] },
    dir: ".", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { index: "<h1>Preview</h1>", about: "<h1>About</h1>" }, partials: {}, css: "", source: "site", status: "valid", errors: [],
  }));
  deps.themes.splice(0, deps.themes.length, ...themes);
  const presentation = await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId });
  assert.ok(presentation);
  await deps.presentationRepo.save({ ...presentation, activeThemeId: "preview-one" });
  const principals = createSettingsPrincipalLookup({ repo: deps.principalRepo });
  await deps.set({
    deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, principals,
      authorize: async ({ permission }) => ({ allowed: permission === "theme.set", reason: "fixture" }) },
    input: { namespace: "core.theme", key: "previewSwitcher", scope: "workspace", workspaceId: deps.workspaceId,
      callerPrincipalId: "owner", value: { enabled: true, position: "top",
        themes: [{ themeId: "preview-one", label: "One" }, { themeId: "preview-two", label: "Two" }] } },
  });
  assert.equal((await readPreviewSwitcher({ ...deps, activeThemeId: "preview-one" })).enabled, true);
  const { manifest, themeCount } = await buildPreviewExportManifest({ routeDeps: deps }, { includeThemePreviews: false });
  assert.equal(themeCount, 1);
  assert.ok(!manifest.routes.some(route => route.path.startsWith("/_themes/")));
});
