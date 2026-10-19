import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminStatic } from "../../admin-static.js";
import { registerAdminDevProxyUpgrade } from "../../admin-dev-proxy.js";
import type { SeaApi } from "../../sea-runtime.js";

const sea = createRequire(import.meta.url)("node:sea") as SeaApi;

test("embedded admin assets win over dev proxy and fall back to the SPA for missing paths", async (t) => {
  t.mock.method(sea, "isSea", () => true);
  const previous = process.env.TOVU_ADMIN_DEV_PROXY_URL;
  process.env.TOVU_ADMIN_DEV_PROXY_URL = "http://127.0.0.1:1";
  t.after(() => { if (previous === undefined) delete process.env.TOVU_ADMIN_DEV_PROXY_URL; else process.env.TOVU_ADMIN_DEV_PROXY_URL = previous; });
  const reads: string[] = [];
  const assets = new Map([
    ["admin/index.html", "<h1>Embedded admin</h1>"], ["admin/main.js", "export const admin = true;"],
    ["admin/custom.bin", "binary-content"],
  ]);
  t.mock.method(sea, "getAsset", (key: string) => {
    reads.push(key);
    const value = assets.get(key);
    if (value === undefined) throw new Error("missing asset");
    return Uint8Array.from(Buffer.from(value)).buffer;
  });
  const app = express();
  registerAdminStatic(app, { distDir: "/unused-in-sea" });
  const base = await startTestServer(app, t);
  for (const url of ["/admin", "/admin/", "/admin/settings/users"]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(await response.text(), "<h1>Embedded admin</h1>");
  }
  const js = await fetch(base + "/admin/main.js");
  assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(await js.text(), "export const admin = true;");
  const binary = await fetch(base + "/admin/custom.bin");
  assert.equal(binary.headers.get("content-type"), "application/octet-stream");
  assert.equal(await binary.text(), "binary-content");
  assert.ok(reads.includes("admin/settings/users"));
  let registrations = 0;
  registerAdminDevProxyUpgrade({ on() { registrations++; } });
  assert.equal(registrations, 0, "packaged builds never attach the dev upgrade proxy");
});

test("built admin serves real files and deep SPA paths serve index.html", async (t) => {
  t.mock.method(sea, "isSea", () => false);
  const previous = process.env.TOVU_ADMIN_DEV_PROXY_URL;
  delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  t.after(() => { if (previous !== undefined) process.env.TOVU_ADMIN_DEV_PROXY_URL = previous; });
  const dir = await mkdtemp(path.join(tmpdir(), "s01-admin-static-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "index.html"), "<h1>Built admin</h1>");
  await writeFile(path.join(dir, "main.js"), "console.log('built');");
  const app = express();
  registerAdminStatic(app, { distDir: dir });
  const base = await startTestServer(app, t);
  const asset = await fetch(base + "/admin/main.js");
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "console.log('built');");
  const deep = await fetch(base + "/admin/settings/users");
  assert.equal(deep.status, 200);
  assert.equal(await deep.text(), "<h1>Built admin</h1>");
});
