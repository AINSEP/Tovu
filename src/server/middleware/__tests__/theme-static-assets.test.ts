import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

import { registerThemeStaticAssets } from "../theme-static-assets.js";
import { createApp } from "../../app.js";

/**
 * @file Regression coverage for `registerThemeStaticAssets`'s 2026-08-12 extension from a single
 * `static`-tier root to a multi-root `themeRoots` list (added so `templated`-tier themes' own
 * images/screenshots become servable at `/theme-assets/{id}/...` — see that file's own header for
 * why). Two halves:
 *
 *   1. Fixture-based unit tests against throwaway temp directories (fast, no dependency on which
 *      real themes happen to exist on disk) — multi-root precedence, the `__`-prefix catalog
 *      refusal, path-traversal refusal, 404 fallthrough, and the `.liquid`-source-is-not-HTML
 *      content-type claim this change's own doc comment makes.
 *   2. A real end-to-end check through `createApp()` (the actual composition root, not a stand-in)
 *      confirming an existing `static`-tier theme's real asset serves byte-for-byte identically to
 *      before this change — the "prove the static tier isn't regressed" requirement — alongside the
 *      new `templated`-tier theme's own assets now resolving instead of 404ing.
 */

function withTempApp(fn: (baseUrl: string) => Promise<void>, roots: readonly string[]): Promise<void> {
  const app = express();
  registerThemeStaticAssets(app, { themeRoots: roots });
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, async () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("expected a real listening address"));
        return;
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        await fn(baseUrl);
        resolve();
      } catch (err) {
        reject(err as Error);
      } finally {
        server.close();
      }
    });
  });
}

/** Builds `<tmp>/<rootName>/<themeId>/<relPath>` = `content`, returning the root's absolute path. */
function makeThemeFixture(rootName: string, files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), `theme-assets-${rootName}-`));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("registerThemeStaticAssets: serves a file from the first root that has it", async (t) => {
  const rootA = makeThemeFixture("a", { "theme-one/styles.css": "body{color:red}" });
  const rootB = makeThemeFixture("b", { "theme-two/styles.css": "body{color:blue}" });
  t.after(() => {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  await withTempApp(async (baseUrl) => {
    const resA = await fetch(`${baseUrl}/theme-assets/theme-one/styles.css`);
    assert.equal(resA.status, 200);
    assert.equal(await resA.text(), "body{color:red}");

    const resB = await fetch(`${baseUrl}/theme-assets/theme-two/styles.css`);
    assert.equal(resB.status, 200);
    assert.equal(await resB.text(), "body{color:blue}");
  }, [rootA, rootB]);
});

test("registerThemeStaticAssets: a theme id present under both roots resolves to the FIRST root (documented tie-break)", async (t) => {
  const rootA = makeThemeFixture("first", { "same-id/marker.txt": "from-first-root" });
  const rootB = makeThemeFixture("second", { "same-id/marker.txt": "from-second-root" });
  t.after(() => {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  await withTempApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/theme-assets/same-id/marker.txt`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "from-first-root", "first-listed root must win the collision");
  }, [rootA, rootB]);
});

test("registerThemeStaticAssets: __-prefixed catalog ids are refused across every root, not just the first", async (t) => {
  const rootA = makeThemeFixture("catalog-a", { "__original-themes__/leak.txt": "should never serve" });
  const rootB = makeThemeFixture("catalog-b", {});
  t.after(() => {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  await withTempApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/theme-assets/__original-themes__/leak.txt`);
    assert.equal(res.status, 404);
  }, [rootA, rootB]);
});

test("registerThemeStaticAssets: path traversal in the themeId segment cannot escape either root", async (t) => {
  const rootA = makeThemeFixture("trav-a", { "real-theme/ok.txt": "fine" });
  t.after(() => rmSync(rootA, { recursive: true, force: true }));

  await withTempApp(async (baseUrl) => {
    // Encoded so Express's router treats it as one :themeId segment rather than splitting the path.
    const res = await fetch(`${baseUrl}/theme-assets/${encodeURIComponent("../../../../etc")}/passwd`);
    assert.ok(res.status === 404 || res.status === 400, `expected refusal, got ${res.status}`);
  }, [rootA]);
});

test("registerThemeStaticAssets: an id absent from every root 404s (no crash, clean fallthrough)", async (t) => {
  const rootA = makeThemeFixture("empty-a", {});
  t.after(() => rmSync(rootA, { recursive: true, force: true }));

  await withTempApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/theme-assets/does-not-exist/anything.css`);
    assert.equal(res.status, 404);
  }, [rootA]);
});

test("registerThemeStaticAssets: a .liquid template source file serves, but NOT as an HTML/script-executable content-type", async (t) => {
  const rootA = makeThemeFixture("liquid-a", {
    "my-theme/templates/product.liquid": "<h1>{{ product.title }}</h1>",
  });
  t.after(() => rmSync(rootA, { recursive: true, force: true }));

  await withTempApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/theme-assets/my-theme/templates/product.liquid`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get("content-type") ?? "";
    assert.ok(
      !contentType.includes("text/html") && !contentType.includes("javascript") && !contentType.includes("svg"),
      `expected a non-executable content-type for .liquid, got "${contentType}"`
    );
    assert.equal(await res.text(), "<h1>{{ product.title }}</h1>");
  }, [rootA]);
});

// ---------------------------------------------------------------------------
// Real end-to-end check through the actual composition root (createApp()) —
// proves the static tier is unregressed and the templated tier now works.
// ---------------------------------------------------------------------------

test("createApp(): the real 'basic' static theme's real css/styles.css still serves byte-for-byte identically (static tier not regressed)", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a real listening address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const onDisk = readFileSync(path.resolve(__dirname, "../../../themes/static/basic/css/styles.css"), "utf8");
  const res = await fetch(`${baseUrl}/theme-assets/basic/css/styles.css`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), onDisk);
});

test("createApp(): the new 'fashion-modern' templated theme's own assets now resolve (the gap this change closes)", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a real listening address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const stylesOnDisk = readFileSync(
    path.resolve(__dirname, "../../../themes/templated/fashion-modern/styles.css"),
    "utf8"
  );
  const stylesRes = await fetch(`${baseUrl}/theme-assets/fashion-modern/styles.css`);
  assert.equal(stylesRes.status, 200);
  assert.equal(await stylesRes.text(), stylesOnDisk);

  const screenshotRes = await fetch(`${baseUrl}/theme-assets/fashion-modern/screenshots/index.jpg`);
  assert.equal(screenshotRes.status, 200);
  assert.equal(screenshotRes.headers.get("content-type"), "image/jpeg");
});

test("createApp(): all 7 static themes' real screenshot files still serve byte-for-byte identically (the literal 'all 7 static themes' claim, not just 'basic')", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a real listening address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // One entry per theme under src/themes/static/ as of this change; each theme ships exactly one of
  // the two extensions (see Themes.tsx's own jpg-then-png fallback doc for why both exist).
  const staticThemeScreenshots: Array<{ id: string; file: string }> = [
    { id: "basic", file: "index.png" },
    { id: "fuel", file: "index.jpg" },
    { id: "gracious-timing", file: "index.png" },
    { id: "portfolite", file: "index.png" },
    { id: "tailark-dusk", file: "index.png" },
    { id: "tailark-quartz-dark", file: "index.jpg" },
    { id: "tailark-quartz-libre", file: "index.png" },
  ];

  for (const { id, file } of staticThemeScreenshots) {
    const onDiskPath = path.resolve(__dirname, `../../../themes/static/${id}/screenshots/${file}`);
    const onDisk = readFileSync(onDiskPath);
    const res = await fetch(`${baseUrl}/theme-assets/${id}/screenshots/${file}`);
    assert.equal(res.status, 200, `${id}/screenshots/${file} should still 200`);
    const served = Buffer.from(await res.arrayBuffer());
    assert.ok(served.equals(onDisk), `${id}/screenshots/${file} bytes must match the on-disk file exactly`);
  }
});

test("createApp(): 'storefront' (an existing templated theme with no assets on disk) still 404s cleanly rather than crashing now that the templated root is mounted", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a real listening address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const res = await fetch(`${baseUrl}/theme-assets/storefront/screenshots/index.jpg`);
  assert.equal(res.status, 404);
});
