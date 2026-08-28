import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import { SqliteRedirectRepo } from "../repo.sqlite.js";
import type { RedirectRepoPort } from "../ports.js";
import type { RedirectRecord, RedirectRevision } from "../types.js";

/**
 * @file T007 — shared `RedirectRepoPort` contract-test suite, run against
 * BOTH `repo.memory.ts` and `repo.sqlite.ts` (rule-of-two, ADR-006). Covers
 * rule CRUD (`save`/`tombstone`/`findById`/`list`), the index-backed lookups
 * (`lookupExact`/`lookupLongestPrefix`/`listDynamic`), and
 * `findByFromPattern` (write-time collapse/cycle detection support).
 */

function makeRecord(overrides: Partial<RedirectRecord> = {}): RedirectRecord {
  return {
    id: overrides.id ?? "redirect-1",
    workspaceId: "workspace-1",
    matchType: "exact",
    fromPattern: "/old",
    toTarget: "/new",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "user-1",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function makeRevision(record: RedirectRecord, seq = 1): RedirectRevision {
  return {
    redirectId: record.id,
    workspaceId: record.workspaceId,
    seq,
    state: record,
    tombstoned: false,
    actorId: record.createdByPrincipal,
    recordedAt: record.createdAt,
  };
}

function runContractSuite(label: string, makeRepo: () => RedirectRepoPort) {
  test(`[${label}] save() then findById() round-trips the record`, async () => {
    const repo = makeRepo();
    const record = makeRecord();
    await repo.save({ record, revision: makeRevision(record) });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.ok(found);
    assert.equal(found?.fromPattern, "/old");
    assert.equal(found?.toTarget, "/new");
  });

  test(`[${label}] findById returns null for a different workspace`, async () => {
    const repo = makeRepo();
    const record = makeRecord();
    await repo.save({ record, revision: makeRevision(record) });

    const found = await repo.findById({ workspaceId: "workspace-other", id: record.id });
    assert.equal(found, null);
  });

  test(`[${label}] lookupExact finds an active exact rule by path`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "r-exact", matchType: "exact", fromPattern: "/a" });
    await repo.save({ record, revision: makeRevision(record) });

    const found = await repo.lookupExact({
      workspaceId: "workspace-1",
      path: "/a",
      includeOverrideOnly: false,
    });
    assert.ok(found);
    assert.equal(found?.id, "r-exact");
  });

  test(`[${label}] lookupExact excludes a disabled rule`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "r-disabled", matchType: "exact", fromPattern: "/a", status: "disabled" });
    await repo.save({ record, revision: makeRevision(record) });

    const found = await repo.lookupExact({
      workspaceId: "workspace-1",
      path: "/a",
      includeOverrideOnly: false,
    });
    assert.equal(found, null);
  });

  test(`[${label}] lookupExact with includeOverrideOnly excludes non-override rules`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "r-non-override", matchType: "exact", fromPattern: "/a", override: false });
    await repo.save({ record, revision: makeRevision(record) });

    const found = await repo.lookupExact({
      workspaceId: "workspace-1",
      path: "/a",
      includeOverrideOnly: true,
    });
    assert.equal(found, null);
  });

  test(`[${label}] lookupLongestPrefix picks the longest matching prefix`, async () => {
    const repo = makeRepo();
    const short = makeRecord({ id: "short", matchType: "prefix", fromPattern: "/a" });
    const long = makeRecord({ id: "long", matchType: "prefix", fromPattern: "/a/b" });
    await repo.save({ record: short, revision: makeRevision(short) });
    await repo.save({ record: long, revision: makeRevision(long) });

    const found = await repo.lookupLongestPrefix({
      workspaceId: "workspace-1",
      path: "/a/b/c",
      includeOverrideOnly: false,
    });
    assert.equal(found?.id, "long");
  });

  test(`[${label}] listDynamic returns only active wildcard rules, capped at limit`, async () => {
    const repo = makeRepo();
    for (let i = 0; i < 3; i++) {
      const record = makeRecord({
        id: `wc-${i}`,
        matchType: "wildcard",
        fromPattern: `/wc-${i}/*`,
        toTarget: "/x/$1",
      });
      await repo.save({ record, revision: makeRevision(record) });
    }
    const disabled = makeRecord({ id: "wc-disabled", matchType: "wildcard", fromPattern: "/d/*", status: "disabled" });
    await repo.save({ record: disabled, revision: makeRevision(disabled) });

    const dynamic = await repo.listDynamic({ workspaceId: "workspace-1", includeOverrideOnly: false, limit: 2 });
    assert.equal(dynamic.length, 2);
    assert.ok(dynamic.every((r) => r.status === "active"));
  });

  test(`[${label}] list applies status/source/matchType filters`, async () => {
    const repo = makeRepo();
    const a = makeRecord({ id: "a", matchType: "exact", fromPattern: "/a", source: "manual" });
    const b = makeRecord({ id: "b", matchType: "prefix", fromPattern: "/b", source: "import", status: "disabled" });
    await repo.save({ record: a, revision: makeRevision(a) });
    await repo.save({ record: b, revision: makeRevision(b) });

    const onlyDisabled = await repo.list({ workspaceId: "workspace-1", status: "disabled" });
    assert.deepEqual(onlyDisabled.map((r) => r.id), ["b"]);

    const onlyImport = await repo.list({ workspaceId: "workspace-1", source: "import" });
    assert.deepEqual(onlyImport.map((r) => r.id), ["b"]);

    const onlyPrefix = await repo.list({ workspaceId: "workspace-1", matchType: "prefix" });
    assert.deepEqual(onlyPrefix.map((r) => r.id), ["b"]);

    const all = await repo.list({ workspaceId: "workspace-1" });
    assert.equal(all.length, 2);
  });

  test(`[${label}] findByFromPattern finds an active rule with the given fromPattern`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "chain-a", fromPattern: "/a", toTarget: "/b" });
    await repo.save({ record, revision: makeRevision(record) });

    const found = await repo.findByFromPattern({ workspaceId: "workspace-1", fromPattern: "/a" });
    assert.equal(found?.id, "chain-a");
  });

  test(`[${label}] findByFromPattern returns null when no rule matches`, async () => {
    const repo = makeRepo();
    const found = await repo.findByFromPattern({ workspaceId: "workspace-1", fromPattern: "/none" });
    assert.equal(found, null);
  });

  test(`[${label}] tombstone flips status to disabled and appends the tombstone revision`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "to-tombstone" });
    await repo.save({ record, revision: makeRevision(record) });

    const tombstoned: RedirectRecord = { ...record, status: "disabled", version: 2, updatedAt: "2026-07-14T00:00:00.000Z" };
    const revision: RedirectRevision = {
      redirectId: record.id,
      workspaceId: record.workspaceId,
      seq: 2,
      state: tombstoned,
      tombstoned: true,
      actorId: "user-1",
      recordedAt: "2026-07-14T00:00:00.000Z",
    };
    await repo.tombstone({ workspaceId: "workspace-1", id: record.id, revision });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.equal(found?.status, "disabled");

    // Tombstoned but still listable when no status filter is applied (AC-07).
    const listed = await repo.list({ workspaceId: "workspace-1" });
    assert.equal(listed.length, 1);

    // No longer matched (AC-07's other half — via lookupExact).
    const matched = await repo.lookupExact({ workspaceId: "workspace-1", path: record.fromPattern, includeOverrideOnly: false });
    assert.equal(matched, null);
  });

  test(`[${label}] save() upserts (an update replaces the prior record state)`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "upsert-me", toTarget: "/first" });
    await repo.save({ record, revision: makeRevision(record) });

    const updated = { ...record, toTarget: "/second", version: 2, updatedAt: "2026-07-14T00:00:00.000Z" };
    await repo.save({ record: updated, revision: makeRevision(updated, 2) });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.equal(found?.toTarget, "/second");
    assert.equal(found?.version, 2);
  });
}

runContractSuite("memory", () => new InMemoryRedirectRepo());

runContractSuite("sqlite", () => new SqliteRedirectRepo(openContentDb(":memory:")));
