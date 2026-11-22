import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test, { mock } from "node:test";
import { createLocalSiteSupervisor, type LocalSiteProcess } from "#src/platform/site-dir/local-site-supervisor";

const net = await import("@jini-ai/platform/net");
let retirementStatus = 204;
let retirementFailure: Error | undefined;
mock.module("@jini-ai/platform/net", { namedExports: { ...net, requestLoopbackHttp: async () => {
  if (retirementFailure) throw retirementFailure;
  return { status: retirementStatus };
} } });
const { createLocalSiteProcessPort } = await import("../local-site-process.js");

for (const outcome of ["ready", "exit", "supplied", "delayed-lock"] as const) {
  test(`site start keeps bundle preparation outside the HTTP readiness budget: ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const switcherBase = fs.mkdtempSync(path.join(os.tmpdir(), "site-start-"));
    t.after(() => fs.rmSync(switcherBase, { recursive: true, force: true }));
    const siteDir = path.join(switcherBase, "sites/slow");
    fs.mkdirSync(siteDir, { recursive: true });
    fs.writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name: "slow" }));
    fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: `slow-${outcome}`, templateId: "blank",
      templateVersion: "1", schemaTag: "test", schemaVersion: 0, createdAt: "2026-10-31" }));
    const child = Object.assign(new EventEmitter(), { pid: 4242, stdout: new PassThrough(), stderr: new PassThrough() });
    t.after(() => { child.stdout.end(); child.stderr.end(); });
    let runtimeDir = "";
    let probes = 0;
    const local = createLocalSiteProcessPort({ switcherBase }, {
      env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1",
        ...(outcome === "supplied" ? { TOVU_ADMIN_DIST: "/prebuilt/dist" } : {}) },
      processOptions: { spawn: ({ options }) => {
        runtimeDir = options.env!.TOVU_LOCAL_ADMIN_BUILD_ROOT!;
        return child as unknown as ChildProcess;
      } },
      probeHttp: async () => { probes++; return true; },
    });
    t.after(() => local.dispose!());
    const launched = await local.launch({ name: "slow", port: 3101, daemonPort: 3102 });
    assert.match(path.basename(runtimeDir), new RegExp(`^tovu-local-sites-${process.pid}-[A-Za-z0-9]{6}$`),
      "a runtime records its host owner before any child can use the bundle");
    const root = path.join(runtimeDir, "admin-build");
    fs.mkdirSync(root);
    if (outcome !== "delayed-lock") fs.writeFileSync(path.join(root, "build.lock"), "builder");
    let settled = false;
    const readiness = launched.ready().then(ready => { settled = true; return ready; });
    // Let real filesystem promises settle between fake timer ticks. No process or socket is opened.
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    if (outcome === "delayed-lock") {
      for (let elapsed = 0; elapsed < 5000; elapsed += 500) { t.mock.timers.tick(500); await flush(); }
      assert.equal(probes, 0, "ready() must wait when child startup has not created build.lock yet");
      assert.equal(settled, false);
      fs.writeFileSync(path.join(root, "build.lock"), "builder");
    }
    for (let elapsed = 0; elapsed < 150_000; elapsed += 500) { t.mock.timers.tick(500); await flush(); }
    if (outcome === "supplied") {
      assert.equal(await readiness, true);
      assert.equal(probes, 2);
      return;
    }
    assert.equal(settled, false, "an in-progress build must not return false and spend a readiness attempt");
    assert.equal(probes, 0);
    if (outcome !== "exit") fs.writeFileSync(path.join(root, "ready"), "ready");
    else child.emit("exit", 1, null);
    t.mock.timers.tick(500);
    assert.equal(await readiness, outcome !== "exit");
    assert.equal(probes, outcome !== "exit" ? 2 : 0);
  });
}

test("retirement cancellation records failures without masking the supervisor's original error", async (t) => {
  retirementStatus = 503;
  const switcherBase = fs.mkdtempSync(path.join(os.tmpdir(), "site-retirement-"));
  t.after(() => fs.rmSync(switcherBase, { recursive: true, force: true }));
  const siteDir = path.join(switcherBase, "sites/slow");
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name: "slow" }));
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "slow-retirement", templateId: "blank",
    templateVersion: "1", schemaTag: "test", schemaVersion: 0, createdAt: "2026-10-31" }));
  const child = Object.assign(new EventEmitter(), { pid: 4242, stdout: new PassThrough(), stderr: new PassThrough() });
  t.after(() => { child.stdout.end(); child.stderr.end(); });
  const local = createLocalSiteProcessPort({ switcherBase }, {
    env: { TOVU_SITES_HOME: path.join(switcherBase, "sites"), TOVU_DISABLE_DEV_TLS: "1" },
    processOptions: { spawn: () => child as unknown as ChildProcess },
  });
  t.after(() => local.dispose?.());
  let launched: LocalSiteProcess | undefined;
  const host = createLocalSiteSupervisor({ servingName: "root", scheme: "http", processPort: {
    ...local, isPortFree: async () => true, schedule: () => () => {},
    launch: async (input) => {
      launched = await local.launch(input);
      return { ...launched, tryRetire: async () => true, terminate: async () => { throw new Error("child survived"); } };
    },
  } }, { maxConcurrent: 1, evictIdle: true });
  await host.start({ name: "slow" });
  await assert.rejects(host.start({ name: "other" }), { code: "SITE_STOP_FAILED" });
  const log = path.join(siteDir, "ops/logs/local-site.log");
  assert.match(fs.readFileSync(log, "utf8"), /Could not cancel site retirement: HTTP 503/);
  assert.ok(launched?.cancelRetirement);
  retirementFailure = new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET");
  await launched.cancelRetirement();
  const diagnostic = fs.readFileSync(log, "utf8");
  assert.match(diagnostic, /Could not cancel site retirement:.*boom/);
  assert.match(diagnostic, /local-site-start\.unit\.test\.ts/);
  assert.doesNotMatch(diagnostic, /SECRETSECRETSECRETSECRET/);
  retirementFailure = undefined;
  retirementStatus = 204;
  await launched.cancelRetirement();
});
