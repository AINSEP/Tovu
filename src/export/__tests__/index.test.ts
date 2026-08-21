import assert from "node:assert/strict";
import test from "node:test";

import { buildRouteManifest, createRouteManifestReader, ExportOutputNotEmptyError, exportSite, firstExportFailure } from "../index.js";
import { buildRouteManifest as directBuildRouteManifest, createRouteManifestReader as directCreateRouteManifestReader } from "../route-manifest.js";
import {
  ExportOutputNotEmptyError as DirectExportOutputNotEmptyError,
  exportSite as directExportSite,
  firstExportFailure as directFirstExportFailure,
} from "../site-exporter.js";

/**
 * @file `index.ts` is this module's public barrel ("mirroring `src/redirects`/`src/seo`'s own
 * barrel shape" — the barrel's own file header), but nothing inside this repo imports through it:
 * every real caller (route tests, `cli/commands/export.ts`, etc.) reaches `route-manifest.js`/
 * `site-exporter.js` directly, so the barrel's own re-export statements were never once imported by
 * any test either. Verifies the re-exports are the SAME function/class references as importing the
 * concrete modules directly (a live binding, not a duplicate/shadow declaration) — the one way a
 * barrel like this can actually break (a stale path, a renamed export never updated here) without
 * anything else in the suite noticing.
 */

test("index.ts re-exports the same function/class references as route-manifest.ts and site-exporter.ts, not copies", () => {
  assert.equal(buildRouteManifest, directBuildRouteManifest);
  assert.equal(createRouteManifestReader, directCreateRouteManifestReader);
  assert.equal(exportSite, directExportSite);
  assert.equal(firstExportFailure, directFirstExportFailure);
  assert.equal(ExportOutputNotEmptyError, DirectExportOutputNotEmptyError);
});
