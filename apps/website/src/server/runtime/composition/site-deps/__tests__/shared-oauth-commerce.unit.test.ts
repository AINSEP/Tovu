import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";

/** `compositionCommerce`'s commerce runtime and its outbound client factory are recorders (see its tests below). */
const commerceCalls: Array<Record<string, unknown>> = [];
mock.module(new URL("../../commerce.js", import.meta.url).href, { namedExports: {
  composeCommerce: (required: Record<string, unknown>) => { commerceCalls.push(required); return { commerce: "recorded" }; },
} });
const httpClient = await import("#src/platform/http/client");
const clientsBuilt: unknown[][] = [];
const sends: unknown[][] = [];
mock.module("#src/platform/http/client", { namedExports: { ...httpClient,
  createDefaultHttpClient: (...args: unknown[]) => { clientsBuilt.push(args); return { send: (...sent: unknown[]) => { sends.push(sent); return Promise.resolve({ status: 202 }); } }; },
} });
const { compositionSharedOAuth, compositionCommerce } = await import("../shared-oauth-commerce.js");

/**
 * @file `compositionSharedOAuth`'s binding of the optional project store: no service without both a
 * project store and a site id, the project's own attachments/transaction/site identity passed
 * through, and the `inventory` getter that forwards to the project store's inventory service and
 * re-checks it at call time (fails with its own message once the service is gone); and
 * `compositionCommerce`'s worker ownership/directory and its outbound single-hop HTTPS client.
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

function commerceRig(overrides: Record<string, unknown>, dbPath: string, projectSiteId: string | undefined) {
  commerceCalls.length = 0;
  const workspaceRoots: unknown[] = [];
  const observability = { observability: "recorded" };
  const result = compositionCommerce({
    dbPath, overrides, resolvedSiteBinding: { name: "Bakery", dir: "/sites/bakery" },
    agentPluginLayout: { forWorkspace: (input: unknown) => { workspaceRoots.push(input); return { root: "/sites/bakery/workspaces/site-7" }; } },
    kernel: {}, workspaceId: "site-7", clock: {}, idGen: {}, settingsRepo: {}, siteSettingsReady: Promise.resolve(),
    projectSiteId, providerConfigSource: {}, providerPlugins: {}, observability,
  } as unknown as Parameters<typeof compositionCommerce>[0]);
  const [call] = commerceCalls;
  assert.equal(commerceCalls.length, 1, "commerce composed once");
  return { result, call, workspaceRoots, observability };
}

test("commerce runs its worker only as the store owner, beside the database or in the site folder for :memory:", () => {
  const owner = commerceRig({}, "/data/bakery/content.db", "proj-site-1");
  assert.deepEqual(owner.result, { commerce: "recorded" });
  assert.deepEqual({ workerOwner: owner.call.workerOwner, workerDirectory: owner.call.workerDirectory, siteId: owner.call.siteId, workspaceRoot: owner.call.workspaceRoot },
    { workerOwner: true, workerDirectory: "/data/bakery", siteId: "proj-site-1", workspaceRoot: "/sites/bakery/workspaces/site-7" });
  assert.deepEqual(owner.workspaceRoots, [{ workspaceId: "site-7" }]);
  assert.equal(commerceRig({ storeRole: "owner" }, "/data/bakery/content.db", "proj-site-1").call.workerOwner, true);
  const client = commerceRig({ storeRole: "client" }, ":memory:", undefined);
  assert.deepEqual({ workerOwner: client.call.workerOwner, workerDirectory: client.call.workerDirectory, siteId: client.call.siteId },
    { workerOwner: false, workerDirectory: "/sites/bakery", siteId: "site-7" }, "a client store runs no worker; no project site id falls back to the workspace");
});

test("commerce's outbound client sends each request through a single-hop HTTPS client observed by the provider plugins", async () => {
  const { call, observability } = commerceRig({}, "/data/bakery/content.db", "proj-site-1");
  const client = call.httpClient as { send: (required: { request: unknown }, options?: unknown) => Promise<unknown> };
  clientsBuilt.length = 0;
  sends.length = 0;
  const request = { method: "POST", url: "https://pay.example.test/v1/orders" };
  assert.deepEqual(await client.send({ request }, { timeoutMs: 900 }), { status: 202 });
  assert.deepEqual(clientsBuilt, [[{ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }]]);
  assert.deepEqual(sends, [[request, { timeoutMs: 900 }]]);
});
