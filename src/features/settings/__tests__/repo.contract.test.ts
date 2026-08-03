import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../../db/sqlite/content-db";
import { workspaces } from "../../../db/schema";
import { InMemorySettingsRepo } from "../repo.memory";
import { SqliteSettingsRepo } from "../repo.sqlite";
import type { SettingsRepoPort } from "../ports";
import type { SettingDefinitionRecord, SettingValueRecord } from "../types";

/** Every workspace id any contract-suite test below references — seeded up front so the SQLite adapter's real FK doesn't reject them. */
const CONTRACT_TEST_WORKSPACE_IDS = ["ws-1", "ws-2", "ws-OTHER"];

/**
 * Shared contract-test suite for `SettingsRepoPort` (C-007, ADR-PIPE-007
 * rule-of-two). Runs against every adapter: `repo.memory.ts` and
 * `repo.sqlite.ts` (the rule-of-two second adapter, Article IV).
 */
function runContractSuite(adapterName: string, makeRepo: () => SettingsRepoPort) {
  const NOW = "2026-07-11T00:00:00.000Z";
  const def: SettingDefinitionRecord = {
    settingId: "setting-1",
    version: 1,
    workspaceId: null,
    namespace: "core.presentation",
    key: "activeThemeId",
    ownerKind: "core",
    ownerId: null,
    schema: { type: "string" },
    defaultValue: "paper",
    scopes: 7,
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  test(`[${adapterName}] saveDefinition + findActiveDefinition round-trips`, async () => {
    const repo = makeRepo();
    await repo.saveDefinition(def);
    const found = await repo.findActiveDefinition({
      namespace: def.namespace,
      key: def.key,
      workspaceId: null,
    });
    assert.equal(found?.settingId, def.settingId);
  });

  test(`[${adapterName}] findActiveDefinition returns null for an unknown key`, async () => {
    const repo = makeRepo();
    const found = await repo.findActiveDefinition({ namespace: "core.nope", key: "x", workspaceId: null });
    assert.equal(found, null);
  });

  test(`[${adapterName}] global/workspace/user value save+get round-trip independently`, async () => {
    const repo = makeRepo();
    const base: Omit<SettingValueRecord, "scope" | "workspaceId" | "principalId"> = {
      settingId: def.settingId,
      valueJson: "x",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    };
    await repo.saveGlobalValue({ ...base, scope: "global", workspaceId: null, principalId: null });
    await repo.saveWorkspaceValue({ ...base, scope: "workspace", workspaceId: "ws-1", principalId: null });
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-1", principalId: "p-1" });

    assert.equal((await repo.getGlobalValue(def.settingId))?.valueJson, "x");
    assert.equal((await repo.getWorkspaceValue({ workspaceId: "ws-1", settingId: def.settingId }))?.valueJson, "x");
    assert.equal(
      (await repo.getUserValue({ workspaceId: "ws-1", principalId: "p-1", settingId: def.settingId }))?.valueJson,
      "x"
    );
    // Isolation: a workspace value must not leak into a different workspace's read.
    assert.equal(await repo.getWorkspaceValue({ workspaceId: "ws-OTHER", settingId: def.settingId }), null);
  });

  test(`[${adapterName}] appendRevision assigns a monotonically increasing seq and listRevisions returns ascending order`, async () => {
    const repo = makeRepo();
    const base = {
      entityKind: "value" as const,
      settingId: def.settingId,
      scope: "global" as const,
      workspaceId: null,
      principalId: null,
      op: "set" as const,
      beforeJson: null,
      afterJson: "x",
      defVersion: 1,
      actor: "actor-1",
      originPluginId: null,
      changeSetId: null,
      createdAt: NOW,
    };
    const seq1 = await repo.appendRevision(base);
    const seq2 = await repo.appendRevision(base);
    assert.ok(seq2 > seq1);

    const revisions = await repo.listRevisions({ settingId: def.settingId });
    assert.deepEqual(
      revisions.map((r) => r.seq),
      [...revisions.map((r) => r.seq)].sort((a, b) => a - b)
    );
  });

  /** A revision the ledger will accept, varied only by the fields a test cares about. */
  const revisionOf = (over: Partial<Parameters<SettingsRepoPort["appendRevision"]>[0]> = {}) => ({
    entityKind: "value" as const,
    settingId: def.settingId,
    scope: "workspace" as const,
    workspaceId: "ws-1" as string | null,
    principalId: null,
    op: "set" as const,
    beforeJson: null,
    afterJson: "x",
    defVersion: 1,
    actor: "actor-1",
    originPluginId: null,
    changeSetId: null,
    createdAt: NOW,
    ...over,
  });

  test(`[${adapterName}] listRevisionsSince does not let another workspace's writes crowd a page`, async () => {
    // The ledger is global. Without a workspace predicate the page is filled by whoever wrote most
    // recently, so a quiet tenant's own change sits beyond the limit and its SSE feed never
    // reaches it — an observable cross-tenant timing channel, and a permanently stalled feed once
    // the neighbour's write rate exceeds one page per poll.
    const repo = makeRepo();
    await repo.saveDefinition(def);
    for (let i = 0; i < 50; i += 1) await repo.appendRevision(revisionOf({ workspaceId: "ws-2" }));
    const mine = await repo.appendRevision(revisionOf({ workspaceId: "ws-1" }));

    const page = await repo.listRevisionsSince({ sinceSeq: 0, limit: 10, workspaceId: "ws-1" });

    assert.deepEqual(
      page.map((r) => r.seq),
      [mine],
      "a 10-row page must carry ws-1's own revision, not the first 10 of ws-2's backlog"
    );
  });

  test(`[${adapterName}] listRevisionsSince still returns platform-wide revisions to every workspace`, async () => {
    // `workspaceId: null` is a platform definition or a `global`-scope value — every workspace
    // resolves through it, so narrowing the page must not drop it. This is the half of the
    // predicate that keeps it a SUPERSET of `isRevisionVisibleTo` rather than a second, divergent
    // disclosure rule.
    const repo = makeRepo();
    await repo.saveDefinition(def);
    const platform = await repo.appendRevision(revisionOf({ scope: "global", workspaceId: null }));
    const other = await repo.appendRevision(revisionOf({ workspaceId: "ws-2" }));
    const own = await repo.appendRevision(revisionOf({ workspaceId: "ws-1" }));

    const page = await repo.listRevisionsSince({ sinceSeq: 0, limit: 100, workspaceId: "ws-1" });

    assert.deepEqual(
      page.map((r) => r.seq),
      [platform, own],
      "platform-wide and own-workspace revisions are in; another workspace's are out"
    );
    assert.ok(!page.some((r) => r.seq === other));
  });

  test(`[${adapterName}] listRevisionsSince still honours sinceSeq and limit under the workspace predicate`, async () => {
    const repo = makeRepo();
    await repo.saveDefinition(def);
    const seqs: number[] = [];
    for (let i = 0; i < 5; i += 1) seqs.push(await repo.appendRevision(revisionOf({ workspaceId: "ws-1" })));

    const page = await repo.listRevisionsSince({ sinceSeq: seqs[1]!, limit: 2, workspaceId: "ws-1" });

    assert.deepEqual(
      page.map((r) => r.seq),
      [seqs[2]!, seqs[3]!],
      "strictly greater than sinceSeq, ascending, capped at limit"
    );
  });

  test(`[${adapterName}] deleteWorkspaceValue/deleteUserValue remove exactly the targeted row`, async () => {
    const repo = makeRepo();
    const base: Omit<SettingValueRecord, "scope" | "workspaceId" | "principalId"> = {
      settingId: def.settingId,
      valueJson: "x",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    };
    await repo.saveWorkspaceValue({ ...base, scope: "workspace", workspaceId: "ws-1", principalId: null });
    await repo.saveWorkspaceValue({ ...base, scope: "workspace", workspaceId: "ws-2", principalId: null });

    await repo.deleteWorkspaceValue({ workspaceId: "ws-1", settingId: def.settingId });

    assert.equal(await repo.getWorkspaceValue({ workspaceId: "ws-1", settingId: def.settingId }), null);
    assert.notEqual(await repo.getWorkspaceValue({ workspaceId: "ws-2", settingId: def.settingId }), null);
  });

  test(`[${adapterName}] listUserValuesByWorkspace returns every principal's rows for a workspace, none from another workspace`, async () => {
    const repo = makeRepo();
    const base: Omit<SettingValueRecord, "scope" | "workspaceId" | "principalId"> = {
      settingId: def.settingId,
      valueJson: "x",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    };
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-1", principalId: "p-1" });
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-1", principalId: "p-2" });
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-2", principalId: "p-3" });

    const rows = await repo.listUserValuesByWorkspace({ workspaceId: "ws-1" });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.principalId).sort(),
      ["p-1", "p-2"]
    );
  });

  test(`[${adapterName}] a second overlapping transaction never silently joins the first`, async () => {
    // An earlier fix made `transaction` reentrant via an instance-level depth
    // counter so a composite write could wrap its parts. An external audit broke
    // it immediately: the counter is not async-context-local, so a SECOND root
    // transaction starting while the first awaited was treated as nested — and
    // then either lost its reported-success write on the first's rollback, or was
    // committed by it after reporting failure.
    //
    // The guarantee this pins is the weaker but honest one: overlapping root
    // transactions either fail LOUDLY or stay genuinely independent. What must
    // never happen is the second one silently inheriting the first one's fate.
    // (Composite atomicity is now expressed explicitly instead — a caller opens
    // one transaction and passes `skipTransaction` to the inner writes.)
    const repo = makeRepo();
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));

    const first = repo
      .transaction(async () => {
        await gate;
        throw new Error("first rolls back");
      })
      .catch(() => "rolled-back");

    const second = await repo
      .transaction(async () => {
        await repo.saveDefinition({ ...def, settingId: "setting-independent", version: 1 });
        return "committed";
      })
      .then(
        (value) => value,
        () => "refused"
      );

    releaseFirst?.();
    assert.equal(await first, "rolled-back");

    if (second === "committed") {
      // If it reported success it must actually have survived the other's rollback.
      assert.notEqual(
        await repo.findDefinitionBySettingId({ settingId: "setting-independent" }),
        null,
        "a transaction that reported success must not be undone by an unrelated rollback"
      );
    } else {
      // Refusing outright is fine — a loud failure is a correct answer here.
      assert.equal(second, "refused");
    }
  });

  test(`[${adapterName}] transaction runs the callback and returns its result`, async () => {
    const repo = makeRepo();
    const result = await repo.transaction(async () => {
      await repo.saveDefinition(def);
      return "done";
    });
    assert.equal(result, "done");
    assert.notEqual(
      await repo.findActiveDefinition({ namespace: def.namespace, key: def.key, workspaceId: null }),
      null
    );
  });

  test(`[${adapterName}] a failed transaction rolls back EVERY write it made, not just the last`, async () => {
    // This assertion used to run against the SQLite adapter only, on the
    // reasoning that in-memory mutations are individually atomic already. They
    // are — but the guarantee this port sells is that a COMPOSITE is
    // all-or-nothing, which is what `resetNamespace` depends on. Gating it left
    // the in-memory adapter (the wired default in `server/app.ts`) leaving a
    // half-applied namespace reset, invisible to CI. Running it against every
    // adapter is the point of a contract suite.
    const repo = makeRepo();
    await assert.rejects(
      repo.transaction(async () => {
        await repo.saveDefinition(def);
        await repo.saveDefinition({ ...def, settingId: "setting-2", key: "secondKey" });
        await repo.appendRevision({
          entityKind: "value",
          settingId: def.settingId,
          scope: "global",
          workspaceId: null,
          principalId: null,
          op: "set",
          beforeJson: null,
          afterJson: "x",
          defVersion: 1,
          actor: "p-1",
          originPluginId: null,
          changeSetId: null,
          createdAt: NOW,
        });
        throw new Error("fails after several writes");
      }),
      /fails after several writes/
    );

    // The FIRST write must be gone too — a rollback that only undoes the write
    // nearest the failure is exactly the half-applied state this prevents.
    assert.equal(
      await repo.findActiveDefinition({ namespace: def.namespace, key: def.key, workspaceId: null }),
      null,
      "the first write in a failed transaction must not survive"
    );
    assert.equal(await repo.findDefinitionBySettingId({ settingId: "setting-2" }), null);
    assert.deepEqual(await repo.listRevisions({ settingId: def.settingId }), []);
  });

  test(`[${adapterName}] a transaction that succeeds after an earlier one failed still commits`, async () => {
    // Rolling back must restore the adapter to a usable state, not wedge it —
    // an in-memory journal that forgot to clear its open-transaction flag would
    // refuse every write after the first failure.
    const repo = makeRepo();
    await assert.rejects(
      repo.transaction(async () => {
        await repo.saveDefinition(def);
        throw new Error("first fails");
      })
    );
    await repo.transaction(async () => {
      await repo.saveDefinition({ ...def, settingId: "setting-after", key: "afterKey" });
    });
    assert.notEqual(await repo.findDefinitionBySettingId({ settingId: "setting-after" }), null);
  });
}

runContractSuite("InMemorySettingsRepo", () => new InMemorySettingsRepo());

runContractSuite("SqliteSettingsRepo", () => {
  const db = openContentDb(":memory:");
  for (const id of CONTRACT_TEST_WORKSPACE_IDS) {
    db.insert(workspaces)
      .values({ id, name: id, slug: id, createdAt: "2026-07-11T00:00:00.000Z" })
      .onConflictDoNothing()
      .run();
  }
  return new SqliteSettingsRepo(db);
});
