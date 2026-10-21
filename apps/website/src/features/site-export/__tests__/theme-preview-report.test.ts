/** Owner dispatch 2026-10-20: report actual additional bytes, including theme assets. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ExportReport } from "@jini-ai/devops/static-export";
import { themePreviewExportSize } from "../theme-preview-report.js";

test("size multiplier counts normal HTML/CSS/shared media once and includes variant bytes", () => {
  for (const basePath of [undefined, "/repo"]) {
    const html = `<link href="${basePath ?? ""}/theme-assets/one/css/theme.css">`;
    const css = "body{background:url(/m/shared.jpg)}";
    const report: ExportReport = { outputDir: "/tmp/test", basePath, routes: { succeeded: [
      { path: "/", kind: "home", outputFile: "index.html", data: html, contentType: "text/html" },
      { path: "/_themes/two/", kind: "home", outputFile: "_themes/two/index.html", data: "preview", contentType: "text/html" },
    ], failed: [] }, assets: { succeeded: [
      { url: "/theme-assets/one/css/theme.css", outputFile: "theme-assets/one/css/theme.css", data: Buffer.from(css), contentType: "text/css" },
      { url: "/theme-assets/two/css/theme.css", outputFile: "theme-assets/two/css/theme.css", data: Buffer.from("blue"), contentType: "text/css" },
      { url: "/m/shared.jpg", outputFile: "m/shared.jpg", data: Buffer.from("shared"), contentType: "image/jpeg" },
    ], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
    const result = themePreviewExportSize({ report, themeCount: 2 });
    const baseline = Buffer.byteLength(html + css + "shared");
    assert.equal(result.sizeMultiplier, (baseline + Buffer.byteLength("previewblue")) / baseline);
    assert.equal(result.htmlSizeMultiplier, (Buffer.byteLength(html) + 7) / Buffer.byteLength(html));
    assert.equal(result.additionalPages, 1);
  }
});

test("an export with no main HTML reports neutral multipliers instead of dividing by zero", () => {
  const empty: ExportReport = { outputDir: "/tmp/test", routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] },
    skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
  assert.deepEqual(themePreviewExportSize({ report: empty, themeCount: 1 }), { themeCount: 1, additionalPages: 0, htmlSizeMultiplier: 1, sizeMultiplier: 1 });
});

test("routes and assets without a content type are counted as bytes but never parsed as HTML or CSS", () => {
  const report: ExportReport = { outputDir: "/tmp/test", routes: { succeeded: [
    { path: "/feed", kind: "home", outputFile: "feed", data: "<link href=\"/theme-assets/x.css\">" },
  ], failed: [] }, assets: { succeeded: [
    { url: "/theme-assets/x.css", outputFile: "theme-assets/x.css", data: Buffer.from("body{background:url(/m/never.jpg)}") },
    { url: "/m/never.jpg", outputFile: "m/never.jpg", data: Buffer.from("img"), contentType: "image/jpeg" },
  ], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
  const result = themePreviewExportSize({ report, themeCount: 1 });
  assert.equal(result.htmlSizeMultiplier, 1, "a route without text/html is not main HTML");
  const main = Buffer.byteLength("<link href=\"/theme-assets/x.css\">") + Buffer.byteLength("body{background:url(/m/never.jpg)}");
  assert.equal(result.sizeMultiplier, (main + 3) / main, "an untyped stylesheet's urls are not followed");
});
