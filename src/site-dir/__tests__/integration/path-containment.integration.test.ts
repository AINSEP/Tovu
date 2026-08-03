import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { workspaces } from "#src/db/schema";
import { runtimeSchemaVersion } from "../../schema-guard";
import { initSite } from "../../init-site";
import { bootSiteDir } from "../../boot-site-dir";

/**
 * @file SPEC-003 CIC U-004 (Install-dir path containment) — TDD certification, integration tier.
 *
 * Traces: INV-01 ("init and serve must never write any file outside the target install dir"),
 * U-004-B1 ("every fs write ... must target a path that is first resolved ... and confirmed to
 * be inside ... the target dir; no write may be constructed by naive string concatenation against
 * an unresolved dir argument").
 *
 * Neither `initSite` nor `bootSiteDir` exist yet — expected to fail to compile/run until
 * Programmer implements `src/site-dir/init-site.ts` / `src/site-dir/boot-site-dir.ts`
 * (tasks.md T014/T016). Correct TDD state.
 *
 * `path.join`/POSIX `mkdir`/`open` already resolve embedded `..` segments correctly at the OS
 * level regardless of whether calling code pre-normalizes them, so a `dir` argument with literal
 * `..` components is a comparatively weak adversarial case (included below because U-004-B1
 * explicitly names it, and it is cheap to assert). The materially meaningful attack this suite
 * exercises is a **symlink at the target**: if `initSite`/`bootSiteDir` resolve the target once
 * (e.g. via `fs.realpathSync`-equivalent) and then consistently construct every sub-path from
 * THAT resolved root, every write lands inside the symlink's real destination and nowhere else;
 * a naive implementation that re-derives some sub-paths from the unresolved `dir` string could
 * inconsistently spill a file next to the symlink itself instead.
 */

function mkTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-path-containment-"));
}

test("U-004-B1 (embedded '..' segments): initSite writes exclusively under the RESOLVED target, never under the unresolved literal path", () => {
  const root = mkTempRoot();
  const decoyDir = path.join(root, "decoy-should-stay-empty");
  fs.mkdirSync(decoyDir);
  const realTarget = path.join(root, "actual-target");
  // Resolves to <root>/actual-target, but the literal string routes through the decoy dir first.
  const dirArgWithDotDot = path.join(root, "decoy-should-stay-empty", "..", "actual-target");
  assert.equal(path.resolve(dirArgWithDotDot), realTarget, "sanity: the constructed argument really does resolve to realTarget");

  try {
    const result = initSite({ dir: dirArgWithDotDot, name: "Dotdot Target" });
    assert.equal(path.resolve(result.dir), realTarget);

    assert.ok(fs.existsSync(path.join(realTarget, ".site-meta.json")), "every file must land under the RESOLVED target");
    assert.deepEqual(fs.readdirSync(decoyDir), [], "INV-01: nothing may be written into the unresolved path's intermediate segment");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("U-004-B1 (symlink at the target): every file initSite creates lands inside the symlink's REAL destination, and nothing spills next to the symlink itself", () => {
  const root = mkTempRoot();
  const realDestinationParent = mkTempRoot(); // a wholly separate temp root, standing in for "somewhere else on disk"
  const realDestination = path.join(realDestinationParent, "real-site-location");
  const symlinkPath = path.join(root, "site-via-symlink");
  fs.symlinkSync(realDestination, symlinkPath, "dir");

  try {
    const result = initSite({ dir: symlinkPath, name: "Symlinked Site" });

    // Every artifact must be reachable at the symlink's REAL destination.
    const realMetaPath = path.join(realDestination, ".site-meta.json");
    assert.ok(fs.existsSync(realMetaPath), "the commit marker must exist at the symlink's real destination");
    for (const child of ["config.json", "content.db", "uploads", "themes", "plugins", "overrides"]) {
      assert.ok(fs.existsSync(path.join(realDestination, child)), `${child} must exist at the real destination, not merely be reachable through the symlink`);
    }

    // Nothing may have spilled into the symlink's OWN containing directory besides the symlink entry itself.
    assert.deepEqual(fs.readdirSync(root), ["site-via-symlink"], "INV-01: no stray file may appear beside the symlink in its containing directory");
    assert.ok(result.siteId, "initSite must still report a siteId when called through a symlinked target");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(realDestinationParent, { recursive: true, force: true });
  }
});

test("U-004-B1 (symlink at the target, serve path): bootSiteDir's .site-meta.json stamp update lands at the symlink's real destination, never beside the symlink", () => {
  const root = mkTempRoot();
  const realDestinationParent = mkTempRoot();
  const realDestination = path.join(realDestinationParent, "real-site-location");
  fs.mkdirSync(realDestination);

  fs.writeFileSync(path.join(realDestination, "config.json"), JSON.stringify({ name: "Symlinked Serve", domain: null, port: null }));
  const dbPath = path.join(realDestination, "content.db");
  const db = openContentDb(dbPath);
  db.insert(workspaces).values({ id: "ws-symlink", name: "Symlink WS", slug: "symlink-ws", createdAt: "2026-01-01T00:00:00.000Z" }).run();
  db.$client.close();
  const runtime = runtimeSchemaVersion();
  assert.ok(runtime.index > 0);
  fs.writeFileSync(
    path.join(realDestination, ".site-meta.json"),
    JSON.stringify({
      siteId: "33333333-3333-3333-3333-333333333333",
      templateId: "starter",
      templateVersion: "1.0.0",
      schemaVersion: runtime.index - 1,
      schemaTag: "an-older-tag",
      createdAt: "2026-01-01T00:00:00.000Z",
    })
  );

  const symlinkPath = path.join(root, "site-via-symlink");
  fs.symlinkSync(realDestination, symlinkPath, "dir");

  try {
    const result = bootSiteDir({ dir: symlinkPath });
    assert.equal(result.workspaceId, "ws-symlink");

    const metaAtRealDestination = JSON.parse(fs.readFileSync(path.join(realDestination, ".site-meta.json"), "utf8"));
    assert.equal(metaAtRealDestination.schemaVersion, runtime.index, "the bumped stamp must land at the real destination");
    assert.equal(metaAtRealDestination.schemaTag, runtime.tag);

    assert.deepEqual(fs.readdirSync(root), ["site-via-symlink"], "INV-01: no stray file may appear beside the symlink");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(realDestinationParent, { recursive: true, force: true });
  }
});
