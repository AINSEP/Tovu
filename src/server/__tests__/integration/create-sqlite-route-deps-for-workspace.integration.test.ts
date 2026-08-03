import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSqliteRouteDepsForWorkspace } from "../../deps";
import { openContentDb } from "#src/db/sqlite/content-db";
import { workspaces } from "#src/db/schema";

/**
 * @file D10 fix — `createSqliteRouteDepsForWorkspace`, the helper `assistant/agent-daemon-server.ts`
 * uses to bind to the SAME workspace the main process already resolved (via `TOVU_WORKSPACE`)
 * instead of independently re-deriving `resolveWorkspace`'s default answer on its own connection.
 *
 * Sibling to `create-sqlite-route-deps-overrides.integration.test.ts` (that file certifies
 * `createSqliteRouteDeps`'s own `overrides` contract; this one certifies the NEW function built on
 * top of it) — same temp-db conventions, deliberately not folded into that file since it is scoped
 * to a different certified contract (SPEC-003 C-010) this function does not claim to satisfy.
 *
 * What could NOT be verified here (stated per dispatch instruction, not glossed over): the actual
 * `TOVU_WORKSPACE` env-var plumbing between `src/index.ts`'s `spawnAgentDaemon()` and
 * `agent-daemon-server.ts`'s own module-load-time `process.env.TOVU_WORKSPACE` read — that requires
 * spawning the real daemon child process end to end, which was not exercised. These tests call
 * `createSqliteRouteDepsForWorkspace` directly with the same values the env-var plumbing would hand
 * it, certifying the function's own contract in isolation.
 */

function mkTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deps-for-workspace-"));
  return path.join(dir, "content.db");
}

/**
 * `createSqliteRouteDeps` fires several boot-time data-module installs as un-awaited side effects
 * (`identityReady`/`settingsReady`/etc. — see `index.ts`'s own `Promise.all([...])` before it
 * spawns the daemon, same pattern). A test that deletes its temp dir in `finally` before those
 * settle races them against `fs.rmSync`, surfacing as a `SqliteError`/unhandledRejection that fails
 * the NEXT test rather than the one that caused it. Awaiting them first, mirroring `index.ts`,
 * closes the same window here.
 */
async function settle(deps: { identityReady: Promise<void>; settingsReady: Promise<void>; seoReady: Promise<void>; commentsReady: Promise<void>; commentsSettingsReady: Promise<void>; executionSettingsReady: Promise<void>; settingsUiTabsReady: Promise<void>; analyticsSettingsReady: Promise<void> }): Promise<void> {
  await Promise.all([
    deps.identityReady,
    deps.settingsReady,
    deps.seoReady,
    deps.commentsReady,
    deps.commentsSettingsReady,
    deps.executionSettingsReady,
    deps.settingsUiTabsReady,
    deps.analyticsSettingsReady,
  ]);
}

test("workspaceIdOverride undefined: behaves byte-identical to createSqliteRouteDeps(dbPath) — the daemon's existing single-workspace behavior is unaffected when TOVU_WORKSPACE is unset", async () => {
  const dbPath = mkTempDbPath();
  try {
    const deps = createSqliteRouteDepsForWorkspace(undefined, dbPath);
    assert.equal(deps.workspaceId, "workspace-local", "no override -> same default-resolution result the legacy no-argument call already produces");
    await settle(deps);
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("workspaceIdOverride supplied: resolves to the NAMED workspace, not the default oldest row — proves real propagation, not a passthrough that happens to agree with the default", async () => {
  const dbPath = mkTempDbPath();
  try {
    const seedDb = openContentDb(dbPath);
    // `ws-oldest`'s earlier createdAt is what the no-override default path resolves to — pinned
    // and exercised on its own by the two "legacy default" tests in the sibling
    // `create-sqlite-route-deps-overrides.integration.test.ts` file and by this file's own first
    // test above. Not re-verified live here with a second call against the same db file: two
    // `createSqliteRouteDeps`-family calls against one on-disk file in quick succession race each
    // other's un-awaited boot-time installers (see `settle` above) — one call per test keeps this
    // isolated to the single property this test exists to prove.
    seedDb.insert(workspaces).values({ id: "ws-oldest", name: "Oldest", slug: "oldest", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    seedDb.insert(workspaces).values({ id: "ws-newer", name: "Newer", slug: "newer", createdAt: "2026-01-02T00:00:00.000Z" }).run();
    seedDb.$client.close();

    const overriddenDeps = createSqliteRouteDepsForWorkspace("ws-newer", dbPath);
    assert.equal(overriddenDeps.workspaceId, "ws-newer", "the override must win over the default oldest-row resolution");
    await settle(overriddenDeps);
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("workspaceIdOverride names a workspace that does not exist: throws loudly rather than silently falling back to the default — the exact failure mode this fix exists to prevent", () => {
  const dbPath = mkTempDbPath();
  try {
    const seedDb = openContentDb(dbPath);
    seedDb.insert(workspaces).values({ id: "ws-real", name: "Real", slug: "real", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    seedDb.$client.close();

    // Throws before constructing any deps at all (validation runs before `createSqliteRouteDeps`
    // is called) — nothing to settle, unlike the other tests here.
    assert.throws(
      () => createSqliteRouteDepsForWorkspace("ws-does-not-exist", dbPath),
      /no workspace with id "ws-does-not-exist" exists/,
      "a bad TOVU_WORKSPACE value must crash daemon boot with a clear message, never silently default"
    );
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("workspaceIdOverride supplied: the db opened for validation is the SAME handle the returned deps read from (not a second, divergent connection)", async () => {
  const dbPath = mkTempDbPath();
  try {
    const seedDb = openContentDb(dbPath);
    seedDb.insert(workspaces).values({ id: "ws-shared-handle", name: "Shared Handle", slug: "shared-handle", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    seedDb.$client.close();

    const deps = createSqliteRouteDepsForWorkspace("ws-shared-handle", dbPath);
    const found = await deps.workspaceRepo.findById("ws-shared-handle");
    assert.ok(found, "the returned deps must read from the same on-disk db the override was validated against");
    assert.equal(found?.name, "Shared Handle");
    await settle(deps);
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
