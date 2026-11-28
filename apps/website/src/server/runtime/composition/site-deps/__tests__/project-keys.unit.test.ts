import assert from "node:assert/strict";
import test from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { compositionProjectKeys } from "../project-keys.js";

/**
 * @file The two late-bound closures `compositionProjectKeys` hands the shared-key service: the project
 * inventory reader (re-checked at call time) and the OAuth binder (read from `bindSharedApiOAuth` only
 * when a shared OAuth key is chosen, because the shared-connection service is built after this one).
 * Driven through the returned service's own `list` / `use`, with the real `createProjectKeys` behind it.
 */

type Required = Parameters<typeof compositionProjectKeys>[0];
type Row = { id: string; kind: string; label: string; meta: Record<string, unknown> };

function rig(options: { siteId?: string; inventory?: Row[]; vaultRows?: Row[]; bind?: () => ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined } = {}) {
  const calls: string[] = [];
  const vaultRows = options.vaultRows ?? [];
  const projectStore: Record<string, unknown> = {
    vault: {
      repo: {
        find: async ({ workspaceId, id }: { workspaceId: string; id: string }) => { calls.push(`find:${workspaceId}:${id}`); return vaultRows.find(row => row.id === id) ?? null; },
        list: async ({ kind }: { kind: string }) => { calls.push(`list:${kind}`); return vaultRows.filter(row => row.kind === kind); },
      },
      workspaceId: "project",
    },
    attachments: {
      usersOf: async ({ keyId }: { keyId: string }) => { calls.push(`usersOf:${keyId}`); return [{ siteId: "site-7", siteName: "Bakery" }]; },
      attach: async (input: { siteId: string; keyId: string; siteName: string }) => { calls.push(`attach:${input.siteId}:${input.keyId}:${input.siteName}`); },
      detach: async () => { calls.push("detach"); },
      isAttached: async () => true,
    },
    transaction: async ({ run }: { run: () => Promise<unknown> }) => { calls.push("tx"); return run(); },
    ...(options.inventory ? { inventory: async (input: unknown) => { calls.push(`inventory:${JSON.stringify(input)}`); return options.inventory; } } : {}),
  };
  const required = {
    resolvedSiteBinding: { name: "Bakery", dir: "/nonexistent/bakery" },
    kernel: contentKernel({ store: openContentDb(":memory:") }),
    clock: { nowIso: () => "2031-02-03T04:05:06.000Z" },
    projectKeyReferences: { set: async ({ credentialId }: { credentialId: string }) => { calls.push(`ref:${credentialId}`); } },
    projectSiteId: options.siteId ?? "site-7",
    projectStore,
    providerConfigSource: { usage: async () => { throw new Error("no provider key in these fixtures"); } },
    providerPlugins: { reapply: async () => "now" },
    bindSharedApiOAuth: options.bind ?? (() => undefined),
  } as unknown as Required;
  const keys = compositionProjectKeys(required);
  assert.ok(keys, "an attached project store builds the shared-key service");
  return { keys, calls, projectStore };
}

const VENDOR: Row = { id: "vendor-bucket-1", kind: "vendor", label: "Bucket key", meta: {} };
const OAUTH: Row = { id: "oauth-crm-1", kind: "api-connection", label: "CRM", meta: { credentialFormat: "oauth-token-set" } };

test("list reads the project's own inventory service (with no arguments) instead of listing the vault per kind", async () => {
  const { keys, calls } = rig({ inventory: [VENDOR] });
  const rows = await keys.list({});
  assert.deepEqual(rows, [{ keyId: "vendor-bucket-1", usedByThisSite: true, usedBy: ["Bakery"], name: "Bucket key", kind: "vendor" }]);
  assert.deepEqual(calls, ["inventory:{}", "usersOf:vendor-bucket-1"], "no per-kind vault list runs when an inventory service exists");
});

test("an inventory service removed after the keys were built is refused by name, not called", async () => {
  const { keys, projectStore } = rig({ inventory: [VENDOR] });
  delete projectStore.inventory;
  await assert.rejects(keys.list({}), { message: "project keys have no inventory service" });
});

test("without an inventory service, list falls back to the four per-kind vault lists", async () => {
  const { keys, calls } = rig({ vaultRows: [VENDOR] });
  const rows = await keys.list({});
  assert.deepEqual(rows.map(row => row.keyId), ["vendor-bucket-1"]);
  assert.deepEqual(calls.filter(call => call.startsWith("list:")), ["list:api-connection", "list:vendor", "list:custom", "list:source-control"]);
});

test("choosing a shared OAuth key binds it through the binder read at use time, before the attachment", async () => {
  let binder: ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;
  const { keys, calls } = rig({ vaultRows: [OAUTH], bind: () => binder });
  // Bound only after the service was built: the closure must read it late.
  binder = async (input) => { calls.push(`bind:${input.keyId}:${input.use}`); };
  await keys.use({ keyId: "oauth-crm-1", use: true });
  assert.deepEqual(calls.filter(call => /^(bind|ref|attach)/.test(call)), ["bind:oauth-crm-1:true", "ref:oauth-crm-1", "attach:site-7:oauth-crm-1:Bakery"]);
});

test("choosing a shared OAuth key before shared connections exist is refused and attaches nothing", async () => {
  const { keys, calls } = rig({ vaultRows: [OAUTH] });
  await assert.rejects(keys.use({ keyId: "oauth-crm-1", use: true }), { message: "Shared connections are not available yet. Reopen this saved connection and try again." });
  assert.deepEqual(calls.filter(call => /^(ref|attach)/.test(call)), []);
});

test("with no site id there is no other-site key source: a saved-on-site id is looked up as a project key", async () => {
  const { keys, calls } = rig({ siteId: "" });
  await assert.rejects(keys.permissionFor({ keyId: "saved-on-site:bakery-old-1" }), (error: Error) => error.name === "ToolInputError");
  assert.deepEqual(calls, ["find:project:saved-on-site:bakery-old-1"], "the project vault, not a site registry, answered");
});
