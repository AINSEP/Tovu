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
