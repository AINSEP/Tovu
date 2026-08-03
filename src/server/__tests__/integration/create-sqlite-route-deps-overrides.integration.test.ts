import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSqliteRouteDeps } from "../../deps";
import { openContentDb } from "../../../db/sqlite/content-db";
import { workspaces } from "../../../db/schema";

/**
 * @file SPEC-003 C-010 (`createSqliteRouteDeps`, changed signature) — TDD certification,
 * integration tier.
 *
 * Traces: REQ-06, REQ-10, AC-08, AC-09, AC-13, and CIC U-001 (Workspace-id single-source-of-truth
 * in `createSqliteRouteDeps`) Binding constraint U-001-B2 (the existing test suite's assertions
 * against `workspaceId === "workspace-local"` must remain true with zero test-file changes).
 *
 * `createSqliteRouteDeps` TODAY (pre-Programmer) still has its OLD single-parameter signature
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

function mkTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deps-overrides-"));
  return path.join(dir, "content.db");
}

test("legacy default path (no overrides): createSqliteRouteDeps(dbPath) still resolves workspaceId to \"workspace-local\" — REQ-10/AC-13 byte-for-byte parity", () => {
  const dbPath = mkTempDbPath();
  try {
    const deps = createSqliteRouteDeps(dbPath);
    assert.equal(deps.workspaceId, "workspace-local", "the additive signature change must not alter the legacy default path's resolved workspace id");
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("legacy default path with no dbPath argument at all also still resolves workspaceId to \"workspace-local\" (mirrors src/index.ts's own zero-argument call) — routed via TOVU_CONTENT_DB to a temp dir so this test never touches the real repo cwd", () => {
  const dbPath = mkTempDbPath();
  const originalEnv = process.env.TOVU_CONTENT_DB;
  process.env.TOVU_CONTENT_DB = dbPath;
  try {
    const deps = createSqliteRouteDeps();
    assert.equal(deps.workspaceId, "workspace-local");
  } finally {
    if (originalEnv === undefined) delete process.env.TOVU_CONTENT_DB;
    else process.env.TOVU_CONTENT_DB = originalEnv;
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test("new overrides path: a pre-opened db + explicit workspaceId is honored verbatim, and the EXACT SAME db handle is reused (not a second db opened)", async () => {
  // A ':memory:' db is a fresh, wholly isolated instance per open — if createSqliteRouteDeps
  // incorrectly opened its OWN second db instead of reusing `overrides.db`, this pre-inserted row
  // (which lives ONLY in this exact in-memory instance) would be invisible through `deps`.
  const db = openContentDb(":memory:");
  const customWorkspaceId = "custom-override-workspace";
  db.insert(workspaces).values({ id: customWorkspaceId, name: "Custom Override", slug: "custom-override", createdAt: "2026-07-28T00:00:00.000Z" }).run();

  const deps = createSqliteRouteDeps(undefined, { db, workspaceId: customWorkspaceId });

  assert.equal(deps.workspaceId, customWorkspaceId, "REQ-06: the override's workspaceId must be honored verbatim, not the legacy literal");

  const found = await deps.workspaceRepo.findById(customWorkspaceId);
  assert.ok(found, "the SAME db handle passed in overrides.db must be the one deps' repos read from — a fresh second db would not see this pre-inserted row");
  assert.equal(found?.name, "Custom Override");

  // Reinforce "same handle" with a SECOND, POST-construction write directly on the original `db`
  // object — if `deps` held a different (even if structurally similar) handle, this would not
  // be visible through `deps.workspaceRepo`.
  const secondId = "custom-override-workspace-2";
  db.insert(workspaces).values({ id: secondId, name: "Second", slug: "second-override", createdAt: "2026-07-28T00:00:01.000Z" }).run();
  const foundSecond = await deps.workspaceRepo.findById(secondId);
  assert.ok(foundSecond, "a row inserted directly via the original db object after construction must be visible through deps' repo — proving deps and the caller share the identical handle");
});

test("overrides.db supplied without overrides.workspaceId -> throws (must be supplied together or not at all)", () => {
  const db = openContentDb(":memory:");
  assert.throws(
    () => createSqliteRouteDeps(undefined, { db }),
    /overrides/i,
    "Contract Map C-010: overrides.db and overrides.workspaceId must be supplied together or not at all"
  );
});

test("overrides.workspaceId supplied without overrides.db -> throws (must be supplied together or not at all)", () => {
  assert.throws(
    () => createSqliteRouteDeps(undefined, { workspaceId: "some-id" }),
    /overrides/i,
    "Contract Map C-010: overrides.db and overrides.workspaceId must be supplied together or not at all"
  );
});

test("B1 regression: legacy default path (no overrides) with a pre-existing 2nd workspace row resolves to the OLDEST instead of throwing (boot-bricking regression)", () => {
  const dbPath = mkTempDbPath();
  try {
    const seedDb = openContentDb(dbPath);
    seedDb.insert(workspaces).values({ id: "ws-original", name: "Original", slug: "original", createdAt: "2026-01-01T00:00:00.000Z" }).run();
    seedDb.insert(workspaces).values({ id: "ws-added-later", name: "Added Later", slug: "added-later", createdAt: "2026-01-02T00:00:00.000Z" }).run();
    seedDb.$client.close();

    const deps = createSqliteRouteDeps(dbPath);
    assert.equal(deps.workspaceId, "ws-original", "the oldest pre-existing row must win — this must not throw SiteCorruptError (B1)");
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
