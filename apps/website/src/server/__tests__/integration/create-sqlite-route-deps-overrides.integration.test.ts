import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { workspaces } from "#src/platform/db/schema.sqlite";

/**
 * @file SPEC-003 C-010 (`createSiteRouteDeps`, changed signature) — TDD certification,
 * integration tier.
 *
 * Traces: REQ-06, REQ-10, AC-08, AC-09, AC-13, and CIC U-001 (Workspace-id single-source-of-truth
 * in `createSiteRouteDeps`) Binding constraint U-001-B2 (the existing test suite's assertions
 * against `workspaceId === "workspace-local"` must remain true with zero test-file changes).
 *
 * `createSiteRouteDeps` TODAY (pre-Programmer) still has its OLD single-parameter signature
 * (`(dbPath?: string)`) and hardcodes `seededWorkspace.id` internally — this file is expected to
 * fail (either at compile time, once the `overrides` parameter is referenced against the old
 * signature, or at assertion time against the old hardcoded-literal behavior) until Programmer
 * implements the additive `overrides` parameter + `resolveWorkspace`-backed resolution
 * (tasks.md T004). Correct TDD state — this is Phase 1's certified regression + contract suite.
 *
 * U-001-B1 (the audit-only grep check that zero `seededWorkspace.id` literals remain inside the
 * function body outside the one `resolveWorkspace` call site) is explicitly NOT asserted here —
 * per `critical-internal-constraints.md`'s own Verification Surface column, U-001-B1 is
 * `audit-only: structural review`, a Code Review Agent responsibility, not a TDD assertion
 * (`critical-internal-constraints/SKILL.md`'s audit-only exclusion rule).
 *
 * U-001-B2's OWN verification surface is "the existing test suite passes with zero test-file
 * changes" — that is an operational fact TestRunner confirms post-implementation by running the
 * five untouched suites named in ADR-PIPE-003's Migration Safety table
 * (`database-migration-reconciliation-boot.integration.test.ts`,
 * `boot-lifecycle-real-deps.integration.test.ts`, `settings-principal-check.test.ts`,
 * `settings-register-definitions-op-validation.test.ts`, `newsletter-routes.test.ts`) plus
 * `src/index.ts`'s legacy call site, not something this NEW file can itself prove by inspection.
 * This file adds fresh, independent regression + contract coverage for the SAME property.
 */

/**
 * F1833: settles every readiness promise the composition started — including the detached boot tail
 * (`legacyPublishCredentialsReady`) — so no boot step is still reading the store when a test deletes
 * the directory under it. allSettled: a failing step is that step's own test's business, and a
 * rejection here would mask the assertion that actually failed.
 */
async function settleBoot(deps: object | undefined): Promise<void> {
  if (deps === undefined) return;
  await Promise.allSettled(Object.entries(deps).filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise).map(([, value]) => value));
}

function mkTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deps-overrides-"));
  return path.join(dir, "content.db");
}

test("legacy default path (no overrides): createSiteRouteDeps(dbPath) still resolves workspaceId to \"workspace-local\" — REQ-10/AC-13 byte-for-byte parity", async () => {
  const dbPath = mkTempDbPath();
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  try {
    deps = await createSiteRouteDeps(dbPath);
    assert.equal(deps.workspaceId, "workspace-local", "the additive signature change must not alter the legacy default path's resolved workspace id");
  } finally {
    await settleBoot(deps);
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("legacy default path with no dbPath argument at all also still resolves workspaceId to \"workspace-local\" (mirrors src/index.ts's own zero-argument call) — routed via TOVU_CONTENT_DB to a temp dir so this test never touches the real repo cwd", async () => {
  const dbPath = mkTempDbPath();
  const originalEnv = process.env.TOVU_CONTENT_DB;
  process.env.TOVU_CONTENT_DB = dbPath;
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  try {
    deps = await createSiteRouteDeps();
    assert.equal(deps.workspaceId, "workspace-local");
  } finally {
    await settleBoot(deps);
    if (originalEnv === undefined) delete process.env.TOVU_CONTENT_DB;
    else process.env.TOVU_CONTENT_DB = originalEnv;
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("new overrides path: a pre-opened db + explicit workspaceId is honored verbatim, and the EXACT SAME db handle is reused (not a second db opened)", async () => {
  // A ':memory:' db is a fresh, wholly isolated instance per open — if createSiteRouteDeps
  // incorrectly opened its OWN second db instead of reusing `overrides.db`, this pre-inserted row
  // (which lives ONLY in this exact in-memory instance) would be invisible through `deps`.
  const db = openContentDb(":memory:");
  const customWorkspaceId = "custom-override-workspace";
  db.insert(workspaces).values({ id: customWorkspaceId, name: "Custom Override", slug: "custom-override", createdAt: "2026-07-28T00:00:00.000Z" }).run();

  const deps = await createSiteRouteDeps(undefined, { db, workspaceId: customWorkspaceId });

  assert.equal(deps.workspaceId, customWorkspaceId, "REQ-06: the override's workspaceId must be honored verbatim, not the legacy literal");

  const found = await deps.workspaceRepo.findById({ id: customWorkspaceId });
  assert.ok(found, "the SAME db handle passed in overrides.db must be the one deps' repos read from — a fresh second db would not see this pre-inserted row");
  assert.equal(found?.name, "Custom Override");

  // Reinforce "same handle" with a SECOND, POST-construction write directly on the original `db`
  // object — if `deps` held a different (even if structurally similar) handle, this would not
  // be visible through `deps.workspaceRepo`.
  const secondId = "custom-override-workspace-2";
  db.insert(workspaces).values({ id: secondId, name: "Second", slug: "second-override", createdAt: "2026-07-28T00:00:01.000Z" }).run();
  const foundSecond = await deps.workspaceRepo.findById({ id: secondId });
  assert.ok(foundSecond, "a row inserted directly via the original db object after construction must be visible through deps' repo — proving deps and the caller share the identical handle");
});

test("overrides.themesDir is honored verbatim — the install-dir-relative themes root `tovu serve <dir>` needs, not the process.cwd()-relative default (CR-R01)", async () => {
  const dbPath = mkTempDbPath();
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deps-themes-override-"));
  try {
    const themeDir = path.join(themesDir, "templated", "override-only");
    fs.mkdirSync(path.join(themeDir, "templates"), { recursive: true });
    fs.writeFileSync(path.join(themeDir, "theme.json"), JSON.stringify({ id: "override-only", name: "Override Only", version: "1.0.0", tier: "templated", engine: 1 }));
    fs.writeFileSync(path.join(themeDir, "tokens.json"), "{}");
    fs.writeFileSync(path.join(themeDir, "templates/home.liquid"), "Override home");
    fs.writeFileSync(path.join(themeDir, "templates/entry.liquid"), "Override entry");
    const deps = await createSiteRouteDeps(dbPath, { themesDir });
    assert.equal(deps.themesDir, themesDir, "overrides.themesDir must be honored verbatim, not the process.cwd()-relative siteThemesDir() default");
    const discovered = deps.themes.find((theme) => theme.manifest.id === "override-only");
    assert.ok(discovered, "the override directory must be scanned");
    assert.equal(discovered.status, "valid");
    assert.equal(discovered.liquidTemplates.home, "Override home");
    assert.equal(discovered.liquidTemplates.entry, "Override entry");
    await Promise.all(Object.entries(deps).filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise).map(([, value]) => value));
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    fs.rmSync(themesDir, { recursive: true, force: true });
  }
});

test("overrides.db supplied without overrides.workspaceId -> throws (must be supplied together or not at all)", async () => {
  const db = openContentDb(":memory:");
  await assert.rejects(
    () => createSiteRouteDeps(undefined, { db }),
    /overrides/i,
    "Contract Map C-010: overrides.db and overrides.workspaceId must be supplied together or not at all"
  );
});

test("overrides.workspaceId supplied without overrides.db -> throws (must be supplied together or not at all)", async () => {
  await assert.rejects(
    () => createSiteRouteDeps(undefined, { workspaceId: "some-id" }),
    /overrides/i,
    "Contract Map C-010: overrides.db and overrides.workspaceId must be supplied together or not at all"
  );
});

test("B1 regression: legacy default path (no overrides) with a pre-existing 2nd workspace row resolves to the OLDEST instead of throwing (boot-bricking regression)", async () => {
  const dbPath = mkTempDbPath();
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  try {
    const seedDb = openContentDb(dbPath);
    seedDb.insert(workspaces).values({ id: "ws-original", name: "Original", slug: "original", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    seedDb.insert(workspaces).values({ id: "ws-added-later", name: "Added Later", slug: "added-later", createdAt: "2026-01-02T00:00:00.000Z" }).run();
    seedDb.$client.close();

    deps = await createSiteRouteDeps(dbPath);
    assert.equal(deps.workspaceId, "ws-original", "the oldest pre-existing row must win — this must not throw SiteCorruptError (B1)");
  } finally {
    await settleBoot(deps);
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("F1833: legacyPublishCredentialsReady settles only after the owner's legacy publish-credential copy has finished", async () => {
  const dbPath = mkTempDbPath();
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  try {
    deps = await createSiteRouteDeps(dbPath);
    assert.ok(deps.legacyPublishCredentialsReady instanceof Promise, "the real SQLite composition must expose its boot tail");
    // The copy reads `loadDeployTargets` off routeDeps when it starts, which is after every boot
    // writer settles — later than this line. A deliberately slow stand-in marks when the copy's
    // first step has actually finished, not merely begun.
    const original = deps.loadDeployTargets;
    let copyStepFinished = false;
    deps.loadDeployTargets = async (workspaceId) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const registry = await original(workspaceId);
      copyStepFinished = true;
      return registry;
    };
    await deps.legacyPublishCredentialsReady;
    assert.equal(copyStepFinished, true, "legacyPublishCredentialsReady resolved while copyLegacyPublishCredentialsAtBoot was still running");
  } finally {
    await settleBoot(deps);
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
