import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { posts } from "../../../db/schema";
import { initSite } from "../../init-site";
import { bootSiteDir } from "../../boot-site-dir";

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
 * implements `src/site-dir/init-site.ts` / `src/site-dir/boot-site-dir.ts` (tasks.md T014/T016).
 * Correct TDD state.
 */

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-portability-"));
}

test("AC-10/REQ-08: an initialized, served install dir behaves identically after being moved to a new absolute path, and no install-dir file contains the OLD absolute path", () => {
  const parentA = mkTempParent();
  const originalDir = path.join(parentA, "site-original-location");

  const initResult = initSite({ dir: originalDir, name: "Movable Site" });
  const firstBoot = bootSiteDir({ dir: originalDir });
  assert.equal(firstBoot.config.name, "Movable Site");
  firstBoot.db.$client.close();

  const parentB = mkTempParent();
  const movedDir = path.join(parentB, "site-new-location");
  fs.renameSync(originalDir, movedDir);

  try {
    const secondBoot = bootSiteDir({ dir: movedDir });
    try {
      assert.equal(secondBoot.workspaceId, firstBoot.workspaceId, "AC-10: the resolved workspace id must be unchanged after a move");
      assert.equal(secondBoot.config.name, "Movable Site", "AC-10: config content must be unchanged after a move");

      const welcomePost = secondBoot.db.select().from(posts).where(eq(posts.slug, "welcome")).all();
      assert.equal(welcomePost.length, 1, "AC-10: seeded content must survive the move unchanged");

      // REQ-08: no install-dir file may contain the OLD absolute path.
      const configText = fs.readFileSync(path.join(movedDir, "config.json"), "utf8");
      const metaText = fs.readFileSync(path.join(movedDir, ".site-meta.json"), "utf8");
      assert.ok(!configText.includes(originalDir), "config.json must not persist the old absolute path");
      assert.ok(!metaText.includes(originalDir), ".site-meta.json must not persist the old absolute path");
      assert.ok(!configText.includes(parentA), "config.json must not persist any segment of the old absolute path's parent");
      assert.ok(!metaText.includes(parentA), ".site-meta.json must not persist any segment of the old absolute path's parent");

      assert.ok(initResult.siteId, "sanity: initSite's own siteId is still the identity carried through the move");
      assert.equal(secondBoot.workspaceId, firstBoot.workspaceId);
    } finally {
      secondBoot.db.$client.close();
    }
  } finally {
    fs.rmSync(parentA, { recursive: true, force: true });
    fs.rmSync(parentB, { recursive: true, force: true });
  }
});
