import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { startTestServer } from "../../../../__tests__/helpers/http-test-server.js";
import { registerSiteChatStatic } from "../site-chat-static.js";

/**
 * @file `registerSiteChatStatic` — the public site-chat bundle mount at `/site-chat`.
 *
 * Its three branches were reached by no test: every `createApp()` test runs without a built
 * `apps/site-chat/dist` and without `TOVU_SITE_CHAT_DEV_PROXY_URL`, so only the "register nothing"
 * branch ever ran, and nothing asserted even that. Pinned here:
 * - dev proxy set → a 302 to the proxy that keeps the sub-path AND the query string (the Vite dev
 *   server needs `?v=`/`?import` intact), and wins even when a built bundle exists;
 * - built bundle present → served from the dist dir;
 * - neither → nothing is mounted, so the request falls through (here: Express's own 404).
 */

const PROXY_ENV = "TOVU_SITE_CHAT_DEV_PROXY_URL";

function distDir(t: import("node:test").TestContext, withBundle: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-chat-dist-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (withBundle) {
    fs.writeFileSync(path.join(dir, "site-assistant.js"), "/* bundle body 7f3a */");
    fs.writeFileSync(path.join(dir, "site-assistant.css"), ".x{color:red}");
  }
  return dir;
}

function withProxyEnv(t: import("node:test").TestContext, value: string | undefined): void {
  const saved = process.env[PROXY_ENV];
  if (value === undefined) delete process.env[PROXY_ENV];
  else process.env[PROXY_ENV] = value;
  t.after(() => {
    if (saved === undefined) delete process.env[PROXY_ENV];
    else process.env[PROXY_ENV] = saved;
  });
}

async function boot(t: import("node:test").TestContext, dir: string): Promise<string> {
  const app = express();
  registerSiteChatStatic(app, { distDir: dir });
  return startTestServer(app, t);
}

test("dev proxy configured: /site-chat/* redirects 302 to the proxy, keeping the sub-path and the query string", async (t) => {
  withProxyEnv(t, "http://localhost:5174");
  const baseUrl = await boot(t, distDir(t, false));

  const res = await fetch(`${baseUrl}/site-chat/src/main.tsx?v=abc&import`, { redirect: "manual" });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "http://localhost:5174/src/main.tsx?v=abc&import");
});

test("dev proxy configured: the proxy wins even when a built bundle is present", async (t) => {
  withProxyEnv(t, "http://localhost:5174");
  const baseUrl = await boot(t, distDir(t, true));

  const res = await fetch(`${baseUrl}/site-chat/site-assistant.js`, { redirect: "manual" });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "http://localhost:5174/site-assistant.js");
});

test("built bundle present, no proxy: the dist dir is served at /site-chat", async (t) => {
  withProxyEnv(t, undefined);
  const baseUrl = await boot(t, distDir(t, true));

  const js = await fetch(`${baseUrl}/site-chat/site-assistant.js`);
  assert.equal(js.status, 200);
  assert.equal(await js.text(), "/* bundle body 7f3a */");
  assert.match(js.headers.get("content-type") ?? "", /javascript/);

  const css = await fetch(`${baseUrl}/site-chat/site-assistant.css`);
  assert.equal(css.status, 200);
  assert.equal(await css.text(), ".x{color:red}");
});

test("no bundle and no proxy: nothing is mounted, so /site-chat requests fall through to the next handler", async (t) => {
  withProxyEnv(t, undefined);
  const app = express();
  registerSiteChatStatic(app, { distDir: distDir(t, false) });
  app.use((_req, res) => res.status(404).send("fell through"));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/site-chat/site-assistant.js`, { redirect: "manual" });

  assert.equal(res.status, 404);
  assert.equal(await res.text(), "fell through");
});

test("a dist dir holding files but NOT site-assistant.js counts as unbuilt — its other files are not exposed", async (t) => {
  withProxyEnv(t, undefined);
  const dir = distDir(t, false);
  fs.writeFileSync(path.join(dir, "stray.txt"), "should not be served");
  const app = express();
  registerSiteChatStatic(app, { distDir: dir });
  app.use((_req, res) => res.status(404).send("fell through"));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/site-chat/stray.txt`);

  assert.equal(res.status, 404);
  assert.equal(await res.text(), "fell through");
});
