import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { SiteBinding } from "@jini-ai/core/contracts/site/platform-site-dir";
import { createLocalSiteIntentStore } from "#src/platform/site-dir/local-site-intent";
import { localSiteSupervisorForHost, shutdownLocalSiteHosts, warmSiteServerForHost } from "../local-site-host.js";

/**
 * @file `warmSiteServerForHost`: the warm-dev URL resolver the serving host hands to its Sites
 * HTTP surface. The first tests take the paths that launch no child — the serving site's own URL
 * and an unknown site name, which the real supervisor refuses before any spawn. The last two launch
 * a REAL child through the production process port: warm dev runs a source child under the dev
 * launcher's watcher (`TOVU_DEV_TSX_CLI`), so pointing that variable at a tiny script makes the real
 * launcher spawn `node <script> watch … local-site-child.ts` — a short-lived child we control,
 * terminated for real by the supervisor. Dev TLS is pinned off so the scheme never depends on
 * whether this checkout has `.certs/`.
 */

const ENV_KEYS = ["TOVU_ENABLE_SITE_SWITCHER", "TOVU_DEV_WARM_SITES", "TOVU_DEV_WARM_CONTROL_URL", "TOVU_DISABLE_DEV_TLS", "PORT", "NODE_ENV", "TOVU_DEV_SUPERVISOR_PID",
  "TOVU_SITES_HOME", "TOVU_DEV_TSX_CLI", "TOVU_ADMIN_DIST", "TOVU_LOCAL_SITE_LIMIT"] as const;

function withEnv(t: test.TestContext, values: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, { TOVU_DISABLE_DEV_TLS: "1" }, values);
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
}

function binding(name: string): SiteBinding {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "warm-host-"));
  return { dir: path.join(root, "sites", name), name, dirOverridden: false, switcherCompatible: true } as SiteBinding;
}

test.afterEach(() => shutdownLocalSiteHosts({}));

test("warm site URLs are off unless warm dev sites are enabled on the serving host itself", t => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1" });
  assert.equal(warmSiteServerForHost({ binding: binding("off-a"), workspaceId: "ws" }), undefined);
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", TOVU_DEV_WARM_CONTROL_URL: "http://localhost:3000" });
  assert.equal(warmSiteServerForHost({ binding: binding("off-b"), workspaceId: "ws" }), undefined, "a warm child delegates to its host instead");
  withEnv(t, { TOVU_DEV_WARM_SITES: "1" });
  assert.equal(warmSiteServerForHost({ binding: binding("off-c"), workspaceId: "ws" }), undefined, "no supervisor without site management");
});

test("the serving site's own warm URL is this listener's admin, on PORT or 3000", async t => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", PORT: "3456" });
  const host = binding("serving-a");
  const resolve = warmSiteServerForHost({ binding: host, workspaceId: "ws" });
  assert.ok(resolve);
  assert.equal(await resolve({ name: "serving-a" }), "http://localhost:3456/admin/");
  delete process.env.PORT;
  assert.equal(await resolve({ name: "serving-a" }), "http://localhost:3000/admin/");
});

test("an unknown site name is refused by the supervisor without handing out a URL", async t => {
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", PORT: "3457" });
  const resolve = warmSiteServerForHost({ binding: binding("serving-b"), workspaceId: "ws" });
  assert.ok(resolve);
  await assert.rejects(resolve({ name: "no-such-site" }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "SITE_NOT_FOUND");
    return true;
  });
});

/** A sites home holding the serving site's slot and one launchable sibling `name`. */
function siteHome(t: test.TestContext, name: string): { root: string; host: SiteBinding; siteDir: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "warm-child-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "sites", name);
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name }));
  fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: name, templateId: "blank",
    templateVersion: "1", schemaTag: "test", schemaVersion: 0, createdAt: "2026-11-28" }));
  const host = { dir: path.join(root, "sites", "serving"), name: "serving", dirOverridden: false, switcherCompatible: true } as SiteBinding;
  return { root, host, siteDir };
}

/** Writes the child script: it records the warm control env it inherited, then serves or exits. */
function childScript(root: string, behaviour: "serve" | "crash"): string {
  const file = path.join(root, `child-${behaviour}.mjs`);
  fs.writeFileSync(file, [
    'import { writeFileSync } from "node:fs";',
    'import { createServer } from "node:http";',
    'import { join } from "node:path";',
    'writeFileSync(join(process.env.TOVU_SITE_DIR, "child-env.json"), JSON.stringify({',
    '  controlUrl: process.env.TOVU_DEV_WARM_CONTROL_URL, workspace: process.env.TOVU_DEV_WARM_CONTROL_WORKSPACE }));',
    behaviour === "serve"
      ? 'createServer((_req, res) => { res.statusCode = 200; res.end("ok"); }).listen(Number(process.env.PORT), "127.0.0.1");'
      : "process.exit(1);",
  ].join("\n"));
  return file;
}

function childEnv(siteDir: string): { controlUrl?: string; workspace?: string } {
  return JSON.parse(fs.readFileSync(path.join(siteDir, "child-env.json"), "utf8"));
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test("a sibling that answers readiness gets its own admin URL; the child inherits this host's control URL and workspace, the dev session records its port, and shutdown kills it", async t => {
  const { root, host, siteDir } = siteHome(t, "warm-run");
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", PORT: "3461", TOVU_SITES_HOME: path.join(root, "sites"),
    TOVU_DEV_TSX_CLI: childScript(root, "serve"), TOVU_ADMIN_DIST: path.join(root, "admin-dist"), TOVU_DEV_SUPERVISOR_PID: "dev-61" });
  const resolve = warmSiteServerForHost({ binding: host, workspaceId: "ws-61" });
  assert.ok(resolve);
  const url = await resolve({ name: "warm-run" });
  const supervisor = localSiteSupervisorForHost({ binding: host });
  assert.ok(supervisor);
  const state = supervisor.list().find(entry => entry.name === "warm-run");
  assert.equal(state?.status, "running");
  assert.equal(url, `http://localhost:${state.port}/admin/`);
  assert.deepEqual(childEnv(siteDir), { controlUrl: "http://localhost:3461", workspace: "ws-61" });
  const intent = createLocalSiteIntentStore({ servingSiteDir: host.dir }).read();
  assert.equal(intent?.session, "dev-61");
  assert.deepEqual(intent?.sites, { "warm-run": { port: state.port } });
  const pid = state.pid!;
  // Safety net only: a regression that skips termination must fail, not orphan a listening child.
  t.after(() => { if (isAlive(pid)) process.kill(pid, "SIGKILL"); });
  assert.equal(isAlive(pid), true);
  await shutdownLocalSiteHosts({});
  assert.equal(isAlive(pid), false, "host shutdown must terminate the real child");
});

test("a sibling whose child dies before readiness is stopped and refused as SITE_START_FAILED; the control URL defaults to port 3000", async t => {
  const { root, host, siteDir } = siteHome(t, "warm-crash");
  withEnv(t, { TOVU_ENABLE_SITE_SWITCHER: "1", TOVU_DEV_WARM_SITES: "1", TOVU_SITES_HOME: path.join(root, "sites"),
    TOVU_DEV_TSX_CLI: childScript(root, "crash"), TOVU_ADMIN_DIST: path.join(root, "admin-dist") });
  const resolve = warmSiteServerForHost({ binding: host, workspaceId: "ws-62" });
  assert.ok(resolve);
  await assert.rejects(resolve({ name: "warm-crash" }), { name: "LocalSiteError", code: "SITE_START_FAILED" });
  const supervisor = localSiteSupervisorForHost({ binding: host });
  assert.equal(supervisor?.list().find(entry => entry.name === "warm-crash")?.status, "stopped",
    "the failed request must stop the crashed entry, not leave it crashed");
  assert.deepEqual(childEnv(siteDir), { controlUrl: "http://localhost:3000", workspace: "ws-62" });
});
