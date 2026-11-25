/**
 * Byte pin for the root `index.html` of every static download and repository commit, taken through the composed
 * host binding (`static-download-host.ts` -> Jini's portable layout). The template and its CSS (unprefixed `card`,
 * `badge`, `open`, ... classes) are this host's exported HTML and stay in `../static-download-landing.ts`; Jini's
 * layout only calls the injected renderer. If the layout ever rendered the page itself (or the classes were renamed
 * in place), these bytes would move and already-exported downloads would differ from new ones.
 *
 * Pin provenance: the sha256 below was taken from the merge-21 template
 * (`git show origin/integ/merge-21-2026-11-24:apps/website/src/features/site-backup/static-download-landing.ts`)
 * over this exact fixture, before the renderer became an injected port.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { ExportReport } from "@tovu/contracts/export-report";
import { prepareStaticReport, STATIC_DOWNLOAD_HOST, staticDownloadLayout } from "../static-download-host.js";
import { staticLandingPage } from "../static-download-landing.js";

const LEGACY_LANDING_SHA256 = "a94ee7003d9c0e25bd0ff4bda7dbca46958341678fec4cedc01c402fd316728d";

function fixtureReport(): ExportReport {
  const page = (title: string, body: string) => `<html><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
  return { outputDir: "/unused", routes: { succeeded: [
    { path: "/", kind: "home", outputFile: "index.html", data: page("Home | Studio &amp; Co", "Home") },
    { path: "/about/", kind: "page", outputFile: "about/index.html", data: page("About <Us> | Studio &amp; Co", "About") },
  ], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] } as unknown as ExportReport;
}

function exportedLanding(): Buffer {
  const prepared = prepareStaticReport({ report: fixtureReport() });
  const files = staticDownloadLayout({ copy: { files: prepared.files, themeId: "my-summer", siteSlug: "my-site" } });
  return files.find(file => file.path === "index.html")!.content;
}

test("the composed host renders the landing page with this host's template", () => {
  assert.equal(STATIC_DOWNLOAD_HOST.renderLanding, staticLandingPage);
});

test("the exported landing page keeps its legacy bytes through the composed host", () => {
  const landing = exportedLanding();
  assert.equal(createHash("sha256").update(landing).digest("hex"), LEGACY_LANDING_SHA256);
  assert.match(landing.toString(), /<article class="card active"><div class="card-head"><h2>summer<\/h2><span class="badge">Active theme<\/span>/);
});
