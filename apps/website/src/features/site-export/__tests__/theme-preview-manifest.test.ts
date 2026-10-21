/**
 * @file `buildPreviewExportManifest` without preview variants: a host with no settings store, or a
 * site whose preview switcher is off, exports exactly the ordinary route manifest as one theme.
 * The enabled multi-theme export is pinned in `theme/__tests__/preview-switcher.integration.test.ts`.
 */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
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
