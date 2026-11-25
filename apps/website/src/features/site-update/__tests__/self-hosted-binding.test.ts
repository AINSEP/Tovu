import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSiteUpdate } from "@jini-ai/devops/deploy";
import { bindSiteUpdateRuntime, createHttpJsonGetter } from "#src/server/runtime/composition/site-deps/site-update-binding";
import { createRestorePointBackup, createUpdateBackupRegistry } from "../restore-point-backup.js";
import { createCandidateReadiness, rehearsalUnavailable } from "../candidate-readiness.js";
import { createSelfHostedUpdateHost } from "../self-hosted-host.js";
import { buildSiteUpdateRegistrations } from "../tools.js";

/** @file The self-hosted binding: opt-in by environment, no default feed, apply only records + restarts, backups over restore points. */

const FEED = "https://api.github.com/repos/example-org/example-repo/releases/latest";
const ENV = { TOVU_UPDATE_HOST: "self-hosted", TOVU_UPDATE_FEED_URL: FEED, TOVU_IMAGE_TAG: "v1.2.0" };
const ids = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: null }).ports.ids;
const snapshotCaps = { restorePoint: { costClass: "cheap", kind: "file-snapshot" } };
function dbOpsFake(calls: string[] = [], artifactRef = "rp-1") {
  return {
    getCapabilities: async () => snapshotCaps,
    captureRestorePoint: async ({ scopeId }: { scopeId: string }) => { calls.push(`capture:${scopeId}`); return { artifactRef, watermarkAtCapture: 1 }; },
    restoreFromArtifact: async ({ artifactRef }: { artifactRef: string }) => { calls.push(`restore:${artifactRef}`); return { restartRequired: true }; },
  } as never;
}
const base = (env: Record<string, string>, urls: string[] = []) => ({ env, dbOps: dbOpsFake(), ids, lock: { withLock: async <T>({ run }: { run: () => Promise<T> }) => run() }, recordTargetTag: async () => undefined, getJson: async ({ url }: { url: string }) => { urls.push(url); return { tag_name: "v1.3.0", body: "n" }; } });

test("without a feed URL there is no runtime and no URL is tried (M2: a built-in default would make this red)", () => {
  const urls: string[] = [];
  for (const env of [{ ...ENV, TOVU_UPDATE_FEED_URL: "" }, { TOVU_UPDATE_HOST: "self-hosted", TOVU_IMAGE_TAG: "v1.2.0" }]) assert.equal(bindSiteUpdateRuntime(base(env, urls)), null);
  assert.deepEqual(urls, []);
});

test("not self-hosted, or no known version: no runtime", () => {
  assert.equal(bindSiteUpdateRuntime(base({ ...ENV, TOVU_UPDATE_HOST: "" })), null);
  const { TOVU_IMAGE_TAG: _tag, ...noVersion } = ENV;
  assert.equal(bindSiteUpdateRuntime(base(noVersion)), null);
});

test("opted in: version comes from the image tag and the feed reads only the configured URL", async () => {
  const urls: string[] = [];
  const runtime = bindSiteUpdateRuntime(base(ENV, urls));
  assert.ok(runtime);
  assert.equal(await runtime.runningVersion(), "1.2.0");
  assert.deepEqual(await runtime.feed.latestRelease({}), { version: "1.3.0", notes: "n" });
  assert.deepEqual(urls, [FEED]);
  assert.equal(bindSiteUpdateRuntime(base({ ...ENV, TOVU_VERSION: "9.9.9" }))?.runningVersion !== undefined, true);
});

test("the tools see a bound runtime and are absent without one", () => {
  const runtime = bindSiteUpdateRuntime(base(ENV));
  const deps = (siteUpdateRuntime: typeof runtime) => ({ authorize: async () => undefined, readOwnerId: async () => "owner-1", runtime: siteUpdateRuntime });
  assert.deepEqual(buildSiteUpdateRegistrations(deps(runtime), { surfaceExchanges: {} } as never).map((r) => r.descriptor.id).sort(), ["site_update_apply", "site_update_check"]);
  assert.deepEqual(buildSiteUpdateRegistrations(deps(bindSiteUpdateRuntime(base({}))), {} as never), []);
});

test("self-hosted apply records the target tag and, with no restart port, fails closed with instructions", async () => {
  const recorded: string[] = [];
  const host = createSelfHostedUpdateHost({ runningTag: "v1.2.0", recordTargetTag: async ({ tag }) => { recorded.push(tag); }, readHealth: async () => ({ ok: true, version: "1.3.0" }) });
  assert.equal(host.kind, "self-hosted");
  if (host.kind !== "self-hosted") return;
  await host.images.setTag({ tag: "v1.3.0" });
  assert.deepEqual(recorded, ["v1.3.0"]);
  await assert.rejects(() => host.images.redeploy({ tag: "v1.3.0" }), /restart the site on it/);
  const restarts: string[] = [];
  const restarting = createSelfHostedUpdateHost({ runningTag: "v1.2.0", recordTargetTag: async () => undefined, readHealth: async () => ({ ok: true }) }, { restart: async ({ tag }) => { restarts.push(tag); } });
  if (restarting.kind === "self-hosted") await restarting.images.redeploy({ tag: "v1.3.0" });
  assert.deepEqual(restarts, ["v1.3.0"]);
});

test("health is healthy only when passing and on the expected version", async () => {
  const check = async (health: { ok: boolean; version?: string }) => {
    const host = createSelfHostedUpdateHost({ runningTag: "t", recordTargetTag: async () => undefined, readHealth: async () => health });
    return host.kind === "self-hosted" ? host.health.check({ expectedVersion: "1.3.0" }) : null;
  };
  assert.deepEqual(await check({ ok: true, version: "1.3.0" }), { status: "healthy" });
  assert.equal((await check({ ok: true, version: "1.2.0" }))?.status, "unhealthy");
  assert.equal((await check({ ok: false, version: "1.3.0" }))?.status, "unhealthy");
});

test("backup is a restore point kept under an opaque id, rollback restores it, and snapshot capability alone is not readiness", async () => {
  const calls: string[] = [];
  const registry = createUpdateBackupRegistry({ ids: { newId: () => "u-1" } });
  const ports = createRestorePointBackup({ dbOps: dbOpsFake(calls), ...registry, ...createCandidateReadiness({ rehearseMigration: rehearsalUnavailable }) });
  const { backupId } = await ports.backup.createBackup({ fromVersion: "1.2.0" });
  await ports.data.restore({ backupId });
  assert.deepEqual(calls, ["capture:site-update", "restore:rp-1"]);
  assert.equal((await ports.readiness.check({ toVersion: "1.3.0" }, { backupId, fromVersion: "1.2.0" })).status, "blocked", "no rehearsal here: blocked");
  assert.equal((await ports.readiness.check({ toVersion: "1.3.0" })).status, "blocked", "no backup named: blocked");
  await assert.rejects(() => ports.data.restore({ backupId: "rp-1" }), /cannot be found/);
  const blocked = createRestorePointBackup({ dbOps: { ...(dbOpsFake() as object), getCapabilities: async () => ({ restorePoint: { costClass: "expensive", kind: "dump" } }) } as never, ...registry, checkCandidate: async () => ({ status: "ok" }) });
  assert.equal((await blocked.readiness.check({ toVersion: "1.3.0" }, { backupId, fromVersion: "1.2.0" })).status, "blocked");
});

test("an update backup id shown to the operator is not its artifact path", async () => {
  const ARTIFACT = "/srv/site/ops/restore-points/site-update-2026.db";
  const calls: string[] = [];
  const runtime = bindSiteUpdateRuntime({ ...base(ENV), dbOps: dbOpsFake(calls, ARTIFACT) });
  assert.ok(runtime);
  const { backupId } = await runtime.backup.createBackup({ fromVersion: "1.2.0" });
  assert.notEqual(backupId, ARTIFACT);
  assert.ok(!backupId.includes("/") && !backupId.includes("site-update-2026"), `backup id ${backupId} must not reveal where the snapshot lives`);
  const registry = createUpdateBackupRegistry({ ids });
  const ports = createRestorePointBackup({ dbOps: dbOpsFake(calls, ARTIFACT), ...registry, ...createCandidateReadiness({ rehearseMigration: rehearsalUnavailable }) });
  const kept = await ports.backup.createBackup({ fromVersion: "1.2.0" });
  assert.notEqual(kept.backupId, ARTIFACT);
  await ports.data.restore(kept);
  assert.equal(calls.at(-1), `restore:${ARTIFACT}`, "the opaque id still restores the exact snapshot");
});

test("the JSON getter throws on a non-2xx answer and parses a 2xx one", async () => {
  const client = (status: number) => ({ send: async () => ({ status, headers: {}, bodyText: "{\"a\":1}" }) });
  assert.deepEqual(await createHttpJsonGetter({ client: client(200) })({ url: FEED }), { a: 1 });
  await assert.rejects(() => createHttpJsonGetter({ client: client(404) })({ url: FEED }), /404/);
});
