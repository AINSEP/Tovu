/**
 * @file P11 ST-12b: the share expiry pass. Only a row with an explicit, valid, past `expiresAt` hosted in
 * this server's own share folder expires: a create-only tombstone first (both downloads refuse it), then
 * the ZIP. Revoked rows only get their local ZIP retried. Everything else, and every metadata, token and
 * tombstone file, stays. Real files in a temp folder; fs, clock, lock and error reporting are injected.
 */
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { SiteShareRegistry, type SiteShareRecord } from "../share-registry.js";
import { newShareIdentity } from "@jini-ai/devops/backup/site/share-registry";
import { acknowledgeSiteShare, receiveSiteShareArtifact, revokeSiteShare } from "../share-service.js";
import { createShareMutex, createShareRetention, type ShareRetentionFs } from "../share-retention.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-25T12:00:00.000Z");
const PAST = new Date(NOW - DAY).toISOString();
const FUTURE = new Date(NOW + DAY).toISOString();
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const site = "site-a";

async function registryAt(t: TestContext): Promise<SiteShareRegistry> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-retention-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory, now: () => NOW });
}

type Seed = { expiresAt?: string; storage?: SiteShareRecord["storage"] | null; failed?: boolean; warned?: boolean; archive?: Buffer };
async function seed(registry: SiteShareRegistry, options: Seed = {}): Promise<SiteShareRecord> {
  const { token } = newShareIdentity({});
  const storage = options.storage === null ? undefined : options.storage ?? { provider: "tovu-server", key: `_share/${token}/s.tovu.zip`, binding: registry.directory };
  const warnings = options.warned ? [{ kind: "api-key", path: "x" } as never] : undefined;
  const row = await receiveSiteShareArtifact({ registry, site, token, file: "s.tovu.zip", archive: options.archive ?? ZIP }, { storage, expiresAt: options.expiresAt, credentialWarnings: warnings });
  if (options.failed) await registry.put({ record: { ...row, status: "failed" } });
  return row;
}

const present = async (file: string) => stat(file).then(() => true, () => false);
const zipOf = (registry: SiteShareRegistry, row: SiteShareRecord) => registry.artifactPath({ shareId: row.shareId });

function retention(registry: SiteShareRegistry, overrides: { fs?: ShareRetentionFs; errors?: Error[] } = {}) {
  const errors = overrides.errors ?? [];
  return createShareRetention({
    registry, shareMutex: createShareMutex({}), fs: overrides.fs ?? { stat, unlink }, clock: { now: () => NOW },
    reportError: ({ error }) => { errors.push(error); }, signal: new AbortController().signal,
  });
}

test("active link without expiry untouched", async (t) => {
  const registry = await registryAt(t);
  const never = await seed(registry);
  const future = await seed(registry, { expiresAt: FUTURE });
  const peer = await seed(registry, { storage: null });
  const failed = await seed(registry, { expiresAt: PAST, failed: true });
  const remote = await seed(registry, { storage: { provider: "s3", key: "k", binding: "bucket" } });
  const due = await seed(registry, { expiresAt: PAST });
  const result = await retention(registry).sweep({ now: NOW });
  assert.deepEqual(result, { removed: 1, freedBytes: ZIP.length });
  for (const row of [never, future, peer, failed, remote]) {
    assert.equal(await present(zipOf(registry, row)), true, `${row.shareId} keeps its ZIP`);
    assert.notEqual((await registry.get({ shareId: row.shareId }))?.status, "expired");
  }
  assert.equal((await registry.get({ shareId: never.shareId }))?.status, "active");
  assert.equal((await registry.get({ shareId: failed.shareId }))?.status, "failed");
  assert.equal((await registry.get({ shareId: due.shareId }))?.status, "expired");
  assert.equal(await present(zipOf(registry, due)), false);
});

test("an unparseable expiry stops serving but is no proof to remove the ZIP", async (t) => {
  const registry = await registryAt(t);
  const damaged = await seed(registry);
  await registry.put({ record: { ...damaged, expiresAt: "not a date" } });
  assert.deepEqual(await retention(registry).sweep({ now: NOW }), { removed: 0, freedBytes: 0 });
  assert.equal(await present(zipOf(registry, damaged)), true);
  assert.equal((await registry.get({ shareId: damaged.shareId }))?.status, "active");
});

test("interrupted expiry retried", async (t) => {
  const registry = await registryAt(t);
  const row = await seed(registry, { expiresAt: PAST });
  const seenAtUnlink: (string | undefined)[] = [];
  let busy = true;
  const fs: ShareRetentionFs = { stat, unlink: async (file) => {
    seenAtUnlink.push((await registry.get({ shareId: row.shareId }))?.status);
    if (busy) throw Object.assign(new Error("busy"), { code: "EBUSY" });
    await unlink(file);
  } };
  const errors: Error[] = [];
  assert.deepEqual(await retention(registry, { fs, errors }).measure(), { bytes: ZIP.length, items: 1 });
  assert.deepEqual(await retention(registry, { fs, errors }).sweep({ now: NOW }), { removed: 0, freedBytes: 0 });
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "expired");
  assert.equal(await present(zipOf(registry, row)), true, "a busy file is kept for the next pass");
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null, "the public link already refuses it");
  busy = false;
  assert.deepEqual(await retention(registry, { fs, errors }).sweep({ now: NOW }), { removed: 1, freedBytes: ZIP.length });
  assert.equal(await present(zipOf(registry, row)), false);
  assert.deepEqual(seenAtUnlink, ["expired", "expired"], "the tombstone is durable before every unlink");
  assert.deepEqual(errors, []);
});

test("an unexpected unlink error is reported and the pass continues", async (t) => {
  const registry = await registryAt(t);
  const first = await seed(registry, { expiresAt: PAST });
  const second = await seed(registry, { expiresAt: PAST });
  const fs: ShareRetentionFs = { stat, unlink: async (file) => { if (file === zipOf(registry, first)) throw Object.assign(new Error("io"), { code: "EIO" }); await unlink(file); } };
  const errors: Error[] = [];
  assert.deepEqual(await retention(registry, { fs, errors }).sweep({ now: NOW }), { removed: 1, freedBytes: ZIP.length });
  assert.equal(errors.length, 1);
  assert.equal(await present(zipOf(registry, second)), false);
  assert.equal((await registry.get({ shareId: first.shareId }))?.status, "expired");
});

test("a revoked ZIP left behind is retried, its remote copy is not touched", async (t) => {
  const registry = await registryAt(t);
  const row = await seed(registry, { storage: { provider: "s3", key: "k", binding: "bucket" } });
  await registry.disable({ shareId: row.shareId, site });
  assert.deepEqual(await retention(registry).sweep({ now: NOW }), { removed: 1, freedBytes: ZIP.length });
  assert.equal(await present(zipOf(registry, row)), false);
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "revoked");
});

test("token stays reserved", async (t) => {
  const registry = await registryAt(t);
  const row = await seed(registry, { expiresAt: PAST });
  await retention(registry).sweep({ now: NOW });
  const names = await readdir(registry.directory);
  assert.ok(names.includes(`${row.token}.token`) && names.includes(`${row.shareId}.json`) && names.includes(`${row.shareId}.expired`));
  await assert.rejects(registry.reserveToken({ token: row.token, shareId: newShareIdentity({}).shareId }), (error: unknown) => error instanceof SiteShareRefusal && error.code === "TOKEN_EXISTS");
  await retention(registry).sweep({ now: NOW });
  assert.ok((await readdir(registry.directory)).includes(`${row.shareId}.expired`), "a later pass never removes the tombstone");
});

test("acknowledge after expiry keeps it expired", async (t) => {
  const registry = await registryAt(t);
  const row = await seed(registry, { expiresAt: PAST, warned: true });
  const stale = await registry.get({ shareId: row.shareId });
  await retention(registry).sweep({ now: NOW });
  await registry.put({ record: { ...stale!, needsAcknowledgement: false, credentialWarnings: [] } });
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "expired", "a racing whole-record put cannot resurrect");
  await assert.rejects(acknowledgeSiteShare({ registry, site, shareId: row.shareId }), (error: unknown) => error instanceof SiteShareRefusal && /expired/.test(error.message));
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "expired");
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
  await revokeSiteShare({ registry, site, shareId: row.shareId });
  await registry.markExpired({ shareId: row.shareId, expiresAt: PAST });
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "revoked", "revoked > expired");
});

test("download admitted just before expiry completes", async (t) => {
  const registry = await registryAt(t);
  const archive = Buffer.alloc(4 * 1024 * 1024, 7);
  const row = await seed(registry, { expiresAt: new Date(NOW + 1).toISOString(), archive });
  assert.ok(await registry.findToken({ token: row.token, file: row.file }), "admitted while still active");
  const stream = createReadStream(zipOf(registry, row), { highWaterMark: 64 * 1024 });
  await new Promise(resolve => stream.once("open", resolve));
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => { stream.on("data", chunk => chunks.push(chunk as Buffer)); stream.once("end", resolve); stream.once("error", reject); });
  stream.pause();
  const later = createShareRetention({ registry, shareMutex: createShareMutex({}), fs: { stat, unlink }, clock: { now: () => NOW + 1 }, reportError: () => {}, signal: new AbortController().signal });
  assert.deepEqual(await later.sweep({ now: NOW + 1 }), { removed: 1, freedBytes: archive.length });
  assert.equal(await present(zipOf(registry, row)), false);
  stream.resume();
  await done;
  assert.equal(Buffer.concat(chunks).equals(archive), true, "the in-flight download completes");
});

test("an aborted pass stops before the next row", async (t) => {
  const registry = await registryAt(t);
  await seed(registry, { expiresAt: PAST });
  const controller = new AbortController();
  controller.abort();
  const policy = createShareRetention({ registry, shareMutex: createShareMutex({}), fs: { stat, unlink }, clock: { now: () => NOW }, reportError: () => {}, signal: controller.signal }, { limit: 50 });
  assert.equal(policy.id, "share-files");
  assert.equal(policy.kind, "old-copy");
  assert.deepEqual(await policy.sweep({ now: NOW }), { removed: 0, freedBytes: 0 });
});
