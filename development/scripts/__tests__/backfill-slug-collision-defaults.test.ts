import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../src/db/sqlite/content-db.js";

/**
 * @file Adversarial coverage for `backfill-slug-collision-defaults.ts` — the cross-record
 * reclassification pass that recovers `overrides_theme_page: false -> NULL` for rows that could
 * never have collided with any real theme page (see that script's own file header for the full
 * rationale).
 *
 * Written because the script's own manual dry run against the real `infra/content.db` (verification
 * step, 2026-08-15) happened to exercise only the "reclassify" branch — every currently-`false` row
 * in that real database turned out to be a non-collision, and the one genuine historical collision
 * was already stored `true`, not `false`. That is exactly the single-item-happy-path trap
 * `adversarial-test-design` exists to catch: a batch/reclassification pass whose real data never
 * happened to exercise its "leave alone" branch, its `true`-must-stay-`true` boundary, or its
 * idempotency claim. This file constructs a synthetic database + synthetic theme catalog specifically
 * to force all three.
 *
 * Runs the real script as a child process (`execFileSync`, same pattern
 * `src/db/__tests__/schema-postgres-drift.test.ts` already uses for a sibling `development/scripts/`
 * tool) against a throwaway `content.db` and a throwaway `TOVU_THEMES_DIR`, rather than importing the
 * script's module — the script's `main()` runs unconditionally at import time (matching both existing
 * `development/scripts/*.ts` precedents), so a child process is the only way to invoke it without
 * also inheriting this test runner's own real argv/cwd.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-slug-collision-defaults.ts");

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A minimal on-disk static theme with exactly one non-index page, "pricing" — the smallest fixture
 *  that can make a slug a genuine collision candidate. */
function writeFixtureTheme(themesRoot: string): void {
  const themeDir = path.join(themesRoot, "fixture-static-theme");
  fs.mkdirSync(path.join(themeDir, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(themeDir, "theme.json"),
    JSON.stringify({ id: "fixture-static-theme", name: "Fixture", version: "0.0.1", tier: "static" })
  );
  fs.writeFileSync(path.join(themeDir, "pages", "index.html"), "<html><body>home</body></html>");
  fs.writeFileSync(path.join(themeDir, "pages", "pricing.html"), "<html><body>pricing</body></html>");
}

interface SeedRow {
  id: string;
  workspaceId: string;
  slug: string;
  overridesThemePage: 0 | 1 | null;
}

function seedDb(dbPath: string, rows: SeedRow[]): void {
  const db = openContentDb(dbPath);
  const insert = db.$client.prepare(
    `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, body_format, updated_at, version, overrides_theme_page)
     VALUES (?, ?, ?, ?, '{}', 'published', 'post', 'doc', '2026-01-01T00:00:00.000Z', 1, ?)`
  );
  for (const row of rows) {
    insert.run(row.id, row.workspaceId, `Post ${row.slug}`, row.slug, row.overridesThemePage);
  }
  db.$client.close();
}

function readOverrides(dbPath: string): Record<string, 0 | 1 | null> {
  const db = openContentDb(dbPath);
  const rows = db.$client.prepare("SELECT id, overrides_theme_page AS v FROM posts").all() as Array<{ id: string; v: 0 | 1 | null }>;
  db.$client.close();
  return Object.fromEntries(rows.map((r) => [r.id, r.v]));
}

function runScript(dbPath: string, themesDir: string, extraArgs: string[] = []): string {
  // `node --import tsx`, not `npx tsx` (`schema-postgres-drift.test.ts`'s own choice for a sibling
  // `development/scripts/` tool) — this file invokes the script three times per test run and `npx`'s
  // own package-resolution overhead on top of tsx's made that add up; every other `.test.ts` file in
  // this repo already runs its own suite via `node --import tsx --test`, so this matches the faster
  // of two precedents already present in the codebase, not a new one.
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, TOVU_THEMES_DIR: themesDir },
  });
}

test("backfill-slug-collision-defaults: leaves a genuine collision candidate at false, reclassifies a non-collision to NULL, and never touches true or already-null rows", () => {
  const scratch = tmpDir("backfill-collision-defaults-");
  const themesRoot = path.join(scratch, "themes");
  fs.mkdirSync(themesRoot, { recursive: true });
  writeFixtureTheme(themesRoot);

  // Every row below shares the slug "pricing" (the fixture theme's one non-index page) except the
  // deliberate non-collision case — `posts_workspace_slug_unique` scopes uniqueness to
  // (workspace_id, slug), so each same-slug row lives in its own workspace. That is itself part of
  // what this test proves: the theme catalog is global (see the script's own "not scoped per
  // workspace" doc), so a colliding slug must be evaluated identically no matter which workspace it's
  // in — none of these workspaces share a row, only a slug.
  const dbPath = path.join(scratch, "content.db");
  seedDb(dbPath, [
    // Adversarial case 1: slug matches the fixture theme's own "pricing" page — a real collision
    // candidate. Stored false. Must be LEFT ALONE (an author may have made a real choice here).
    { id: "row-collision-false", workspaceId: "ws-1", slug: "pricing", overridesThemePage: 0 },
    // Adversarial case 2: slug matches nothing any locally-available theme ships. Stored false, the
    // exact "leftover NOT NULL DEFAULT false, never actually decided" case this script exists to fix.
    { id: "row-no-collision-false", workspaceId: "ws-1", slug: "totally-unrelated-slug", overridesThemePage: 0 },
    // Adversarial case 3: a slug that DOES collide, but was already explicitly set true (post wins).
    // Must remain true, untouched — this script only ever reads WHERE overrides_theme_page = 0.
    { id: "row-collision-true", workspaceId: "ws-2", slug: "pricing", overridesThemePage: 1 },
    // Adversarial case 4: a slug that DOES collide, already NULL (e.g. a prior partial backfill or a
    // fresh tri-state-era post). Must remain NULL, not get re-decided into false or true.
    { id: "row-collision-null", workspaceId: "ws-3", slug: "pricing", overridesThemePage: null },
    // Cross-workspace: same colliding slug in a FOURTH workspace, stored false — proves the script's
    // "no workspace-scoped theme lookup, deliberately" reasoning doesn't accidentally cross-pollute:
    // this row must be evaluated on its own slug, independent of ws-1's row, and (because the theme
    // catalog is genuinely global) still correctly LEFT ALONE.
    { id: "row-ws2-collision-false", workspaceId: "ws-4", slug: "pricing", overridesThemePage: 0 },
  ]);

  const dryRunOutput = runScript(dbPath, themesRoot);
  assert.match(dryRunOutput, /DRY RUN: id=row-no-collision-false .* would reclassify false -> NULL/);
  assert.doesNotMatch(dryRunOutput, /row-collision-false.*would reclassify/);
  assert.match(dryRunOutput, /LEFT ALONE.*row-collision-false/);
  assert.match(dryRunOutput, /LEFT ALONE.*row-ws2-collision-false/);

  // Dry run must never write.
  assert.deepEqual(readOverrides(dbPath), {
    "row-collision-false": 0,
    "row-no-collision-false": 0,
    "row-collision-true": 1,
    "row-collision-null": null,
    "row-ws2-collision-false": 0,
  });

  const applyOutput = runScript(dbPath, themesRoot, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, /RECLASSIFIED: id=row-no-collision-false/);
  assert.doesNotMatch(applyOutput, /RECLASSIFIED: id=row-collision-false\b/);

  const afterApply = readOverrides(dbPath);
  assert.equal(afterApply["row-collision-false"], 0, "a genuine collision candidate must survive --apply unchanged");
  assert.equal(afterApply["row-no-collision-false"], null, "a non-collision must be reclassified to NULL");
  assert.equal(afterApply["row-collision-true"], 1, "an explicit true must never be touched");
  assert.equal(afterApply["row-collision-null"], null, "an already-null row must never be touched or re-decided");
  assert.equal(afterApply["row-ws2-collision-false"], 0, "the second workspace's colliding row must also survive unchanged");

  // Idempotency: running --apply again over an already-processed database must change nothing.
  const secondApplyOutput = runScript(dbPath, themesRoot, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to reclassify|0 row\(s\) reclassified/);
  assert.deepEqual(readOverrides(dbPath), afterApply, "a second --apply run must be a complete no-op");

  fs.rmSync(scratch, { recursive: true, force: true });
});
