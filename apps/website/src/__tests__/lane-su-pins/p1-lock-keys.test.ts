import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createVerifiedOrigin } from "@jini-ai/core/contracts/server/verified-origin";

import { SqlFormPullLeaseRepo } from "@jini-ai/cms/forms/sql";
import { createSiteFormDeliveryRepo } from "#src/platform/db/repos/form-delivery-binding";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import { outboxOn } from "#src/platform/db/__tests__/events-adapters";
import { registerConfiguredOrigin } from "#src/platform/db/sqlite/origin-repo.sqlite";
import { SqliteTokenStore } from "#src/platform/db/sqlite/gated-mutation-token-repo.sqlite";
import { webhookDeliveriesOn } from "#src/platform/db/__tests__/webhook-adapters";
import { SqliteSettingsRepo } from "#src/features/settings/repo.sqlite";
import { SqliteEntryTermRepo, SqliteTaxonomyRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteTrashRepo } from "#src/features/trash/repo.sqlite";
import { createIdentityTransactions } from "#src/features/identity/repo";
import { SqliteWorkspaceRepo } from "#src/features/workspace/repo.sqlite";
import { recordingKernel } from "./support/recording-kernel.js";

/**
 * @file P1 (S0): the lock-key literals of lanes S/U, pinned exactly as they are today by driving the
 * public method that takes each lock through a recorder over the real SQLite kernel. A moved adapter
 * that reworded one of these would stop serializing against the writers still holding the old key
 * (Postgres advisory locks are keyed by the string), so the literal is the contract.
 */

const WS = "lane-su-ws";

describe("P1 lock keys: workspace, identity, settings, origin, tokens", () => {
  test("workspace roster", async () => {
    const { kernel, keys } = recordingKernel();
    await new SqliteWorkspaceRepo({ store: kernel }).transaction({ fn: async () => "done" });
    assert.deepEqual(keys, ["workspace:roster"]);
  });

  test("identity guard is per workspace", async () => {
    const { kernel, keys } = recordingKernel();
    await createIdentityTransactions({ kernel }).run({ workspaceId: WS, execute: async () => "done" });
    assert.deepEqual(keys, [`identity:${WS}`]);
  });

  test("setting revisions are one install-wide stream", async () => {
    const { kernel, keys } = recordingKernel();
    const seq = await new SqliteSettingsRepo({ store: kernel }).appendRevision({
      entityKind: "value", settingId: "s", scope: "global", workspaceId: null, principalId: null, op: "set",
      beforeJson: null, afterJson: "x", defVersion: 1, actor: "actor-1", originPluginId: null, changeSetId: null,
      createdAt: "2026-11-17T00:00:00.000Z",
    });
    assert.equal(seq, 1);
    assert.deepEqual(keys, ["setting_revisions"]);
  });

  test("origin settings are per workspace", async () => {
    const { kernel, keys } = recordingKernel();
    const origin = createVerifiedOrigin({ scheme: "https", host: "example.com", verifiedAt: "2026-11-17T00:00:00.000Z", source: "workspace-setting" });
    await registerConfiguredOrigin({ db: kernel, workspaceId: WS, origin });
    assert.deepEqual(keys, [`origin_settings:${WS}`]);
  });

  test("gated mutation tokens are per token", async () => {
    const { kernel, keys } = recordingKernel();
    assert.deepEqual(await new SqliteTokenStore({ store: kernel }).tryRedeem({ token: "tok-1", now: "2026-11-17T00:00:00.000Z" }), { redeemed: false, record: null });
    assert.deepEqual(keys, ["gated_mutation_tokens:tok-1"]);
  });
});

describe("P1 lock keys: taxonomy, trash, claims", () => {
  test("taxonomy transaction and term repoint take the same per-workspace key", async () => {
    const { kernel, keys } = recordingKernel();
    await new SqliteTaxonomyRepo({ db: kernel, workspaceId: WS }).transaction({ fn: async () => "done" });
    assert.deepEqual(await new SqliteEntryTermRepo({ db: kernel, workspaceId: WS }).repointTerm({ fromTermId: "a", intoTermId: "b" }), { repointedCount: 0 });
    assert.deepEqual(keys, [`taxonomy:${WS}`, `taxonomy:${WS}`]);
  });

  test("trash sweep claim", async () => {
    const { kernel, keys } = recordingKernel();
    assert.deepEqual(await new SqliteTrashRepo({ store: kernel }).claimDue({ now: "2026-11-17T00:00:00.000Z", leaseOwner: "o", leaseUntil: "2026-11-17T01:00:00.000Z", limit: 5 }), []);
    assert.deepEqual(keys, ["trash:sweep-claim"]);
  });

  test("outbox claim", async () => {
    const { kernel, keys } = recordingKernel();
    assert.deepEqual(await outboxOn({ kernel }).claimPending({ batchSize: 5, nowIso: "2026-11-17T00:00:00.000Z" }), []);
    assert.deepEqual(keys, ["outbox_events:claim"]);
  });

  test("webhook delivery claim", async () => {
    const { kernel, keys } = recordingKernel();
    assert.deepEqual(await webhookDeliveriesOn({ kernel }).claimPending({ batchSize: 5, nowIso: "2026-11-17T00:00:00.000Z" }), []);
    assert.deepEqual(keys, ["webhook_deliveries:claim"]);
  });
});

describe("P1 lock keys: form delivery (JSON-array keys)", () => {
  test("delivery plan once() is keyed by workspace and submission", async () => {
    const { kernel, keys } = recordingKernel();
    await assert.rejects(
      createSiteFormDeliveryRepo({ kernel }).once({ workspaceId: WS, submissionId: "sub-1", build: async () => { throw new Error("plan builder reached"); } }),
      /plan builder reached/,
    );
    assert.deepEqual(keys, [JSON.stringify(["form-delivery-plan", WS, "sub-1"])]);
    assert.equal(keys[0], '["form-delivery-plan","lane-su-ws","sub-1"]');
  });

  test("receiver pull claim is keyed by workspace and receiver", async () => {
    const { kernel, keys } = recordingKernel();
    const claim = await new SqlFormPullLeaseRepo({ kernel: schemaErasedKernel({ store: kernel }), table: "form_receiver_pulls" }).claim({ workspaceId: WS, receiverKey: "recv-1", token: "t", nowIso: "2026-11-17T00:00:00.000Z", recentMs: 1000, leaseMs: 60_000 });
    assert.equal(claim.claimed, true);
    assert.equal(keys[0], '["form-receiver-pull","lane-su-ws","recv-1"]');
    assert.equal(keys.length, 1);
  });
});
