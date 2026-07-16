import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "../../infra/sqlite/content-db";
import { InMemoryWebhookSubscriptionRepo } from "../repo.memory";
import { SqliteWebhookSubscriptionRepo } from "../repo.sqlite";
import type { WebhookSubscriptionRepoPort } from "../ports";
import type { WebhookSubscriptionRecord } from "../types";

/**
 * @file Shared `WebhookSubscriptionRepoPort` contract-test suite (ADR-PIPE-015 Phase 2 T020),
 * run against both `repo.memory.ts` and `repo.sqlite.ts` — mirrors
 * `src/members/__tests__/repo.contract.test.ts`'s shape.
 */

function makeSubscription(overrides: Partial<WebhookSubscriptionRecord> = {}): WebhookSubscriptionRecord {
  return {
    id: "sub-1",
    workspaceId: "workspace-1",
    ownerPrincipalId: "principal-1",
    label: "Endpoint",
    targetUrl: "https://example.com/hooks",
    topics: ["post.published"],
    secretVersion: 1,
    previousSecretVersion: null,
    status: "active",
    createdByPrincipalId: "principal-1",
    createdByPluginId: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    disabledAt: null,
    ...overrides,
  };
}

function runContractSuite(adapterName: string, makeRepo: () => WebhookSubscriptionRepoPort) {
  test(`[${adapterName}] insert + findById round-trips every field`, async () => {
    const repo = makeRepo();
    const record = makeSubscription();
    await repo.insert(record);

    const found = await repo.findById({ workspaceId: "workspace-1", id: "sub-1" });
    assert.deepEqual(found, record);
  });

  test(`[${adapterName}] findById returns null for an unknown id or wrong workspace`, async () => {
    const repo = makeRepo();
    await repo.insert(makeSubscription());

    assert.equal(await repo.findById({ workspaceId: "workspace-1", id: "nope" }), null);
    assert.equal(await repo.findById({ workspaceId: "other-workspace", id: "sub-1" }), null);
  });

  test(`[${adapterName}] save updates an existing row in place`, async () => {
    const repo = makeRepo();
    await repo.insert(makeSubscription());
    await repo.save(makeSubscription({ status: "paused", label: "Renamed" }));

    const found = await repo.findById({ workspaceId: "workspace-1", id: "sub-1" });
    assert.equal(found?.status, "paused");
    assert.equal(found?.label, "Renamed");
  });

  test(`[${adapterName}] listByWorkspace scopes strictly by workspace`, async () => {
    const repo = makeRepo();
    await repo.insert(makeSubscription({ id: "sub-1", workspaceId: "workspace-1" }));
    await repo.insert(makeSubscription({ id: "sub-2", workspaceId: "workspace-2" }));

    const rows = await repo.listByWorkspace({ workspaceId: "workspace-1" });
    assert.deepEqual(
      rows.map((r) => r.id),
      ["sub-1"]
    );
  });

  test(`[${adapterName}] findMatching only returns active subscriptions whose topics match`, async () => {
    const repo = makeRepo();
    await repo.insert(makeSubscription({ id: "sub-exact", topics: ["post.published"] }));
    await repo.insert(makeSubscription({ id: "sub-wildcard-entity", topics: ["post.*"] }));
    await repo.insert(makeSubscription({ id: "sub-owner-wildcard", topics: ["*"] }));
    await repo.insert(makeSubscription({ id: "sub-non-matching", topics: ["member.created"] }));
    await repo.insert(makeSubscription({ id: "sub-paused", topics: ["*"], status: "paused" }));

    const matches = await repo.findMatching({ workspaceId: "workspace-1", topic: "post.published" });
    const ids = matches.map((r) => r.id).sort();
    assert.deepEqual(ids, ["sub-exact", "sub-owner-wildcard", "sub-wildcard-entity"]);
  });
}

runContractSuite("InMemoryWebhookSubscriptionRepo", () => new InMemoryWebhookSubscriptionRepo());
runContractSuite("SqliteWebhookSubscriptionRepo", () => new SqliteWebhookSubscriptionRepo(openContentDb(":memory:")));

test("ADR-046 Phase 1: SqliteWebhookSubscriptionRepo persists across a simulated process restart (real on-disk file, fresh repo instance)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-webhooks-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const db1 = openContentDb(dbPath);
    const repo1 = new SqliteWebhookSubscriptionRepo(db1);
    await repo1.insert(makeSubscription({ id: "sub-restart-1" }));

    // "Restart": a brand-new content.db handle + a brand-new repo instance against the SAME
    // on-disk file — the in-memory adapter this replaces would have lost the row entirely.
    const db2 = openContentDb(dbPath);
    const repo2 = new SqliteWebhookSubscriptionRepo(db2);
    const matches = await repo2.findMatching({ workspaceId: "workspace-1", topic: "post.published" });
    assert.deepEqual(matches.map((r) => r.id), ["sub-restart-1"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
