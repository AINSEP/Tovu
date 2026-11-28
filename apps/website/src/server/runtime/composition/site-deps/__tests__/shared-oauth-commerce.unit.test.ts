import assert from "node:assert/strict";
import test from "node:test";
import { compositionSharedOAuth } from "../shared-oauth-commerce.js";

/**
 * @file `compositionSharedOAuth`'s binding of the optional project store: no service without both a
 * project store and a site id, the project's own attachments/transaction/site identity passed
 * through, and the `inventory` getter that forwards to the project store's inventory service and
 * re-checks it at call time (fails with its own message once the service is gone).
 */

type Required = Parameters<typeof compositionSharedOAuth>[0];

function rig(projectStore: Record<string, unknown> | undefined, projectSiteId: string | undefined) {
  const required = {
    resolvedSiteBinding: { name: "Bakery", dir: "/nonexistent/bakery" },
    workspaceId: "site-7",
    clock: { nowMs: () => 1, nowIso: () => "2031-02-03T04:05:06.000Z" },
    identity: { ownerPrincipalId: "owner-1" },
    siteAssistantSecretKeyring: {},
    siteAssistantSecretSealer: {},
    siteReferenceRepo: {},
    projectSiteId,
    projectStore,
  } as unknown as Required;
  return compositionSharedOAuth(required);
}

function projectStore(inventoryCalls: unknown[] | undefined) {
  return {
    vault: { workspaceId: "project", repo: {}, keyring: {}, sealer: {} },
    attachments: { name: "attachments" },
    transaction: { name: "transaction" },
    ...(inventoryCalls ? { inventory: (input: unknown) => { inventoryCalls.push(input); return { name: "inventory-service" }; } } : {}),
  };
}

test("no shared OAuth service without both a project store and a project site id", () => {
  assert.deepEqual(rig(undefined, "proj-site-1"), {});
  assert.deepEqual(rig(projectStore([]), undefined), {});
  assert.deepEqual(rig(projectStore([]), ""), {});
});

test("a project store and site id bind the project's attachments, transaction and site identity", () => {
  const store = projectStore(undefined);
  const { shared } = rig(store, "proj-site-1");
  assert.ok(shared, "shared OAuth is composed");
  assert.equal(shared.ownerWorkspaceId, "project");
  assert.equal(shared.siteId, "proj-site-1");
  assert.equal(shared.siteName, "Bakery");
  assert.equal(shared.ownerPrincipalId, "owner-1");
  assert.equal(shared.attachments, store.attachments);
  assert.equal(shared.transaction, store.transaction);
  assert.equal(shared.inventory, undefined, "no inventory getter without an inventory service");
});

test("inventory() forwards to the project store's inventory service and re-checks it at call time", () => {
  const calls: unknown[] = [];
  const store: Record<string, unknown> = projectStore(calls);
  const { shared } = rig(store, "proj-site-1");
  const inventory = shared?.inventory;
  assert.ok(inventory, "inventory getter is composed");
  assert.deepEqual(inventory(), { name: "inventory-service" });
  assert.deepEqual(calls, [{}]);
  delete store.inventory;
  assert.throws(() => inventory(), { message: "shared OAuth has no project inventory service" });
});
