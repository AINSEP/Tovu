import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as realFs from "node:fs/promises";
import { createFakeSiteUpdate } from "@jini-ai/devops/deploy";
import { createRestorePointBackup, createUpdateBackupRegistry } from "../restore-point-backup.js";
import { createCandidateReadiness, rehearsalUnavailable } from "../candidate-readiness.js";
import { buildSiteUpdateRegistrations } from "../tools.js";

/** @file The self-hosted binding: opt-in by environment, no default feed, check-only (no driver this wave), backups over restore points. */

// Every file write made by the binding module is observed, so a marker write without a supervisor cannot hide.
const fileWrites: string[] = [];
mock.module("node:fs/promises", { namedExports: { ...realFs, writeFile: async (file: unknown) => { fileWrites.push(String(file)); } } });
const { bindSiteUpdateRuntime, createHttpJsonGetter } = await import("#src/server/runtime/composition/site-deps/site-update-binding");

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
const base = (env: Record<string, string>, urls: string[] = []) => ({ env, dbOps: dbOpsFake(), ids, lock: { withLock: async <T>({ run }: { run: () => Promise<T> }) => run() }, getJson: async ({ url }: { url: string }) => { urls.push(url); return { tag_name: "v1.3.0", body: "n" }; } });

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

test("a check-only self-hosted installation never writes a target tag or restarts", async () => {
  const restarts: string[] = [];
  // An old caller still handing a restart port over: the check-only branch must neither keep nor call it.
  const runtime = bindSiteUpdateRuntime(base(ENV), { restart: async ({ tag }: { tag: string }) => { restarts.push(tag); } } as never);
  assert.ok(runtime);
  assert.equal("site" in runtime, false, "no apply ports are bound without a driver");
  const deps = (siteUpdateRuntime: typeof runtime) => ({ authorize: async () => undefined, readOwnerId: async () => "owner-1", runtime: siteUpdateRuntime });
  const registrations = buildSiteUpdateRegistrations(deps(runtime), { surfaceExchanges: {} } as never);
  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["site_update_check"]);
  const checked = await registrations[0]!.handler({ executionId: "e", principal: { id: "owner-1" }, run: { id: "r" }, input: {}, signal: new AbortController().signal } as never, {} as never) as { available: boolean; latest?: string };
  assert.equal(checked.available, true);
  assert.equal(checked.latest, "1.3.0");
  assert.deepEqual(fileWrites.filter((file) => file.includes("update-target-tag")), [], "boot and a check never write a target tag");
  assert.deepEqual(fileWrites, []);
  assert.deepEqual(restarts, []);
  assert.deepEqual(buildSiteUpdateRegistrations(deps(bindSiteUpdateRuntime(base({}))), {} as never), []);
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
  const registry = createUpdateBackupRegistry({ ids });
  const ports = createRestorePointBackup({ dbOps: dbOpsFake(calls, ARTIFACT), ...registry, ...createCandidateReadiness({ rehearseMigration: rehearsalUnavailable }) });
  const kept = await ports.backup.createBackup({ fromVersion: "1.2.0" });
  assert.notEqual(kept.backupId, ARTIFACT);
  assert.ok(!kept.backupId.includes("/") && !kept.backupId.includes("site-update-2026"), `backup id ${kept.backupId} must not reveal where the snapshot lives`);
  await ports.data.restore(kept);
  assert.equal(calls.at(-1), `restore:${ARTIFACT}`, "the opaque id still restores the exact snapshot");
});

test("the JSON getter throws on a non-2xx answer and parses a 2xx one", async () => {
  const client = (status: number) => ({ send: async () => ({ status, headers: {}, bodyText: "{\"a\":1}" }) });
  assert.deepEqual(await createHttpJsonGetter({ client: client(200) })({ url: FEED }), { a: 1 });
  await assert.rejects(() => createHttpJsonGetter({ client: client(404) })({ url: FEED }), /404/);
});
