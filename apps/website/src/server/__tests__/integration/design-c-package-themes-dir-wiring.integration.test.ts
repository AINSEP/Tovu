import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { builtInThemesDir, createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { createAgentDaemonRouteDeps } from "../../runtime/composition/agent-daemon-deps.js";

/**
 * @file Design C production-wiring regression (dispatch 2026-09-16, w7-design-c-wiring-test).
 *
 * Commit c52b8d54 added an OPTIONAL `RouteDeps.packageThemesDir` — when set, `resolveThemeOriginalSource`
 * (`features/theme/theme-files.ts`) falls back to the shipped package's own read-only
 * `__original-themes__` catalog for a theme this site has no original of its own for. When it is
 * `undefined`, that fallback silently never happens, and the ENTIRE existing suite still passes,
 * because `packageThemesDir` is deliberately optional (see `RouteDeps.packageThemesDir`'s own doc
 * in `server/routes/types.ts`) — no hand-built `RouteDeps` fixture sets it, so nothing but the real
 * composition roots can catch its removal.
 *
 * Production sets it in exactly ONE place: `createSqliteRouteDeps` (`deps.ts:~1382`),
 * `packageThemesDir: builtInThemesDir()`. Both real consumers inherit that one line:
 *  - admin HTTP routes (`routes/themes/explore.ts`) via `createSqliteRouteDeps` directly.
 *  - the agent daemon's `theme_reset_file` tool via `createAgentDaemonRouteDeps` ->
 *    `createSqliteRouteDepsForWorkspace` -> `createSqliteRouteDeps` (same line).
 *
 * `TOVU_DB === "memory"` (`composition/app.ts`'s `createRouteDeps()`) deliberately does NOT set it —
 * that is the documented hermetic/test-only contract, not a gap, and is NOT exercised here.
 *
 * Both tests below build the REAL production factories (no hand-built fixture that sets
 * `packageThemesDir` itself — that would only prove the field works, not that production wires it)
 * against a temp SQLite db and a temp themes dir, exactly like the sibling
 * `create-sqlite-route-deps-overrides.integration.test.ts` / `create-sqlite-route-deps-for-workspace.integration.test.ts`
 * files already do, so this never touches the owner's live `sites/**`, `chat.db`, or `content.db`.
 */

function mkTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-design-c-wiring-db-"));
  return path.join(dir, "content.db");
}

function mkTempThemesDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-design-c-wiring-themes-"));
}

/**
 * Same un-awaited-boot-install race the sibling `create-sqlite-route-deps-for-workspace.integration.test.ts`
 * file's own `settle` documents: deleting the temp dirs in `finally` before these settle can surface
 * as an unhandledRejection against the NEXT test rather than this one.
 */
async function settle(deps: { identityReady: Promise<void>; settingsReady: Promise<void>; seoReady: Promise<void>; commentsReady: Promise<void>; commentsSettingsReady: Promise<void>; executionSettingsReady: Promise<void>; settingsUiTabsReady: Promise<void>; analyticsSettingsReady: Promise<void>; siteTitleReady: Promise<void> }): Promise<void> {
  await Promise.all([
    deps.identityReady,
    deps.settingsReady,
    deps.seoReady,
    deps.commentsReady,
    deps.commentsSettingsReady,
    deps.executionSettingsReady,
    deps.settingsUiTabsReady,
    deps.analyticsSettingsReady,
    deps.siteTitleReady,
  ]);
}

test("admin HTTP routes path: createSqliteRouteDeps wires packageThemesDir to the real builtInThemesDir(), not undefined", async () => {
  const dbPath = mkTempDbPath();
  const themesDir = mkTempThemesDir();
  try {
    const deps = createSqliteRouteDeps(dbPath, { themesDir });

    assert.equal(
      deps.packageThemesDir,
      builtInThemesDir(),
      "createSqliteRouteDeps must wire packageThemesDir to builtInThemesDir() — routes/themes/explore.ts's detail/copy/rename/reset routes read this field directly"
    );
    assert.ok(deps.packageThemesDir !== undefined, "packageThemesDir must not be undefined on the real SQLite composition root");
    assert.ok(fs.existsSync(deps.packageThemesDir!), `packageThemesDir must point at a real directory: ${deps.packageThemesDir}`);
    assert.ok(
      fs.existsSync(path.join(deps.packageThemesDir!, "__original-themes__")),
      "packageThemesDir must be the shipped package catalog root — it must contain __original-themes__"
    );

    await settle(deps);
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    fs.rmSync(themesDir, { recursive: true, force: true });
  }
});

test("agent daemon path (theme_reset_file's own composition): createAgentDaemonRouteDeps -> createSqliteRouteDepsForWorkspace -> createSqliteRouteDeps wires packageThemesDir the same way", async () => {
  const dbPath = mkTempDbPath();
  const themesDir = mkTempThemesDir();
  // `createSqliteRouteDepsForWorkspace`/`createSqliteRouteDeps` have no themesDir-override parameter
  // reachable from `createAgentDaemonRouteDeps` — the real daemon boot resolves it from
  // `process.env.TOVU_THEMES_DIR` (`siteThemesDir()`, `deps.ts`), so this test overrides that same
  // env var (save/restore) rather than pointing at the owner's live `sites/tovu-com/themes`.
  const originalThemesDirEnv = process.env.TOVU_THEMES_DIR;
  process.env.TOVU_THEMES_DIR = themesDir;
  try {
    // SQLite mode, no workspace override — the daemon's default single-workspace boot.
    const daemonEnv: NodeJS.ProcessEnv = { ...process.env };
    delete daemonEnv.TOVU_DB;
    delete daemonEnv.TOVU_WORKSPACE;

    const deps = createAgentDaemonRouteDeps({ env: daemonEnv }, { dbPath });

    assert.equal(
      deps.packageThemesDir,
      builtInThemesDir(),
      "the agent daemon's RouteDeps (what theme_reset_file actually runs against) must also carry packageThemesDir wired to builtInThemesDir()"
    );
    assert.ok(deps.packageThemesDir !== undefined, "packageThemesDir must not be undefined on the daemon's composition root");
    assert.ok(fs.existsSync(deps.packageThemesDir!), `packageThemesDir must point at a real directory: ${deps.packageThemesDir}`);
    assert.ok(
      fs.existsSync(path.join(deps.packageThemesDir!, "__original-themes__")),
      "packageThemesDir must be the shipped package catalog root — it must contain __original-themes__"
    );

    await settle(deps);
  } finally {
    if (originalThemesDirEnv === undefined) delete process.env.TOVU_THEMES_DIR;
    else process.env.TOVU_THEMES_DIR = originalThemesDirEnv;
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    fs.rmSync(themesDir, { recursive: true, force: true });
  }
});
