/**
 * Pins the share backend's create paths the integration suites leave implicit: the default wait
 * budget and the archive progress totals once preparation has buffered files. Refusals, cancel,
 * resume and revoke are pinned in share-refusals.integration and share-delivery.integration.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import type { SiteSharePlanContent } from "../plan-store.js";
import { createSiteShareBackend } from "../share-backend.js";
import { SiteShareRegistry } from "../share-registry.js";

async function registryIn(t: TestContext): Promise<SiteShareRegistry> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-backend-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory });
}
const SETTINGS = { path: "settings.json", content: Buffer.from("{}") };
function content(overrides: Partial<SiteSharePlanContent> = {}): SiteSharePlanContent {
  return { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    // A v2 share always carries settings.json beside content.db.
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [SETTINGS], skipped: [], scopeNotes: {}, totalBytes: 19,
    site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, tovuVersion: "test", createdAt: "2026-10-19T00:00:00Z", ...overrides };
}

test("a create without a wait budget waits for a quick export and returns the ZIP-only share", async t => {
  const registry = await registryIn(t);
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => content(), zip: zipFolderFiles, delivery: async () => undefined });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal }) as { status: string; url: string | null; message: string };
  assert.deepEqual({ status: result.status, url: result.url, message: result.message },
    { status: "active", url: null, message: "ZIP ready. Download zip only. Connect a deployed Tovu site or S3-compatible storage to get a link." });
});

/** Starts an export whose delivery lookup blocks after archiving, and returns its progress at that point. */
async function progressAtDelivery(t: TestContext, plan: SiteSharePlanContent): Promise<{ phase: string; progress: { filesDone: number; filesTotal: number; bytesDone: number; bytesTotal: number } }> {
  const registry = await registryIn(t);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => plan, zip: zipFolderFiles, delivery: async () => { entered(); await gate; return undefined; } });
  const signal = new AbortController().signal;
  const pending = await backend.create({ principalId: "owner", signal }, { waitMs: 0 }) as { jobId: string };
  // An export that fails before delivery (e.g. a plan v2 refuses) must fail this test with its own
  // refusal now, not leave `started` pending until the runner's timeout.
  const settled = backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 60_000 });
  settled.catch(() => undefined);
  const first = await Promise.race([started.then(() => "delivery" as const), settled.then(() => "settled" as const)]);
  if (first === "settled") assert.fail(`the export settled before delivery: ${JSON.stringify(await settled)}`);
  const progress = await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 0 }) as Awaited<ReturnType<typeof progressAtDelivery>>;
  release();
  await settled;
  return progress;
}
const BUFFERED = [SETTINGS, { path: "themes/site/a.txt", content: Buffer.from("a") }];

test("archive progress reaches its totals: buffered files plus the database, and the planned bytes", async t => {
  const { phase, progress } = await progressAtDelivery(t, content({ bufferedFiles: BUFFERED, totalBytes: 20 }));
  assert.deepEqual({ phase, ...progress }, { phase: "archive-or-upload", filesDone: 3, filesTotal: 3, bytesDone: 20, bytesTotal: 20 });
});

// v2 always carries content.db, so a plan without one is refused before delivery (the v1 quirk this
// pinned, progress one file short of its total, can no longer happen).
test("a share plan without a database is refused before delivery", async t => {
  await assert.rejects(progressAtDelivery(t, content({ database: null, bufferedFiles: BUFFERED, totalBytes: 3 })),
    { code: "INVALID_ARCHIVE", message: "Invalid v2 share manifest, inventory or schema identity." });
});
