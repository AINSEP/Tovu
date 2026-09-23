import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { sessions } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { isClearlyStaleSession, partitionStaleSessions, type SessionRow } from "../cleanup-stale-owner-sessions.js";

/**
 * @file Certifies `cleanup-stale-owner-sessions.ts` against a throwaway fixture SQLite database —
 * never a real site db (`content.db`/`sites/*` are live, and migrations auto-apply on open). Two
 * layers: the pure `isClearlyStaleSession`/`partitionStaleSessions` partition rule (no database
 * needed), then the real CLI end-to-end (dry run is read-only, apply deletes only the stale rows
 * and captures a restore point, a second apply is a no-op).
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "cleanup-stale-owner-sessions.ts");
const NOW = "2026-09-06T12:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z"; // expired well before NOW
const FUTURE = "2027-01-01T00:00:00.000Z"; // still unexpired as of NOW

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Runs the real CLI with `node --import tsx`, capturing stdout+stderr even on a non-zero exit — a
 *  refusal (missing db path) exits 1, and the assertions below want the printed message, not the
 *  thrown error, the same pattern `backfill-composio-config-aad.test.ts`'s own `runScript` uses. */
function runCli(args: string[]): string {
  try {
    return execFileSync("node", ["--import", "tsx", SCRIPT, ...args], { cwd: REPO_ROOT, encoding: "utf8" });
  } catch (err) {
    const withOutput = err as { stdout?: string; stderr?: string };
    return `${withOutput.stdout ?? ""}${withOutput.stderr ?? ""}`;
  }
}

function runScript(dbPath: string, extraArgs: string[] = []): string {
  return runCli(["--db", dbPath, ...extraArgs]);
}

function seedRow(overrides: Partial<SessionRow> & { id: string }) {
  return {
    id: overrides.id,
    workspaceId: "workspace-1",
    principalId: overrides.principalId ?? "owner-principal",
    tokenHash: `hash-${overrides.id}`,
    createdAt: PAST,
    expiresAt: overrides.expiresAt ?? FUTURE,
    revokedAt: overrides.revokedAt ?? null,
    ip: null,
    userAgent: null,
  };
}

// ---------------------------------------------------------------------------
// Pure partition rule — no database
// ---------------------------------------------------------------------------

test("isClearlyStaleSession: expired (past its own expiresAt) is stale regardless of revokedAt", () => {
  const row: SessionRow = { id: "s1", principalId: "p1", expiresAt: PAST, revokedAt: null };
  assert.equal(isClearlyStaleSession(row, NOW), true);
});

test("isClearlyStaleSession: an expiresAt exactly equal to now is stale — mirrors validateSession's own `<=` boundary, not `<`", () => {
  const row: SessionRow = { id: "s1", principalId: "p1", expiresAt: NOW, revokedAt: null };
  assert.equal(isClearlyStaleSession(row, NOW), true);
});

test("isClearlyStaleSession: revoked but not yet expired is STILL stale — revocation alone is enough", () => {
  const row: SessionRow = { id: "s1", principalId: "p1", expiresAt: FUTURE, revokedAt: "2026-09-01T00:00:00.000Z" };
  assert.equal(isClearlyStaleSession(row, NOW), true);
});

test("isClearlyStaleSession: unexpired AND unrevoked is live — the one case this script must never delete", () => {
  const row: SessionRow = { id: "s1", principalId: "p1", expiresAt: FUTURE, revokedAt: null };
  assert.equal(isClearlyStaleSession(row, NOW), false);
});

test("partitionStaleSessions: splits a mixed batch into stale/live without reordering or dropping rows", () => {
  const rows: SessionRow[] = [
    { id: "live-1", principalId: "p1", expiresAt: FUTURE, revokedAt: null },
    { id: "expired-1", principalId: "p1", expiresAt: PAST, revokedAt: null },
    { id: "revoked-1", principalId: "p1", expiresAt: FUTURE, revokedAt: PAST },
    { id: "live-2", principalId: "p1", expiresAt: FUTURE, revokedAt: null },
  ];
  const { stale, live } = partitionStaleSessions(rows, NOW);
  assert.deepEqual(stale.map((r) => r.id), ["expired-1", "revoked-1"]);
  assert.deepEqual(live.map((r) => r.id), ["live-1", "live-2"]);
});

// ---------------------------------------------------------------------------
// Real CLI, real (throwaway) SQLite fixture
// ---------------------------------------------------------------------------

test("cleanup-stale-owner-sessions: refuses to run against the default (non-existent) --db path", () => {
  const output = runCli([]);
  assert.match(output, /content database not found at/, "must refuse the default path rather than silently creating an empty db");
  assert.match(output, /infra[/\\]content\.db/, "the default path must be the same non-existent infra/content.db the AAD backfill scripts use");
});

test("cleanup-stale-owner-sessions: dry run is read-only, deletes nothing, lists exactly the stale rows", () => {
  const scratch = tmpDir("cleanup-stale-owner-sessions-");
  const dbPath = path.join(scratch, "content.db");

  const seedDb = openContentDb(dbPath);
  seedDb
    .insert(sessions)
    .values([
      seedRow({ id: "live-1" }),
      seedRow({ id: "expired-1", expiresAt: PAST }),
      seedRow({ id: "revoked-1", revokedAt: PAST }),
      seedRow({ id: "live-2" }),
    ])
    .run();
  seedDb.$client.close();

  const dryRunOutput = runScript(dbPath);
  assert.match(dryRunOutput, /Found 4 total session row\(s\): 2 clearly stale \(expired or revoked\), 2 still live \(untouched\)\./);
  assert.match(dryRunOutput, /DRY RUN: would delete id=expired-1/);
  assert.match(dryRunOutput, /DRY RUN: would delete id=revoked-1/);
  assert.doesNotMatch(dryRunOutput, /would delete id=live-1/);
  assert.doesNotMatch(dryRunOutput, /would delete id=live-2/);
  assert.doesNotMatch(dryRunOutput, /RESTORE POINT CAPTURED/, "a dry run must never capture a restore point");
  assert.doesNotMatch(dryRunOutput, /DELETING:/, "a dry run must never actually delete");

  const afterDryRun = openContentDb(dbPath);
  assert.equal(afterDryRun.select().from(sessions).all().length, 4, "dry run must be genuinely read-only — all 4 rows must still be there");
  afterDryRun.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("cleanup-stale-owner-sessions: --apply captures a restore point, deletes only the stale rows, and is idempotent", () => {
  const scratch = tmpDir("cleanup-stale-owner-sessions-apply-");
  const dbPath = path.join(scratch, "content.db");

  const seedDb = openContentDb(dbPath);
  seedDb
    .insert(sessions)
    .values([
      seedRow({ id: "live-1" }),
      seedRow({ id: "expired-1", expiresAt: PAST }),
      seedRow({ id: "revoked-1", revokedAt: PAST }),
      seedRow({ id: "live-2" }),
    ])
    .run();
  seedDb.$client.close();

  const applyOutput = runScript(dbPath, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, /DELETING: id=expired-1/);
  assert.match(applyOutput, /DELETING: id=revoked-1/);
  assert.match(applyOutput, /Done: 2 row\(s\) deleted\. 4 total before, 2 total after\./);

  const db = openContentDb(dbPath);
  const remaining = db.select().from(sessions).all().map((r) => r.id).sort();
  assert.deepEqual(remaining, ["live-1", "live-2"], "only the two live sessions must survive");
  db.$client.close();

  const secondApplyOutput = runScript(dbPath, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to delete/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/, "nothing pending -> no restore point, same convention as the AAD backfill scripts");

  fs.rmSync(scratch, { recursive: true, force: true });
});
