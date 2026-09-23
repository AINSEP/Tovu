import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPublishContentRunRepo, type PublishContentRunRecord } from "../run-repo.js";

/**
 * @file Closes the mutation-sweep gap on `run-repo.ts:123`'s
 * `if (record?.workspaceId !== input.workspaceId) return null;` — the cross-workspace isolation
 * check on `InMemoryPublishContentRunRepo.findById`
 * (`ADS-memory/reports/2026-09-20-mutation-sweep-changed-files.md` §6b): a tenancy boundary with
 * no test proving it holds. Without it, a run record saved under one workspace would be readable
 * by any caller who guesses its id and claims a different `workspaceId` — the same shape of leak
 * `publish-content-peer-repo.sqlite.ts`'s own (separately, pre-existing red) suite exists to catch
 * for baselines.
 */

function record(overrides: Partial<PublishContentRunRecord> = {}): PublishContentRunRecord {
  return {
    id: "run-1",
    workspaceId: "workspace-a",
    direction: "export",
    peerPrincipalId: "pub:install-a",
    peerLabel: null,
    phase: "applied",
    restorePointId: null,
    changeSetIdsJson: null,
    actorId: "actor-1",
    startedAt: "2026-09-20T00:00:00.000Z",
    finishedAt: null,
    reportJson: null,
    itemsJson: null,
    ...overrides,
  };
}

test("InMemoryPublishContentRunRepo.findById: a run saved under one workspace is invisible to a lookup claiming a different workspace", async () => {
  const repo = new InMemoryPublishContentRunRepo();
  await repo.save(record({ id: "run-1", workspaceId: "workspace-a" }));

  const crossTenant = await repo.findById({ workspaceId: "workspace-b", id: "run-1" });
  assert.equal(crossTenant, null, "a run saved under workspace-a must not be readable by id alone from workspace-b");
});

test("InMemoryPublishContentRunRepo.findById: the same workspace CAN read its own run by id", async () => {
  const repo = new InMemoryPublishContentRunRepo();
  await repo.save(record({ id: "run-1", workspaceId: "workspace-a" }));

  const sameTenant = await repo.findById({ workspaceId: "workspace-a", id: "run-1" });
  assert.equal(sameTenant?.id, "run-1");
  assert.equal(sameTenant?.workspaceId, "workspace-a");
});

test("InMemoryPublishContentRunRepo.findById: an unknown id returns null regardless of workspace", async () => {
  const repo = new InMemoryPublishContentRunRepo();
  const result = await repo.findById({ workspaceId: "workspace-a", id: "no-such-run" });
  assert.equal(result, null);
});
