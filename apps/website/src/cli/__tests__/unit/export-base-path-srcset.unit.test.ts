import assert from "node:assert/strict";
import fs from "node:fs";
import { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { exportSite } from "#src/features/site-export/index";

// Exercise the real crawl/write/rewrite path without binding a listener. The response contains
// the shipped theme's retina-logo pattern plus relative, external and data-URL candidates.
for (const basePath of ["/my-repo", ""]) {
  test(`exportSite preserves and exports srcset candidates with base path '${basePath}'`, async (t) => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-export-srcset-"));
    t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
    const fallback = "/theme-assets/tovu-starter/assets/logo.png";
    const retina = "/theme-assets/tovu-starter/assets/logo@2x.png";
    const sourceSet = `${fallback} 1x, ${retina} 2x, relative.png 3x, //cdn.example.test/logo.png 4x, data:image/png;base64,/abc== 5x`;
    const html = `<!doctype html><html><head></head><body><img src="${fallback}" srcset="${sourceSet}"><source srcset='${retina} 640w, /my-repo/already.png 1280w'></body></html>`;
    const fetched: string[] = [];
    t.mock.method(Server.prototype, "listen", function (this: Server) {
      queueMicrotask(() => this.emit("listening"));
      return this;
    });
    t.mock.method(Server.prototype, "address", () => ({ address: "127.0.0.1", family: "IPv4", port: 12345 }));
    t.mock.method(Server.prototype, "close", function (this: Server, done: () => void) { done(); return this; });
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      fetched.push(url.pathname);
      if (url.pathname.startsWith("/theme-assets/")) return new Response("fixture-image-bytes", { headers: { "content-type": "image/png" } });
      return new Response(html, { status: url.pathname.includes("tovu-export-404-check") ? 404 : 200, headers: { "content-type": "text/html" } });
    });
    const deps = createRouteDeps();
    deps.createSiteApp = () => express().use((_req, res) => { res.end(); });
    const report = await exportSite({ routeDeps: deps, outputDir, basePath });
    assert.deepEqual(report.routes.failed, []);
    assert.deepEqual(report.assets.failed, []);
    const home = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
    const expected = `${basePath}${fallback} 1x, ${basePath}${retina} 2x, relative.png 3x, //cdn.example.test/logo.png 4x, data:image/png;base64,/abc== 5x`;
    assert.ok(home.includes(`srcset="${expected}"`), "root-relative srcset candidates must carry the base path without changing descriptors or external/data URLs");
    assert.ok(home.includes(`srcset='${basePath}${retina} 640w, /my-repo/already.png 1280w'`), "single-quoted candidates are rewritten without double-prefixing");
    assert.equal(fetched.filter(url => url === retina).length, 1, "the retina asset named only by srcset must be fetched exactly once");
    assert.equal(fs.readFileSync(path.join(outputDir, retina.slice(1)), "utf8"), "fixture-image-bytes");
    assert.equal(fetched.some(url => url.includes("relative.png") || url.includes("already.png") || url.includes("abc==")), false);
  });
}
