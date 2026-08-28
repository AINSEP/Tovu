import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { seedDevCapabilityOrigin, SqliteOriginSettingRepo } from "../../../platform/db/sqlite/origin-repo.sqlite.js";
import { InMemoryOriginSettingRepo } from "../repo.memory.js";
import { createVerifiedOrigin } from "../types.js";
import type { OriginSettingRepoPort } from "../ports.js";

/**
 * @file ADR-046 Phase 1 — shared `OriginSettingRepoPort` read-contract suite, run against BOTH
 * `repo.memory.ts` and `db/sqlite/origin-repo.sqlite.ts` (rule-of-two, ADR-006).
 *
 * Unlike every other rule-of-two suite in this codebase, the two adapters' WRITE paths are not
 * symmetric — `OriginSettingRepoPort` itself declares no write method (no admin route or
 * verification flow exists yet, see `origin-repo.sqlite.ts`'s file header); the in-memory adapter
 * seeds via its constructor, the SQLite adapter via the standalone `seedDevCapabilityOrigin`
 * function. `runContractSuite` therefore takes an ALREADY-SEEDED repo factory rather than seeding
 * internally, so the shared assertions stay identical while each adapter is seeded its own way.
 */

const WORKSPACE_ID = "workspace-1";

function seedOrigin() {
  return createVerifiedOrigin({
    scheme: "https",
    host: "example.com",
    verifiedAt: "2026-07-16T00:00:00.000Z",
    source: "workspace-setting",
  });
}

function runContractSuite(label: string, makeSeededRepo: () => OriginSettingRepoPort, makeEmptyRepo: () => OriginSettingRepoPort) {
  test(`[${label}] findByWorkspaceId returns null when nothing is registered`, async () => {
    assert.equal(await makeEmptyRepo().findByWorkspaceId(WORKSPACE_ID), null);
  });

  test(`[${label}] findByWorkspaceId returns the registered origin`, async () => {
    const found = await makeSeededRepo().findByWorkspaceId(WORKSPACE_ID);
    assert.deepEqual(found, seedOrigin());
  });

  test(`[${label}] findRedirectAllowlist/findEgressAllowlist return the registered lists, normalized`, async () => {
    const repo = makeSeededRepo();
    assert.deepEqual(await repo.findRedirectAllowlist(WORKSPACE_ID), ["allowed.example"]);
    assert.deepEqual(await repo.findEgressAllowlist(WORKSPACE_ID), ["api.example.com"]);
  });

  test(`[${label}] findRedirectAllowlist/findEgressAllowlist return [] for an unregistered workspace`, async () => {
    const repo = makeEmptyRepo();
    assert.deepEqual(await repo.findRedirectAllowlist(WORKSPACE_ID), []);
    assert.deepEqual(await repo.findEgressAllowlist(WORKSPACE_ID), []);
  });
}

runContractSuite(
  "memory",
  () =>
    new InMemoryOriginSettingRepo([
      { workspaceId: WORKSPACE_ID, origin: seedOrigin(), redirectAllowlist: ["Allowed.example"], egressAllowlist: ["api.example.com"] },
    ]),
  () => new InMemoryOriginSettingRepo([])
);

runContractSuite(
  "sqlite",
  () => {
    const db = openContentDb(":memory:");
    seedDevCapabilityOrigin({ db, seed: { workspaceId: WORKSPACE_ID, origin: seedOrigin(), redirectAllowlist: ["Allowed.example"], egressAllowlist: ["api.example.com"] } });
    return new SqliteOriginSettingRepo(db);
  },
  () => new SqliteOriginSettingRepo(openContentDb(":memory:"))
);

test("[sqlite] seedDevCapabilityOrigin is idempotent — a second call never overwrites an existing row", async () => {
  const db = openContentDb(":memory:");
  seedDevCapabilityOrigin({ db, seed: { workspaceId: WORKSPACE_ID, origin: seedOrigin() } });

  // A different candidate origin — must NOT clobber the first seed (protects a future real
  // verification flow's write from being silently overwritten by a re-run of this boot seed).
  seedDevCapabilityOrigin({ db, seed: {
    workspaceId: WORKSPACE_ID,
    origin: createVerifiedOrigin({ scheme: "http", host: "some-other-host", verifiedAt: "2099-01-01T00:00:00.000Z", source: "dev-capability" }),
  } });

  const repo = new SqliteOriginSettingRepo(db);
  const found = await repo.findByWorkspaceId(WORKSPACE_ID);
  assert.equal(found?.host, "example.com", "the original seed must survive a second seed call");
});

test("ADR-046 Phase 1: SqliteOriginSettingRepo persists across a simulated process restart (real on-disk file, fresh repo instance)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-origin-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const db1 = openContentDb(dbPath);
    seedDevCapabilityOrigin({ db: db1, seed: { workspaceId: WORKSPACE_ID, origin: seedOrigin(), egressAllowlist: ["api.example.com"] } });

    // "Restart": a brand-new content.db handle + a brand-new repo instance against the SAME
    // on-disk file — the in-memory adapter this replaces would have re-seeded from scratch
    // (behaviorally similar today since it's a hardcoded dev-capability seed, but a future real
    // verified origin would have been lost entirely).
    const db2 = openContentDb(dbPath);
    const repo2 = new SqliteOriginSettingRepo(db2);
    const found = await repo2.findByWorkspaceId(WORKSPACE_ID);
    assert.ok(found, "the origin must survive a restart");
    assert.equal(found?.host, "example.com");
    assert.deepEqual(await repo2.findEgressAllowlist(WORKSPACE_ID), ["api.example.com"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
