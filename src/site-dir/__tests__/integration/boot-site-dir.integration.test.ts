import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "../../../infra/sqlite/content-db";
import { workspaces } from "../../../infra/db/schema";
import { runtimeSchemaVersion } from "../../schema-guard";
import { bootSiteDir } from "../../boot-site-dir";

/**
 * @file SPEC-003 C-008 (`bootSiteDir`) — TDD certification, integration tier.
 *
 * Traces: REQ-05, REQ-06, BR-05, BR-06, INV-04, INV-05, RT-005, AC-06, AC-07, AC-08, AC-09,
 * EC-05, EC-07, EC-09, and CIC U-002 (Schema guard comparison + atomic stamp write) Binding
 * constraints U-002-B1/B2/B3 and Required Ordering U-002-ORD1/ORD2.
 *
 * `bootSiteDir` does not exist yet — expected to fail to compile/run until Programmer implements
 * `src/site-dir/boot-site-dir.ts` (tasks.md T016). Correct TDD state.
 *
 * Fixtures below build the on-disk install dir directly with the EXISTING, already-real
 * `openContentDb` (not `initSite`, which is a separate not-yet-implemented unit under test
 * elsewhere) — `openContentDb` always migrates its target db to the runtime's CURRENT latest
 * schema when opened (Drizzle's `migrate()` is unconditional and idempotent), so an "older site"
 * fixture is modeled the same way ADR-PIPE-003's own Data Consistency scorecard describes real
 * crash-safety: the STAMP FILE can legitimately claim an older version than a db that is, in
 * fact, already fully current — `migrate()` on such a db is a safe no-op, exactly mirroring a
 * real "site was migrated once already, boot again" scenario.
 */

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
const SKIP_PERMISSION_TESTS = process.platform === "win32" || IS_ROOT;
const SKIP_REASON = process.platform === "win32"
  ? "POSIX chmod fault injection is not portable to win32"
  : "running as root bypasses POSIX permission checks, making this fault injection a false pass";

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-boot-site-dir-"));
}

function buildFixtureDir(opts: {
  configName?: string;
  metaOverrides?: Record<string, unknown>;
  workspaceRows?: Array<{ id: string; name: string; slug: string; createdAt: string }>;
} = {}): string {
  const dir = mkTempDir();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: opts.configName ?? "Fixture Site", domain: null, port: null }));

  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  const rows = opts.workspaceRows ?? [{ id: "ws-fixture", name: "Fixture", slug: "fixture", createdAt: "2026-01-01T00:00:00.000Z" }];
  for (const row of rows) {
    db.insert(workspaces).values(row).run();
  }
  db.$client.close();

  const runtime = runtimeSchemaVersion();
  const meta = {
    siteId: "22222222-2222-2222-2222-222222222222",
    templateId: "starter",
    templateVersion: "1.0.0",
    schemaVersion: runtime.index,
    schemaTag: runtime.tag,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts.metaOverrides,
  };
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(meta));
  return dir;
}

test("AC-08/REQ-06: bootSiteDir resolves workspaceId to the db's single actual row", () => {
  const dir = buildFixtureDir({ workspaceRows: [{ id: "the-one-workspace", name: "Only", slug: "only", createdAt: "2026-01-01T00:00:00.000Z" }] });
  try {
    const result = bootSiteDir({ dir });
    assert.equal(result.workspaceId, "the-one-workspace");
    assert.equal(result.config.name, "Fixture Site");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B1: bootSiteDir with 2 workspace rows succeeds and resolves to the OLDEST by default (no more boot-bricking on a legitimately multi-workspace install)", () => {
  const dir = buildFixtureDir({
    workspaceRows: [
      { id: "ws-newer", name: "Newer", slug: "newer", createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "ws-older", name: "Older", slug: "older", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
  });
  try {
    const result = bootSiteDir({ dir });
    assert.equal(result.workspaceId, "ws-older", "with no explicit selection, the oldest workspace must win");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B1: bootSiteDir({ dir }, { workspaceId }) resolves to the explicitly named workspace even when it is not the oldest", () => {
  const dir = buildFixtureDir({
    workspaceRows: [
      { id: "ws-older", name: "Older", slug: "older", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "ws-newer", name: "Newer", slug: "newer", createdAt: "2026-01-02T00:00:00.000Z" },
    ],
  });
  try {
    const result = bootSiteDir({ dir }, { workspaceId: "ws-newer" });
    assert.equal(result.workspaceId, "ws-newer");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B1: bootSiteDir({ dir }, { workspaceId }) throws ValidationError when the id matches no workspace row", () => {
  const dir = buildFixtureDir();
  try {
    assert.throws(
      () => bootSiteDir({ dir }, { workspaceId: "does-not-exist" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "ValidationError");
        return true;
      }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-09/REQ-06: zero workspace rows -> SiteCorruptError", () => {
  const dir = buildFixtureDir({ workspaceRows: [] });
  try {
    assert.throws(
      () => bootSiteDir({ dir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "SiteCorruptError");
        return true;
      }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-06: site schemaVersion greater than the runtime's -> SiteNewerThanRuntimeError, content.db is not written", () => {
  const runtime = runtimeSchemaVersion();
  const dir = buildFixtureDir({ metaOverrides: { schemaVersion: runtime.index + 1, schemaTag: "a-future-tag" } });
  const dbPath = path.join(dir, "content.db");
  const statBefore = fs.statSync(dbPath);
  try {
    assert.throws(
      () => bootSiteDir({ dir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "SiteNewerThanRuntimeError");
        return true;
      }
    );
    const statAfter = fs.statSync(dbPath);
    assert.equal(statAfter.mtimeMs, statBefore.mtimeMs, "AC-06: content.db must not be written when the site is newer than the runtime");
    assert.equal(statAfter.size, statBefore.size);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("RT-005/U-002-B1: equal schemaVersion index but a DIVERGENT schemaTag -> SiteNewerThanRuntimeError (not treated as compatible)", () => {
  const runtime = runtimeSchemaVersion();
  const dir = buildFixtureDir({ metaOverrides: { schemaVersion: runtime.index, schemaTag: `${runtime.tag}-forked` } });
  try {
    assert.throws(
      () => bootSiteDir({ dir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "SiteNewerThanRuntimeError");
        return true;
      }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-07/INV-05: an older schemaVersion migrates forward, both schemaVersion+schemaTag are bumped together, and a follow-up serve of the now-current site passes the guard cleanly (round-trip)", () => {
  const runtime = runtimeSchemaVersion();
  assert.ok(runtime.index > 0, "fixture assumption: at least 2 bundled migrations exist");
  const dir = buildFixtureDir({ metaOverrides: { schemaVersion: runtime.index - 1, schemaTag: "an-older-tag" } });
  try {
    const first = bootSiteDir({ dir });
    assert.equal(first.workspaceId, "ws-fixture");

    const metaAfterFirst = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
    assert.equal(metaAfterFirst.schemaVersion, runtime.index, "BR-06: schemaVersion must be bumped to the runtime's after a successful migration");
    assert.equal(metaAfterFirst.schemaTag, runtime.tag, "BR-06: schemaTag must be bumped together with schemaVersion, not left stale");

    // INV-05/AC-07 round trip: re-serving the now-current site with the same runtime must not
    // falsely trip SiteNewerThanRuntimeError.
    const second = bootSiteDir({ dir });
    assert.equal(second.workspaceId, "ws-fixture");
    const metaAfterSecond = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
    assert.equal(metaAfterSecond.schemaVersion, runtime.index);
    assert.equal(metaAfterSecond.schemaTag, runtime.tag);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("EC-07: an unknown .site-meta.json.templateId does not block serving — it is provenance only, and a warning is logged", () => {
  const dir = buildFixtureDir({ metaOverrides: { templateId: "some-unknown-template-id" } });
  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };
  try {
    const result = bootSiteDir({ dir });
    assert.equal(result.workspaceId, "ws-fixture", "EC-07: serve must still succeed despite the unknown templateId");
    assert.ok(warnCalls.length > 0, "EC-07: a warning must be logged for an unknown templateId");
    assert.ok(
      warnCalls.some((args) => args.some((a) => typeof a === "string" && a.includes("some-unknown-template-id"))),
      "the warning should name the unrecognized templateId"
    );
  } finally {
    console.warn = originalWarn;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("EC-05: content.db locked by another process -> SiteCorruptError-class failure naming the lock cause", () => {
  const dir = buildFixtureDir();
  const dbPath = path.join(dir, "content.db");

  // Hold a real OS-level exclusive lock from a second, independent connection — WAL mode
  // deliberately lets readers and writers coexist, so a plain `BEGIN EXCLUSIVE` transaction is
  // NOT sufficient to block another connection's reads under WAL; `locking_mode = EXCLUSIVE`
  // is the reliable way to force a genuine SQLITE_BUSY/CANTOPEN for a second connection — a real
  // lock condition, not a mock, matching this repo's stated mock-preference order (real > fake).
  const locker = new Database(dbPath);
  locker.pragma("journal_mode = WAL");
  locker.pragma("locking_mode = EXCLUSIVE");
  // `locking_mode = EXCLUSIVE` only takes the write lock on the connection's first real PAGE
  // access, and never releases it until the connection closes. A statement that touches no table
  // (`SELECT 1`) never reaches a page, so it leaves the db effectively unlocked and this whole
  // scenario vacuous. This no-op UPDATE is a genuine page write — it acquires the lock for real —
  // while leaving the fixture's exactly-one workspace row byte-identical, so a failure to lock
  // surfaces as `bootSiteDir` succeeding (test fails loudly) rather than as an unrelated
  // multiple-rows SiteCorruptError (test passing for the wrong reason).
  locker.prepare("UPDATE workspaces SET name = name").run();
  try {
    assert.throws(
      () => bootSiteDir({ dir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "SiteCorruptError");
        assert.match(
          (err as Error).message,
          /lock/i,
          "EC-05/RT-002: the failure must name the lock as the cause, not merely be SiteCorrupt-classed"
        );
        return true;
      }
    );
  } finally {
    locker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("U-002-B2/U-002-ORD1: when the .site-meta.json stamp write is blocked (dir made read-only after migrate()-worthy content already exists), the OLD stamp survives byte-for-byte unchanged — never a torn write — and a later retry completes cleanly with both fields bumped together", { skip: SKIP_PERMISSION_TESTS && SKIP_REASON }, () => {
  const runtime = runtimeSchemaVersion();
  assert.ok(runtime.index > 0);
  const dir = buildFixtureDir({ metaOverrides: { schemaVersion: runtime.index - 1, schemaTag: "an-older-tag" } });
  const metaPath = path.join(dir, ".site-meta.json");
  const originalMetaText = fs.readFileSync(metaPath, "utf8");

  fs.chmodSync(dir, 0o555); // blocks creating the temp file the atomic rename needs; content.db's OWN bytes remain writable (its permission bits are untouched by the dir's mode)
  try {
    assert.throws(() => bootSiteDir({ dir }), "the stamp write must fail when the containing directory cannot accept a new temp-file entry");
    fs.chmodSync(dir, 0o755); // restore before reading, in case the impl left a lingering handle
    const metaAfterFailedAttempt = fs.readFileSync(metaPath, "utf8");
    assert.equal(metaAfterFailedAttempt, originalMetaText, "U-002-ORD1: the stamp must be left completely unchanged (old version) — never partially bumped");
  } finally {
    fs.chmodSync(dir, 0o755);
  }

  // Retry now that the dir is writable — Drizzle's migrate() is idempotent (ADR-015's
  // __drizzle_migrations journal), so re-running bootSiteDir must succeed cleanly and bump both
  // fields together this time.
  try {
    const result = bootSiteDir({ dir });
    assert.equal(result.workspaceId, "ws-fixture");
    const metaAfterRetry = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    assert.equal(metaAfterRetry.schemaVersion, runtime.index);
    assert.equal(metaAfterRetry.schemaTag, runtime.tag);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
