/** OPUS-REVIEW T1: declared assets only, inert SVG, byte-preserving PNG and admission per request. */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerPluginExportFilesRoute } from "../export-files.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { harness, owner } from "#src/features/agent-plugins/__tests__/fixtures/plugin-exports";
import type { TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";

const deps = { workspaceId: "ws-embeds", clock: { nowMs: () => 0 }, agentPluginLifecycle: {} as TovuAgentPluginLifecycle };
test("T1: serves declared PNG unchanged and CSS; denies template/traversal/disabled and limits before I/O", async t => {
  const app = express();
  let enabled = true;
  let reads = 0;
  const source = harness().source;
  registerPluginExportFilesRoute({ app, deps }, { source: { ...source,
    list: async () => [{ ...owner, enabled }], readAsset: async input => { reads += 1; return source.readAsset(input); } },
    limiter: createRateLimiter({ clock: deps.clock, profile: { max: 6, burst: 0, windowSeconds: 60 } }) });
  const origin = await startTestServer(app, t);
  const base = `${origin}/api/agent-plugin-exports/v1/demo/button/components/`;
  const png = await fetch(base + "mark.png");
  assert.equal(png.status, 200);
  assert.equal(png.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await png.arrayBuffer()), Buffer.from([137, 80, 78, 71, 255]));
  assert.equal((await fetch(base + "button.css")).status, 200);
  assert.equal((await fetch(base + "button.html")).status, 404);
  assert.equal((await fetch(base + "..%2F..%2Fplugin.json")).status, 404);
  enabled = false;
  assert.equal((await fetch(base + "mark.png")).status, 404);
  assert.equal((await fetch(base + "button.css")).status, 404);
  assert.equal((await fetch(base + "button.css")).status, 429);
  assert.equal(reads, 2);
});

test("T1: SVG navigation is sandboxed, nosniff and never serves undeclared files", async t => {
  const app = express();
  const source = harness().source;
  registerPluginExportFilesRoute({ app, deps }, { source: { ...source,
    list: async () => [{ ...owner, exports: { button: { ...owner.exports.button!, assets: { mark: "mark.svg" } } } }],
    readAsset: async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>' } });
  const origin = await startTestServer(app, t);
  const result = await fetch(`${origin}/api/agent-plugin-exports/v1/demo/button/mark.svg`);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.headers.get("content-security-policy")!, /sandbox/);
});

test("T1: a declared asset with a non-CSS/PNG/SVG extension is refused without a read", async t => {
  const app = express();
  let reads = 0;
  const source = harness().source;
  registerPluginExportFilesRoute({ app, deps }, { source: { ...source,
    list: async () => [{ ...owner, exports: { button: { ...owner.exports.button!, assets: { page: "page.html", code: "code.js" } } } }],
    readAsset: async input => { reads += 1; return source.readAsset(input); } } });
  const origin = await startTestServer(app, t);
  for (const name of ["page.html", "code.js"]) {
    assert.equal((await fetch(`${origin}/api/agent-plugin-exports/v1/demo/button/${name}`)).status, 404);
  }
  assert.equal(reads, 0);
});
