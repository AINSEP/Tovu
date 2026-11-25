/**
 * @file P11 ST-12a: a share link expires only when the owner chose an expiry at creation (default
 * Never). Expiry is the field's own stated meaning: past it, the public token lookup answers "no
 * share" (the route's 404). Nothing here deletes a ZIP, flips a status, or touches a row without the
 * field — that is ST-12b. Real files in a temp folder; the registry clock is injected.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { SHARE_EXPIRY_COPY, SHARE_EXPIRY_DAYS, isShareExpired, shareExpiresAt } from "../share-expiry.js";
import { SiteShareRegistry } from "../share-registry.js";
import { newShareIdentity } from "@jini-ai/devops/backup/site/share-registry";
import { createSiteShare, receiveSiteShareArtifact, type ShareDelivery } from "../share-service.js";
import { createSiteShareBackend } from "../share-backend.js";
import { createBundledExportFilePolicy } from "#src/features/site-backup/bundled-export-file-policy";
import { SELECTED_AGENT_PLUGIN_PACKAGES } from "#src/features/agent-plugins/bundled-catalog";

// The same bundled-file policy production composes (`site-deps/site-sharing.ts`).
const bundledFilePolicy = () => createBundledExportFilePolicy({ selection: SELECTED_AGENT_PLUGIN_PACKAGES });
import type { SiteSharePlanContent } from "../plan-content.js";

const DAY = 24 * 60 * 60 * 1000;
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const TEN_YEARS = 10 * 365 * DAY;
const CHOICES = "A share link can expire after 7, 30 or 90 days, or never.";
const copy = SHARE_EXPIRY_COPY;

async function registryAt(t: TestContext, clock: { now: number }): Promise<SiteShareRegistry> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-expiry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory, now: () => clock.now });
}

/** This server's own share folder: the shape `isOwnShareFolder` affirms (absolute catalog path). */
function ownFolder(registry: SiteShareRegistry): ShareDelivery {
  const store = { upload: async () => ({ url: "https://site.example/_share/x" }), verify: async () => true, delete: async () => {} };
  return { provider: "tovu-server", binding: registry.directory, store: store as unknown as ShareDelivery["store"] };
}

function remote(counter: { uploads: number }): ShareDelivery {
  const store = { upload: async () => { counter.uploads += 1; return { url: "https://x" }; }, verify: async () => true, delete: async () => {} };
  return { provider: "s3", store: store as unknown as ShareDelivery["store"] };
}

function planContent(): SiteSharePlanContent {
  return { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }],
    skipped: [], scopeNotes: {}, totalBytes: 19, site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, tovuVersion: "test", createdAt: "2026-10-19T00:00:00Z" } as unknown as SiteSharePlanContent;
}

test("no expiry by default", async t => {
  const clock = { now: Date.now() };
  const registry = await registryAt(t, clock);
  assert.equal(shareExpiresAt({ days: null, now: clock.now, destination: ownFolder(registry), copy }), null);
  const row = await createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP });
  assert.equal(row.expiresAt ?? null, null);
  const backend = createSiteShareBackend({ createBundledFilePolicy: bundledFilePolicy, registry, site: "ws", prepare: async () => planContent(), zip: zipFolderFiles, delivery: async () => ownFolder(registry) }, { now: () => clock.now });
  const viaBackend = await backend.create({ principalId: "owner", signal: new AbortController().signal }, { waitMs: 5000 }) as { expiresAt?: string | null };
  assert.equal(viaBackend.expiresAt ?? null, null, "a create without a choice records Never");
  clock.now += TEN_YEARS;
  assert.equal((await registry.findToken({ token: row.token, file: row.file }))?.shareId, row.shareId);
});

test("peer-uploaded row without URL or storage still served", async t => {
  const clock = { now: Date.now() };
  const registry = await registryAt(t, clock);
  const { token } = newShareIdentity({});
  const row = await receiveSiteShareArtifact({ registry, site: "ws", token, file: "peer.tovu.zip", archive: ZIP });
  assert.equal(row.url, null);
  assert.equal(row.storage, undefined);
  assert.equal("expiresAt" in row, false, "a peer receive never invents an expiry");
  clock.now += TEN_YEARS;
  assert.equal((await registry.findToken({ token, file: "peer.tovu.zip" }))?.status, "active");
});

test("an owner-chosen expiry stops the public link after its own date and deletes nothing", async t => {
  const created = Date.parse("2026-12-01T10:00:00.000Z");
  const clock = { now: created };
  const registry = await registryAt(t, clock);
  const delivery = ownFolder(registry);
  const expiresAt = shareExpiresAt({ days: 7, now: created, destination: delivery, copy });
  const row = await createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP }, { delivery, expiresAt });
  assert.equal(row.expiresAt, "2026-12-08T10:00:00.000Z");
  clock.now = created + 7 * DAY - 1;
  assert.ok(await registry.findToken({ token: row.token, file: row.file }));
  clock.now = created + 7 * DAY;
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
  const kept = await registry.get({ shareId: row.shareId });
  assert.equal(kept?.status, "active", "the owner still sees the row exactly as it was");
  assert.equal(isShareExpired({ row: kept!, now: clock.now }), true);
  assert.equal((await stat(registry.artifactPath({ shareId: row.shareId }))).size, ZIP.length, "the ZIP is still on disk");
});

test("the owner's choices are Never, 7, 30 or 90 days; anything else is refused in plain words", async t => {
  const registry = await registryAt(t, { now: 0 });
  const destination = ownFolder(registry);
  assert.deepEqual(SHARE_EXPIRY_DAYS, [7, 30, 90]);
  assert.equal(shareExpiresAt({ days: 30, now: 0, destination, copy }), new Date(30 * DAY).toISOString());
  for (const days of [0, 14, -7, 7.5]) {
    assert.throws(() => shareExpiresAt({ days, now: 0, destination, copy }), (error: unknown) => error instanceof SiteShareRefusal && error.code === "INVALID_INPUT" && error.message === CHOICES);
  }
});

test("an expiry needs affirmative own-folder hosting; Never is accepted for any destination", () => {
  const counter = { uploads: 0 };
  assert.equal(shareExpiresAt({ days: null, now: 0, destination: remote(counter), copy }), null);
  assert.equal(shareExpiresAt({ days: null, now: 0, destination: undefined, copy }), null);
  assert.throws(() => shareExpiresAt({ days: 7, now: 0, destination: remote(counter), copy }), { code: "INVALID_INPUT", message: "Links stored with s3 can't expire yet. Choose Never, or turn off that storage for this export." });
  assert.throws(() => shareExpiresAt({ days: 7, now: 0, destination: undefined, copy }), { code: "INVALID_INPUT", message: copy.notHostedHere });
  const relative = { provider: "tovu-server", binding: "shares" };
  assert.throws(() => shareExpiresAt({ days: 7, now: 0, destination: relative, copy }), { code: "INVALID_INPUT" });
});

test("a link stored with another provider cannot carry an expiry; nothing is written", async t => {
  const registry = await registryAt(t, { now: Date.now() });
  const counter = { uploads: 0 };
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP }, { delivery: remote(counter), expiresAt: "2030-01-01T00:00:00.000Z" }),
    (error: unknown) => error instanceof SiteShareRefusal && error.message === "Links stored with s3 can't expire yet. Choose Never, or turn off that storage for this export.");
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP }, { expiresAt: "2030-01-01T00:00:00.000Z" }), { code: "INVALID_INPUT" });
  assert.equal(counter.uploads, 0);
  assert.deepEqual(await registry.list({}), []);
});

test("remote-provider refusal before any job", async t => {
  const registry = await registryAt(t, { now: Date.now() });
  const counter = { uploads: 0 };
  let prepared = 0;
  const backend = createSiteShareBackend({ createBundledFilePolicy: bundledFilePolicy, registry, site: "ws", prepare: async () => { prepared += 1; return planContent(); }, zip: zipFolderFiles, delivery: async () => remote(counter) });
  await assert.rejects(backend.create({ principalId: "owner", signal: new AbortController().signal, expiresInDays: 30 }), { code: "INVALID_INPUT", message: "Links stored with s3 can't expire yet. Choose Never, or turn off that storage for this export." });
  await assert.rejects(backend.create({ principalId: "owner", signal: new AbortController().signal, expiresInDays: 14 }), { code: "INVALID_INPUT", message: CHOICES });
  await assert.rejects(backend.create({ principalId: "owner", signal: new AbortController().signal, format: "static", expiresInDays: 7 }), { code: "INVALID_INPUT", message: copy.notHostedHere });
  assert.equal(prepared, 0, "no export job started");
  assert.equal(backend.hasWork(), false);
  assert.equal(counter.uploads, 0);
  assert.deepEqual(await registry.list({}), []);
});

test("the backend records the owner's choice from its own clock for its own folder", async t => {
  const registry = await registryAt(t, { now: Date.now() });
  const now = Date.parse("2026-12-01T00:00:00.000Z");
  const backend = createSiteShareBackend({ createBundledFilePolicy: bundledFilePolicy, registry, site: "ws", prepare: async () => planContent(), zip: zipFolderFiles, delivery: async () => ownFolder(registry) }, { now: () => now });
  const chosen = await backend.create({ principalId: "owner", signal: new AbortController().signal, expiresInDays: 90 }, { waitMs: 5000 }) as { expiresAt?: string | null };
  assert.equal(chosen.expiresAt, "2027-03-01T00:00:00.000Z");
});

test("an unreadable persisted expiry fails closed for serving only", async t => {
  const clock = { now: Date.now() };
  const registry = await registryAt(t, clock);
  const row = await createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP });
  await registry.put({ record: { ...row, expiresAt: "not a date" } });
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "active", "the row is kept as written");
  assert.equal((await stat(registry.artifactPath({ shareId: row.shareId }))).size, ZIP.length, "nothing is removed");
});
