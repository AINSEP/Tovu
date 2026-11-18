import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { ExportReport } from "../../site-export/index.js";
import { createStaticSitePackager } from "../static-site-packager.js";

/**
 * @file Pins what `source-control`'s commit path receives from the packager port: the same ordered
 * file list the backup download builds, the one refusal it can explain (a path collision), and that
 * every other failure is rethrown unchanged rather than folded into a result.
 */

const SITE = { name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" } as const;

function report(assets: readonly string[]): ExportReport {
  return {
    outputDir: "/unused",
    routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<html>home</html>" }], failed: [] },
    assets: { succeeded: assets.map(asset => ({ url: `/theme-assets/fixture/${asset}`, outputFile: path.join("theme-assets", "fixture", asset), data: Buffer.from("body {}") })), failed: [] },
    skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [],
  };
}

test("the entry file is the landing page the commit result and the dry run report", () => {
  assert.equal(createStaticSitePackager().entryFile, "index.html");
});

test("packages the export into the download layout, without a manifest, in a stable order", () => {
  const packager = createStaticSitePackager();
  const first = packager.packageSite({ report: report(["css/main.css"]), site: SITE });
  const second = packager.packageSite({ report: report(["css/main.css"]), site: SITE });
  if (!first.ok || !second.ok) assert.fail("a clean export must package");
  assert.deepEqual(first.files.map(file => file.path), ["sites/fixture/index.html", "sites/fixture/css/main.css", "index.html", "README.txt"]);
  assert.deepEqual(first.files, second.files);
});

test("two files claiming one destination path come back as a destination-collision result", () => {
  const result = createStaticSitePackager().packageSite({ report: report(["css/main.css", "styles/main.css/child.css"]), site: SITE });
  if (result.ok) assert.fail("a file/directory collision was accepted");
  assert.equal(result.kind, "destination-collision");
  assert.match(result.message, /collision/i);
});

test("a failure that is not a path collision is thrown, not returned as a result", () => {
  const broken = { outputDir: "/unused" } as unknown as ExportReport;
  assert.throws(() => createStaticSitePackager().packageSite({ report: broken, site: SITE }), TypeError);
});
