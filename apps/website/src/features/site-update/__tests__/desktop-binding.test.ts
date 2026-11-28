import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSiteUpdate, type DesktopAppUpdaterPort, type SiteHealthPort } from "@jini-ai/devops/deploy";
import { bindSiteUpdateRuntime } from "#src/server/runtime/composition/site-deps/site-update-binding";
import { buildSiteUpdateRegistrations } from "../tools.js";

/** @file The desktop binding: the desktop main owns the app updater, so the site's runtime reaches it only through an injected hand-off port. */

const FEED = "https://api.github.com/repos/example-org/example-repo/releases/latest";
const ENV = { TOVU_UPDATE_HOST: "desktop", TOVU_UPDATE_FEED_URL: FEED };
const ids = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "n" } }).ports.ids;
const caps = { restorePoint: { costClass: "cheap", kind: "file-snapshot" } };

function rig() {
  const calls: string[] = [];
  const app: DesktopAppUpdaterPort = {
    currentVersion: async () => "1.2.0",
    stage: async ({ version }) => { calls.push(`stage:${version}`); },
    applyStaged: async ({ version }) => { calls.push(`apply:${version}`); },
    rollbackTo: async ({ version }) => { calls.push(`rollback:${version}`); },
  };
  const health: SiteHealthPort = { check: async () => ({ status: "healthy" }) };
  const dbOps = {
    getCapabilities: async () => caps,
    captureRestorePoint: async () => { calls.push("capture"); return { artifactRef: "rp-1", watermarkAtCapture: 1 }; },
    restoreFromArtifact: async ({ artifactRef }: { artifactRef: string }) => { calls.push(`restore:${artifactRef}`); return { restartRequired: true }; },
  } as never;
  const urls: string[] = [];
  const required = (env: Record<string, string>) => ({ env, dbOps, ids, lock: { withLock: async <T>({ run }: { run: () => Promise<T> }) => run() }, getJson: async ({ url }: { url: string }) => { urls.push(url); return { tag_name: "v1.3.0", body: "n" }; } });
  return { calls, urls, required, desktop: { app, health } };
}

test("desktop mode with a feed and the hand-off port builds a runtime on the app's own version and the configured feed only", async () => {
  const r = rig();
  const runtime = bindSiteUpdateRuntime(r.required(ENV), { desktop: r.desktop });
  assert.ok(runtime);
  assert.equal(await runtime.runningVersion(), "1.2.0");
  assert.deepEqual(await runtime.feed.latestRelease({}), { version: "1.3.0", notes: "n" });
  assert.deepEqual(r.urls, [FEED]);
});

test("desktop mode without a feed URL gives no runtime and tries no URL (M5: ignoring the absent feed makes this red)", () => {
  const r = rig();
  for (const feed of [undefined, "", "  "]) {
    const env = feed === undefined ? { TOVU_UPDATE_HOST: "desktop" } : { ...ENV, TOVU_UPDATE_FEED_URL: feed };
    assert.equal(bindSiteUpdateRuntime(r.required(env), { desktop: r.desktop }), null);
  }
  assert.deepEqual(r.urls, []);
});

test("desktop mode without the hand-off port, or a different host kind, gives no runtime", () => {
  const r = rig();
  assert.equal(bindSiteUpdateRuntime(r.required(ENV)), null);
  assert.equal(bindSiteUpdateRuntime(r.required({ ...ENV, TOVU_UPDATE_HOST: "" }), { desktop: r.desktop }), null);
  assert.equal(bindSiteUpdateRuntime(r.required({ ...ENV, TOVU_UPDATE_HOST: "self-hosted" }), { desktop: r.desktop }), null);
});

test("FIX 16: desktop is check-only: with no durable hand-off the bound runtime exposes no apply, before or without the owner's approval", () => {
  const r = rig();
  const runtime = bindSiteUpdateRuntime(r.required(ENV), { desktop: r.desktop });
  assert.ok(runtime);
  const ids = buildSiteUpdateRegistrations({ authorize: async () => {}, readOwnerId: async () => "owner-1", runtime }, {} as never).map((t) => t.descriptor.id);
  assert.deepEqual(ids, ["site_update_check"]);
  assert.deepEqual(r.calls, []);
});

test("FIX 16: desktop is check-only even with a rehearsal: no apply is exposed, so nothing is captured, staged or handed off", () => {
  const r = rig();
  const runtime = bindSiteUpdateRuntime(r.required(ENV), { desktop: r.desktop, rehearseMigration: async () => ({ status: "ok" }) });
  assert.ok(runtime);
  const ids = buildSiteUpdateRegistrations({ authorize: async () => {}, readOwnerId: async () => "owner-1", runtime }, {} as never).map((t) => t.descriptor.id);
  assert.deepEqual(ids, ["site_update_check"]);
  assert.deepEqual(r.calls, []);
});

test("the desktop site port stages, then installs the app with no site-data step of its own, and rolls back by restoring the backup", async () => {
  const r = rig();
  const runtime = bindSiteUpdateRuntime(r.required(ENV), { desktop: r.desktop });
  assert.ok(runtime && "site" in runtime && "backup" in runtime, "the desktop binding carries the site update and backup ports");
  const plan = { fromVersion: "1.2.0", toVersion: "1.3.0", notes: "n" };
  const { backupId } = await runtime.backup.createBackup({ fromVersion: "1.2.0" });
  assert.deepEqual(r.calls, ["capture"]);
  await runtime.site.applyUpdate({ plan, backupId });
  assert.deepEqual(r.calls, ["capture", "stage:1.3.0", "apply:1.3.0"], "the relaunched app migrates on its own boot, so apply restores nothing");
  await runtime.site.rollback({ to: "1.2.0", backupId });
  assert.deepEqual(r.calls, ["capture", "stage:1.3.0", "apply:1.3.0", "rollback:1.2.0", "restore:rp-1"]);
});
