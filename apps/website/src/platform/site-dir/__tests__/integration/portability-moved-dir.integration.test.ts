import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { posts, presentationSettings } from "#src/platform/db/schema.sqlite";
import { initSite } from "../../init-site.js";
import { bootSiteDir, closeSiteDirBoot } from "../../boot-site-dir.js";

/**
 * @file SPEC-003 REQ-08/AC-10 (portability — moved/renamed install dirs) — TDD certification,
 * integration tier.
 *
 * Traces: REQ-08 ("neither init nor serve persists absolute paths in any install-dir file"),
 * AC-10 ("an initialized, previously served dir, when moved to a different absolute path and
 * served, all content/settings/behavior are identical"), state.spec.md §6 ("no file in the
 * install dir contains an absolute path").
 *
 * `initSite`/`bootSiteDir` do not exist yet — expected to fail to compile/run until Programmer
 * implements `src/platform/site-dir/init-site.ts` / `src/platform/site-dir/boot-site-dir.ts` (tasks.md T014/T016).
 * Correct TDD state.
 */

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-portability-"));
}

test("AC-10/REQ-08: an initialized, served install dir behaves identically after being moved to a new absolute path, and no install-dir file contains the OLD absolute path", async () => {
  const parentA = mkTempParent();
  const originalDir = path.join(parentA, "site-original-location");

  const initResult = await initSite({ dir: originalDir, name: "Movable Site" });
  const firstBoot = await bootSiteDir({ dir: originalDir });
  assert.equal(firstBoot.config.name, "Movable Site");
  assert.ok(firstBoot.db);
  const bodyJson = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Distinctive content survives the move" }] }] });
  firstBoot.db.update(posts).set({ title: "Portable welcome", bodyJson }).where(eq(posts.slug, "welcome")).run();
  firstBoot.db.update(presentationSettings).set({ activeThemeId: "portable-theme", updatedAt: "2026-01-02T03:04:05.000Z" }).run();
  const expectedPosts = firstBoot.db.select().from(posts).where(eq(posts.slug, "welcome")).all();
  assert.equal(expectedPosts.length, 1);
  assert.equal(expectedPosts[0].bodyJson, bodyJson);
  const expectedSettings = firstBoot.db.select().from(presentationSettings).all();
  assert.equal(expectedSettings.length, 1);
  assert.equal(expectedSettings[0].activeThemeId, "portable-theme");
  fs.writeFileSync(path.join(originalDir, "uploads", "portable.txt"), "asset survives the move\n");
  await closeSiteDirBoot(firstBoot);

  const parentB = mkTempParent();
  const movedDir = path.join(parentB, "site-new-location");
  fs.renameSync(originalDir, movedDir);

  try {
    const secondBoot = await bootSiteDir({ dir: movedDir });
    try {
      assert.equal(secondBoot.workspaceId, firstBoot.workspaceId, "AC-10: the resolved workspace id must be unchanged after a move");
      assert.equal(secondBoot.config.name, "Movable Site", "AC-10: config content must be unchanged after a move");

      assert.ok(secondBoot.db, "a SQLite site boots with its content.db handle");
      const welcomePost = secondBoot.db.select().from(posts).where(eq(posts.slug, "welcome")).all();
      assert.equal(welcomePost.length, 1, "AC-10: seeded content must survive the move unchanged");
      assert.deepEqual(welcomePost, expectedPosts, "complete saved post state must survive");
      assert.deepEqual(secondBoot.db.select().from(presentationSettings).all(), expectedSettings, "non-default settings must survive");
      assert.equal(fs.readFileSync(path.join(movedDir, "uploads", "portable.txt"), "utf8"), "asset survives the move\n");

      // REQ-08: no install-dir file may contain the OLD absolute path.
      const configText = fs.readFileSync(path.join(movedDir, "config.json"), "utf8");
      const metaText = fs.readFileSync(path.join(movedDir, ".site-meta.json"), "utf8");
      assert.ok(!configText.includes(originalDir), "config.json must not persist the old absolute path");
      assert.ok(!metaText.includes(originalDir), ".site-meta.json must not persist the old absolute path");
      assert.ok(!configText.includes(parentA), "config.json must not persist any segment of the old absolute path's parent");
      assert.ok(!metaText.includes(parentA), ".site-meta.json must not persist any segment of the old absolute path's parent");
      const inspect = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) inspect(file);
          else if (entry.isFile()) assert.equal(fs.readFileSync(file).includes(Buffer.from(parentA)), false, `${file} must not retain the old location`);
        }
      };
      inspect(movedDir);

      assert.ok(initResult.siteId, "sanity: initSite's own siteId is still the identity carried through the move");
      assert.equal(secondBoot.workspaceId, firstBoot.workspaceId);
    } finally {
      await closeSiteDirBoot(secondBoot);
    }
  } finally {
    fs.rmSync(parentA, { recursive: true, force: true });
    fs.rmSync(parentB, { recursive: true, force: true });
  }
});
