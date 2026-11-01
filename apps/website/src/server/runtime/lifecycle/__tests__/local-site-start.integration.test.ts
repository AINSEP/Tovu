import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { buildAdmin, journeyAdminBundle } from "#src/platform/site-dir/local-admin-bundle";
import { runLocalSiteChild } from "#src/platform/site-dir/local-site-child";
import { createLocalSiteProcessPort } from "../local-site-process.js";

// Requires loopback listen permission. The coordinator runs this after rebuilding @jini-ai/platform.
test("a site with a progressing 150-second admin build becomes ready over real HTTP", async (t) => {
  let booted = false;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!); res.statusCode = booted ? 200 : 503; res.end("site");
  });
  t.after(() => server.listening ? new Promise<void>(resolve => server.close(() => resolve())) : undefined);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as { port: number }).port;
  const switcherBase = fs.mkdtempSync(path.join(os.tmpdir(), "site-start-http-"));
  t.after(() => fs.rmSync(switcherBase, { recursive: true, force: true }));
  const siteDir = path.join(switcherBase, "sites/slow-http");
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name: "slow-http" }));
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "slow-http", templateId: "blank",
    templateVersion: "1", schemaTag: "test", schemaVersion: 0, createdAt: "2026-10-31" }));
  const child = Object.assign(new EventEmitter(), { pid: 4242, stdout: new PassThrough(), stderr: new PassThrough() });
  t.after(() => { child.stdout.end(); child.stderr.end(); });
  let childEnv!: NodeJS.ProcessEnv;
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: ({ options }) => { childEnv = options.env!; return child as unknown as ChildProcess; } },
  });
  t.after(() => local.dispose!());
  const launched = await local.launch({ name: "slow-http", port, daemonPort: port });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const vite = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    kill: () => assert.fail("a progressing build must survive") });
  t.after(() => { vite.stdout.end(); vite.stderr.end(); });
  const sink = new PassThrough(); sink.resume();
  let spawned!: () => void;
  const building = new Promise<void>(resolve => { spawned = resolve; });
  const boot = runLocalSiteChild({}, {
    proc: { env: childEnv, pid: 4242, ppid: process.pid, execPath: process.execPath,
      cwd: () => switcherBase, kill() {}, exit() { assert.fail("unexpected exit"); } },
    timers: { setInterval: () => ({ unref() {} }), clearInterval() {} },
    reapOwnTree: async () => assert.fail("owner is alive"),
    importEntry: async () => { booted = true; },
    buildAdminBundle: required => journeyAdminBundle(required, { build: input => {
      const pending = buildAdmin(input, { spawnBuild: (() => vite) as unknown as typeof spawn, stdout: sink, stderr: sink });
      spawned(); return pending;
    } }),
  });
  await building;
  const ready = launched.ready();
  for (let elapsed = 0; elapsed < 150_000; elapsed += 30_000) { t.mock.timers.tick(30_000); vite.stdout.write("transforming\n"); }
  assert.deepEqual(requests, [], "bundle work must not spend HTTP readiness attempts");
  vite.emit("close", 0, null);
  await boot;
  t.mock.timers.tick(500);
  assert.equal(await ready, true);
  assert.deepEqual(requests, ["/readyz", "/admin/"]);
});
