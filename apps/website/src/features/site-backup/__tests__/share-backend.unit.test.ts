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
function content(overrides: Partial<SiteSharePlanContent> = {}): SiteSharePlanContent {
  return { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [], skipped: [], scopeNotes: {}, totalBytes: 17,
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
  await started;
  const progress = await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 0 }) as Awaited<ReturnType<typeof progressAtDelivery>>;
  release();
  await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 1000 });
  return progress;
}
const BUFFERED = [{ path: "uploads/a.txt", content: Buffer.from("a") }, { path: "uploads/b.txt", content: Buffer.from("b") }];

test("archive progress reaches its totals: buffered files plus the database, and the planned bytes", async t => {
  const { phase, progress } = await progressAtDelivery(t, content({ bufferedFiles: BUFFERED, totalBytes: 19 }));
  assert.deepEqual({ phase, ...progress }, { phase: "archive-or-upload", filesDone: 3, filesTotal: 3, bytesDone: 19, bytesTotal: 19 });
});

test("archive progress without a database stops one file short of its total (reported, not fixed)", async t => {
  const { progress } = await progressAtDelivery(t, content({ database: null, bufferedFiles: BUFFERED, totalBytes: 2 }));
  assert.deepEqual(progress, { filesDone: 2, filesTotal: 3, bytesDone: 2, bytesTotal: 2 });
});
