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

import { SHARE_EXPIRY_DAYS, isShareExpired, shareExpiresAt } from "../share-expiry.js";
import { SiteShareRegistry, newShareIdentity } from "../share-registry.js";
import { createSiteShare, receiveSiteShareArtifact, type ShareDelivery } from "../share-service.js";
import { SiteShareRefusal } from "../share-policy.js";
import { createSiteShareBackend } from "../share-backend.js";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import type { SiteSharePlanContent } from "../plan-content.js";

const DAY = 24 * 60 * 60 * 1000;
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const TEN_YEARS = 10 * 365 * DAY;

async function registryAt(t: TestContext, clock: { now: number }): Promise<SiteShareRegistry> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-expiry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory }, { now: () => clock.now });
}

test("no expiry by default", async t => {
  const clock = { now: Date.now() };
  const registry = await registryAt(t, clock);
  const row = await createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP });
  assert.equal(row.expiresAt ?? null, null);
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
  clock.now += TEN_YEARS;
  assert.equal((await registry.findToken({ token, file: "peer.tovu.zip" }))?.status, "active");
});

test("an owner-chosen expiry stops the public link after its own date and deletes nothing", async t => {
  const created = Date.parse("2026-12-01T10:00:00.000Z");
  const clock = { now: created };
  const registry = await registryAt(t, clock);
  const expiresAt = shareExpiresAt({ days: 7, now: created });
  const row = await createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP }, { expiresAt });
  assert.equal(row.expiresAt, "2026-12-08T10:00:00.000Z");
  clock.now = created + 7 * DAY - 1;
  assert.ok(await registry.findToken({ token: row.token, file: row.file }));
  clock.now = created + 7 * DAY;
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
  // The owner still sees the row exactly as it was, and the ZIP is still on disk.
  const kept = await registry.get({ shareId: row.shareId });
  assert.equal(kept?.status, "active");
  assert.equal(isShareExpired({ row: kept!, now: clock.now }), true);
  assert.equal((await stat(registry.artifactPath({ shareId: row.shareId }))).size, ZIP.length);
});

test("the owner's choices are Never, 7, 30 or 90 days; anything else is refused in plain words", () => {
  assert.deepEqual(SHARE_EXPIRY_DAYS, [7, 30, 90]);
  assert.equal(shareExpiresAt({ days: null, now: 0 }), null);
  assert.equal(shareExpiresAt({ days: 30, now: 0 }), new Date(30 * DAY).toISOString());
  for (const days of [0, 14, -7, 7.5]) {
    assert.throws(() => shareExpiresAt({ days, now: 0 }), (error: unknown) => error instanceof SiteShareRefusal && error.code === "INVALID_INPUT"
      && error.message === "A share link can expire after 7, 30 or 90 days, or never.");
  }
});

test("a link stored with another provider cannot carry an expiry yet; nothing is written", async t => {
  const registry = await registryAt(t, { now: Date.now() });
  let uploads = 0;
  const delivery: ShareDelivery = { provider: "s3", store: { upload: async () => { uploads += 1; return { url: "https://x" }; }, verify: async () => true, delete: async () => {} } as unknown as ShareDelivery["store"] };
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP }, { delivery, expiresAt: shareExpiresAt({ days: 7, now: Date.now() }) }),
    (error: unknown) => error instanceof SiteShareRefusal && error.message === "Links stored with s3 can't expire yet. Choose Never, or turn off that storage for this export.");
  assert.equal(uploads, 0);
  assert.deepEqual(await registry.list({}), []);
});

test("an unreadable expiry fails closed: the public link is not served", async t => {
  const clock = { now: Date.now() };
  const registry = await registryAt(t, clock);
  const row = await createSiteShare({ registry, site: "ws", name: "Shop", archive: ZIP }, { expiresAt: "not a date" });
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
});

function planContent(): SiteSharePlanContent {
  return { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }],
    skipped: [], scopeNotes: {}, totalBytes: 19, site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, tovuVersion: "test", createdAt: "2026-10-19T00:00:00Z" };
}

test("the backend records the owner's choice from its own clock, and Never when none is given", async t => {
  const registry = await registryAt(t, { now: Date.now() });
  const now = Date.parse("2026-12-01T00:00:00.000Z");
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => planContent(), zip: zipFolderFiles, delivery: async () => undefined }, { now: () => now });
  const chosen = await backend.create({ principalId: "owner", signal: new AbortController().signal, expiresInDays: 90 }) as { expiresAt?: string | null };
  assert.equal(chosen.expiresAt, "2027-03-01T00:00:00.000Z");
  const never = await backend.create({ principalId: "owner", signal: new AbortController().signal }) as { expiresAt?: string | null };
  assert.equal(never.expiresAt ?? null, null);
  await assert.rejects(backend.create({ principalId: "owner", signal: new AbortController().signal, expiresInDays: 14 }), SiteShareRefusal);
});
