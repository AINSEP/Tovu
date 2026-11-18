import assert from "node:assert/strict";
import test from "node:test";

import type { ExportReport } from "#src/features/site-export/index";

import { previewCommitExport, type CommitSiteInput } from "../commit-site.js";
import type { StaticSitePackagerPort } from "../static-site-packager-port.js";

/**
 * @file `commit-site.ts` consumes the packager only through `StaticSitePackagerPort`. These drive
 * the preview path (it runs the same `exportForCommit` a real commit does, with no credential and
 * no provider call) against fakes of that interface, so each outcome of the port is pinned without
 * `source-control` importing `site-backup`.
 */

const EXPORT_REPORT: ExportReport = {
  outputDir: "/unused", routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] },
  skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [],
};

function inputWith(packager: StaticSitePackagerPort): CommitSiteInput {
  return {
    workspaceId: "ws" as CommitSiteInput["workspaceId"], sourceControlExportRootDir: "/tmp/tovu-packager-port-unused",
    staticSiteContext: async () => ({ name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" }),
    idGen: { newId: () => "run" }, exportSiteBound: async () => EXPORT_REPORT, packager,
    owner: "octo", repo: "demo", commitMessage: "x",
  };
}

test("preview reports exactly the files the packager returned, and hands it the resolved site identity", async () => {
  const seen: unknown[] = [];
  const result = await previewCommitExport(inputWith({
    entryFile: "index.html",
    packageSite: required => { seen.push(required.site); return { ok: true, files: [{ path: "b.txt", data: Buffer.alloc(2) }, { path: "a.txt", data: Buffer.alloc(3) }] }; },
  }), { validateTarget: () => null });
  assert.deepEqual(result, { ok: true, fileCount: 2, totalBytes: 5, paths: ["a.txt", "b.txt"] });
  assert.deepEqual(seen, [{ name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" }]);
});

test("a destination-collision result becomes EXPORT_FAILED with the packager's own message", async () => {
  const result = await previewCommitExport(inputWith({
    entryFile: "index.html", packageSite: () => ({ ok: false, kind: "destination-collision", message: "a collides with a/b" }),
  }), { validateTarget: () => null });
  assert.deepEqual(result, { ok: false, code: "EXPORT_FAILED", message: "Static site destination validation failed: a collides with a/b" });
});

test("a thrown packager failure becomes the generic EXPORT_FAILED text", async () => {
  const result = await previewCommitExport(inputWith({
    entryFile: "index.html", packageSite: () => { throw new Error("boom"); },
  }), { validateTarget: () => null });
  assert.deepEqual(result, { ok: false, code: "EXPORT_FAILED", message: "Static site packaging failed before committing could start." });
});
