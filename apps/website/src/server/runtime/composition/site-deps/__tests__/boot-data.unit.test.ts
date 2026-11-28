import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { startBootData } from "../boot-data.js";

/** @file `startBootData`'s boot chains never reject: each step that fails is logged by name and boot goes on. */

type Required = Parameters<typeof startBootData>[0];

test("every boot data step that fails is logged with its own name and the chains still settle", async t => {
  const seedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seed-"));
  const previousSeed = process.env.TOVU_STOCK_CONTENT_SEED_DIR;
  t.after(() => {
    if (previousSeed === undefined) delete process.env.TOVU_STOCK_CONTENT_SEED_DIR; else process.env.TOVU_STOCK_CONTENT_SEED_DIR = previousSeed;
    fs.rmSync(seedRoot, { recursive: true, force: true });
  });
  process.env.TOVU_STOCK_CONTENT_SEED_DIR = seedRoot;
  // The seed "uploads" folder is a file, so listing it fails with something other than "not found".
  fs.mkdirSync(path.join(seedRoot, "site-b"));
  fs.writeFileSync(path.join(seedRoot, "site-b", "uploads"), "not a folder");
  const db = openContentDb(":memory:");
  const kernel = contentKernel({ store: db });
  closeSqliteConnection({ source: db });
  const logged: string[] = [];
  const ready = startBootData({
    kernel, clock: { nowMs: () => 0, nowIso: () => "2026-11-20T00:00:00.000Z" }, workspaceId: "ws-6", dbPath: path.join(seedRoot, "content.db"),
    idGen: { newId: () => "id-1" }, resolvedSiteBinding: { name: "site-b", dir: seedRoot }, blobStore: { putIfAbsent: async () => true },
    consoleLogger: { error: ({ message }: { message: string }) => { logged.push(message); } },
  } as unknown as Required);
  const settled = await Promise.all([ready.menuBindingsReady, ready.newsletterReady, ready.commentsReady, ready.mediaTransformReady, ready.blobHydrationReady]);
  assert.deepEqual(settled, [undefined, undefined, undefined, undefined, undefined]);
  const steps = ["rebuildNavLocationBindings", "installNewsletterDataModule", "installCommentsDataModule", "ensureCoreMediaTransform", "hydrateBlobStoreFromSeed"];
  assert.deepEqual(logged.map(m => m.split(" failed at boot: ")[0]).sort(), [...steps].sort());
  for (const message of logged) assert.match(message, / failed at boot: \S/);
  assert.ok(logged.some(m => m.startsWith("hydrateBlobStoreFromSeed failed at boot: ") && m.includes("ENOTDIR")), logged.join("\n"));
});
