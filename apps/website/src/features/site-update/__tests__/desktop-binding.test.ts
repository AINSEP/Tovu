import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSiteUpdate, runSiteUpdate, type DesktopAppUpdaterPort, type SiteHealthPort } from "@jini-ai/devops/deploy";
import { bindSiteUpdateRuntime } from "#src/server/runtime/composition/site-deps/site-update-binding";

/** @file The desktop binding: the desktop main owns the app updater, so the site's runtime reaches it only through an injected hand-off port. */

const FEED = "https://api.github.com/repos/example-org/example-repo/releases/latest";
const ENV = { TOVU_UPDATE_HOST: "desktop", TOVU_UPDATE_FEED_URL: FEED };
const ids = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: null }).ports.ids;
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
  const required = (env: Record<string, string>) => ({ env, dbOps, ids, recordTargetTag: async () => undefined, getJson: async ({ url }: { url: string }) => { urls.push(url); return { tag_name: "v1.3.0", body: "n" }; } });
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

test("apply without the owner's approval for that version is refused before the app updater or backup is touched", async () => {
  const r = rig();
  const runtime = bindSiteUpdateRuntime(r.required(ENV), { desktop: r.desktop });
  assert.ok(runtime);
  const plan = { fromVersion: "1.2.0", toVersion: "1.3.0", notes: "n" };
  for (const approval of [undefined, { kind: "owner-approval" as const, approvedBy: "owner-1", toVersion: "1.4.0" }]) {
    const result = await runSiteUpdate({ ports: { site: runtime.site, backup: runtime.backup, readiness: runtime.readiness, ids: runtime.ids }, plan, approval });
    assert.equal(result.outcome, "refused");
  }
  assert.deepEqual(r.calls, []);
});

test("an approved apply backs up first, stages the approved version, then hands off; rollback restores the restore point", async () => {
  const r = rig();
  const runtime = bindSiteUpdateRuntime(r.required(ENV), { desktop: r.desktop });
  assert.ok(runtime);
  const plan = { fromVersion: "1.2.0", toVersion: "1.3.0", notes: "n" };
  await runSiteUpdate({ ports: { site: runtime.site, backup: runtime.backup, readiness: runtime.readiness, ids: runtime.ids }, plan, approval: { kind: "owner-approval", approvedBy: "owner-1", toVersion: "1.3.0" } });
  assert.deepEqual(r.calls.slice(0, 3), ["capture", "stage:1.3.0", "apply:1.3.0"]);
  await runtime.site.rollback({ to: "1.2.0", backupId: "rp-1" });
  assert.deepEqual(r.calls.slice(-2), ["rollback:1.2.0", "restore:rp-1"]);
});
