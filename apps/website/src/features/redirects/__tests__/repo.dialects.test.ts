import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { type SqlRedirectRepo, redirectRepoFor } from "../repo.js";
import { RedirectNotFoundError, type RedirectRecord, type RedirectRevision } from "../types.js";

/**
 * @file The redirect repo on every dialect through the kernel's matrix (`describeEachDialect` + ONE
 * factory: one query body serves every dialect).
 */

const WS = "ws-dialects";
const OTHER = "other-ws";

function rule(id: string, overrides: Partial<RedirectRecord> = {}): RedirectRecord {
  return {
    id,
    workspaceId: WS,
    matchType: "exact",
    fromPattern: `/${id}`,
    toTarget: "/target",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "user-1",
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function revision(record: RedirectRecord, seq = 1, tombstoned = false): RedirectRevision {
  return {
    redirectId: record.id,
    workspaceId: record.workspaceId,
    seq,
    state: record,
    tombstoned,
    actorId: "user-1",
    recordedAt: record.updatedAt,
  };
}

async function saveRule(repo: SqlRedirectRepo, record: RedirectRecord): Promise<void> {
  await repo.save({ record, revision: revision(record) });
}

describeEachDialect<SqlRedirectRepo>(
  "redirect repo",
  { tables: ["redirects", "redirect_revisions"], make: redirectRepoFor },
  (makeRepo) => {
    test("save round-trips every field incl. optionals and booleans; re-save replaces the row", async () => {
      const repo = makeRepo();
      const full = rule("full", {
        override: true,
        priority: 5,
        source: "capture",
        sourceEntryId: "e1",
        fromPathAtCapture: "/a",
        toPathAtCapture: "/b",
        createdByPluginId: "plug",
      });
      await saveRule(repo, full);
      assert.deepEqual(await repo.findById({ workspaceId: WS, id: "full" }), full);
      const replaced = { ...full, toTarget: "/changed", override: false, version: 2, sourceEntryId: undefined };
      await repo.save({ record: replaced, revision: revision(replaced, 2) });
      assert.deepEqual(await repo.findById({ workspaceId: WS, id: "full" }), replaced);
      assert.equal((await repo.list({ workspaceId: WS })).length, 1);
      assert.deepEqual(
        (await repo.listRevisionsForTests("full")).map((r) => r.seq),
        [1, 2]
      );
    });

    test("findById misses an unknown id and another workspace's row", async () => {
      const repo = makeRepo();
      await saveRule(repo, rule("a"));
      assert.equal(await repo.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await repo.findById({ workspaceId: OTHER, id: "a" }), null);
    });

    test("lookupExact hits by path, honours override-only, prefers priority, isolates workspaces", async () => {
      const repo = makeRepo();
      await saveRule(repo, rule("lo", { fromPattern: "/p", priority: 1 }));
      await saveRule(repo, rule("hi", { fromPattern: "/p", priority: 9, override: true }));
      await saveRule(repo, rule("gone", { fromPattern: "/q", status: "tombstoned" }));
      assert.equal((await repo.lookupExact({ workspaceId: WS, path: "/p", includeOverrideOnly: false }))?.id, "hi");
      await saveRule(repo, rule("plain", { fromPattern: "/z" }));
      assert.equal(await repo.lookupExact({ workspaceId: WS, path: "/z", includeOverrideOnly: true }), null);
      assert.equal(await repo.lookupExact({ workspaceId: WS, path: "/q", includeOverrideOnly: false }), null);
      assert.equal(await repo.lookupExact({ workspaceId: OTHER, path: "/p", includeOverrideOnly: false }), null);
    });

    test("lookupLongestPrefix picks the longest matching prefix; misses non-matches and other workspaces", async () => {
      const repo = makeRepo();
      await saveRule(repo, rule("short", { matchType: "prefix", fromPattern: "/docs" }));
      await saveRule(repo, rule("long", { matchType: "prefix", fromPattern: "/docs/api/" }));
      await saveRule(repo, rule("ov", { matchType: "prefix", fromPattern: "/x", override: true }));
      const hit = (path: string, includeOverrideOnly = false) =>
        repo.lookupLongestPrefix({ workspaceId: WS, path, includeOverrideOnly });
      assert.equal((await hit("/docs/api/v1"))?.id, "long");
      assert.equal((await hit("/docs/other"))?.id, "short");
      assert.equal((await hit("/docs"))?.id, "short");
      assert.equal(await hit("/docsx"), null);
      assert.equal((await hit("/x/y", true))?.id, "ov");
      assert.equal(await hit("/docs/a", true), null);
      assert.equal(await repo.lookupLongestPrefix({ workspaceId: OTHER, path: "/docs/a", includeOverrideOnly: false }), null);
    });

    test("listDynamic returns active wildcard rules, longest first, capped by limit, per workspace", async () => {
      const repo = makeRepo();
      await saveRule(repo, rule("w1", { matchType: "wildcard", fromPattern: "/a/*" }));
      await saveRule(repo, rule("w2", { matchType: "wildcard", fromPattern: "/a/b/*", override: true }));
      await saveRule(repo, rule("w3", { matchType: "wildcard", fromPattern: "/c/*", status: "tombstoned" }));
      await saveRule(repo, rule("e1"));
      const ids = async (limit: number, includeOverrideOnly = false) =>
        (await repo.listDynamic({ workspaceId: WS, includeOverrideOnly, limit })).map((r) => r.id);
      assert.deepEqual(await ids(10), ["w2", "w1"]);
      assert.deepEqual(await ids(1), ["w2"]);
      assert.deepEqual(await ids(10, true), ["w2"]);
      assert.deepEqual(await repo.listDynamic({ workspaceId: OTHER, includeOverrideOnly: false, limit: 10 }), []);
    });

    test("list filters by status, source and matchType and stays inside the workspace", async () => {
      const repo = makeRepo();
      await saveRule(repo, rule("m", { source: "manual" }));
      await saveRule(repo, rule("c", { source: "capture", matchType: "prefix" }));
      await saveRule(repo, rule("t", { status: "tombstoned" }));
      await saveRule(repo, rule("o", { workspaceId: OTHER }));
      const ids = async (filter: object) =>
        (await repo.list({ workspaceId: WS, ...filter })).map((r) => r.id).sort();
      assert.deepEqual(await ids({}), ["c", "m", "t"]);
      assert.deepEqual(await ids({ status: "tombstoned" }), ["t"]);
      assert.deepEqual(await ids({ source: "capture" }), ["c"]);
      assert.deepEqual(await ids({ matchType: "prefix" }), ["c"]);
      assert.deepEqual(await repo.list({ workspaceId: "empty" }), []);
    });

    test("findByFromPattern prefers an exact active rule; misses tombstoned and other workspaces", async () => {
      const repo = makeRepo();
      await saveRule(repo, rule("pre", { matchType: "prefix", fromPattern: "/same" }));
      await saveRule(repo, rule("ex", { fromPattern: "/same" }));
      await saveRule(repo, rule("dead", { fromPattern: "/dead", status: "tombstoned" }));
      assert.equal((await repo.findByFromPattern({ workspaceId: WS, fromPattern: "/same" }))?.id, "ex");
      assert.equal(await repo.findByFromPattern({ workspaceId: WS, fromPattern: "/dead" }), null);
      assert.equal(await repo.findByFromPattern({ workspaceId: OTHER, fromPattern: "/same" }), null);
    });

    test("tombstone writes the tombstoned state + revision; unknown or other-workspace id throws and writes nothing", async () => {
      const repo = makeRepo();
      const live = rule("t1");
      await saveRule(repo, live);
      const dead = { ...live, status: "tombstoned" as const, version: 2 };
      await repo.tombstone({ workspaceId: WS, id: "t1", revision: revision(dead, 2, true) });
      assert.equal((await repo.findById({ workspaceId: WS, id: "t1" }))?.status, "tombstoned");
      const ledger = await repo.listRevisionsForTests("t1");
      assert.deepEqual(ledger.map((r) => r.tombstoned), [false, true]);
      await assert.rejects(
        repo.tombstone({ workspaceId: WS, id: "nope", revision: revision(rule("nope"), 1, true) }),
        RedirectNotFoundError
      );
      await assert.rejects(
        repo.tombstone({ workspaceId: OTHER, id: "t1", revision: revision({ ...dead, workspaceId: OTHER }, 3, true) }),
        RedirectNotFoundError
      );
      assert.equal((await repo.listRevisionsForTests("nope")).length, 0);
      assert.equal((await repo.listRevisionsForTests("t1")).length, 2);
    });

    test("a save whose revision fails rolls the redirect row back too", async () => {
      const repo = makeRepo();
      const record = rule("r1");
      const bad = { ...revision(record), state: { toJSON: () => { throw new Error("boom"); } } } as unknown as RedirectRevision;
      await assert.rejects(repo.save({ record, revision: bad }), /boom/);
      assert.equal(await repo.findById({ workspaceId: WS, id: "r1" }), null);
    });

    test("a transaction's writes roll back together; a nested one joins", async () => {
      const repo = makeRepo();
      const record = rule("tx");
      await assert.rejects(
        repo.transaction(async () => {
          await repo.insertRedirect(record);
          await repo.transaction(async () => repo.insertRevision(revision(record)));
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await repo.findById({ workspaceId: WS, id: "tx" }), null);
      assert.deepEqual(await repo.listRevisionsForTests("tx"), []);
      await repo.transaction(async () => {
        await repo.insertRedirect(record);
        await repo.insertRevision(revision(record));
      });
      assert.equal((await repo.listRevisionsForTests("tx")).length, 1);
    });
  }
);
