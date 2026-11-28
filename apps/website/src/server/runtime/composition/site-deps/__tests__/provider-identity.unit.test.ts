import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { composeProviderConfig, credentialProject } from "../provider-identity.js";

/**
 * @file `composeProviderConfig`'s degraded paths and `credentialProject`'s optional halves: a project
 * store that fails to open is reported and never stops boot (the site source stays in charge), a
 * production server without a desktop data dir opens none, a failed site-name refresh is only warned
 * about, and a project vault without create/replace repos contributes only the halves it has.
 */

type Input = Parameters<typeof composeProviderConfig>[0];
type Vault = NonNullable<Parameters<typeof credentialProject>[0]["projectVault"]>;

const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-provider-identity-"));
fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "site-pi-1" }));
after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

const site = { marker: "site-source" } as unknown as Input["site"];

function input(overrides: Input["overrides"], runtimeMode: Input["runtimeMode"], closes: unknown[]): Input {
  return { overrides, runtimeMode, site, binding: { dir: siteDir, name: "Bakery" }, references: {} as Input["references"],
    onStoreClose: (required) => { closes.push(required); } };
}

test("a project store that fails to open is warned about with its reason, and the site source stays in charge", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const closes: unknown[] = [];
  const result = await composeProviderConfig(input({ openProjectStore: async () => { throw new Error("disk-gone-42"); } }, "local", closes));
  assert.deepEqual(result, { siteId: "site-pi-1", providerConfigSource: site, projectId: undefined });
  assert.equal(result.providerConfigSource, site);
  assert.deepEqual(closes, [], "nothing to close when no store opened");
  const messages = warn.mock.calls.map(call => String(call.arguments[0]));
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /^\[project-store\] Shared Keys could not open\. Existing site keys remain available\. .*P25_OWNER_STORE_UNAVAILABLE; .*disk-gone-42/);
});

test("production without a desktop data dir opens no project store and warns nothing", async (t) => {
  const saved = process.env.TOVU_DESKTOP_USER_DATA_DIR;
  delete process.env.TOVU_DESKTOP_USER_DATA_DIR;
  t.after(() => { if (saved === undefined) delete process.env.TOVU_DESKTOP_USER_DATA_DIR; else process.env.TOVU_DESKTOP_USER_DATA_DIR = saved; });
  const warn = t.mock.method(console, "warn", () => {});
  const closes: unknown[] = [];
  const result = await composeProviderConfig(input({}, "production", closes));
  assert.deepEqual(result, { siteId: "site-pi-1", providerConfigSource: site, projectId: undefined });
  assert.deepEqual(closes, []);
  assert.equal(warn.mock.callCount(), 0);
});

test("a site-name refresh that fails is only warned about: the project store still attaches and closes with the site", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const closes: { registration: () => void }[] = [];
  const events: string[] = [];
  const projectStore = {
    projectId: "proj-77",
    vault: { workspaceId: "project", repo: {}, keyring: {}, sealer: {} },
    attachments: { renameSite: async ({ siteId, siteName }: { siteId: string; siteName: string }) => { events.push(`rename:${siteId}:${siteName}`); throw new Error("rename-refused-9"); } },
    config: {},
    transaction: async () => undefined,
    close: () => { events.push("close"); },
  };
  const result = await composeProviderConfig(input({ openProjectStore: async () => projectStore } as unknown as Input["overrides"], "local", closes));
  assert.equal(result.siteId, "site-pi-1");
  assert.equal(result.projectId, "proj-77");
  assert.equal(result.projectStore, projectStore as unknown);
  assert.notEqual(result.providerConfigSource, site, "an attached project wraps the site source");
  assert.deepEqual(events, ["rename:site-pi-1:Bakery"]);
  const messages = warn.mock.calls.map(call => String(call.arguments[0]));
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /^\[project-store\] Site name could not be refreshed; local keys remain available\. .*rename-refused-9/);
  assert.equal(closes.length, 1);
  closes[0]!.registration();
  assert.deepEqual(events, ["rename:site-pi-1:Bakery", "close"]);
});

test("credentialProject builds only the repo halves the project vault has", () => {
  const base = { workspaceId: "project", repo: "owner-repo", sealer: "sealer-1", keyring: "ring-1" };
  const wrap = (vault: unknown) => `wrapped:${String(vault)}`;
  assert.deepEqual(credentialProject({ projectVault: base as unknown as Vault, repo: wrap }),
    { project: { workspaceId: "project", repo: "wrapped:owner-repo", sealer: "sealer-1", keyring: "ring-1" } });
  assert.deepEqual(credentialProject({ projectVault: { ...base, createRepo: "create-repo", replaceRepo: "replace-repo" } as unknown as Vault, repo: wrap }),
    { project: { workspaceId: "project", repo: "wrapped:owner-repo", createRepo: "wrapped:create-repo", replaceRepo: "wrapped:replace-repo", sealer: "sealer-1", keyring: "ring-1" } });
  assert.deepEqual(credentialProject({ projectVault: undefined, repo: wrap }), {});
});

/** A project store whose transaction brackets its work in `events`, so a test can see what ran inside it. */
function recordingProjectStore(events: string[], parts: { config?: unknown; vaultRepo?: unknown } = {}) {
  return {
    projectId: "proj-tx",
    vault: { workspaceId: "project", repo: parts.vaultRepo ?? {}, keyring: {}, sealer: {} },
    attachments: {
      renameSite: async () => undefined,
      isAttached: async ({ siteId, keyId }: { siteId: string; keyId: string }) => { events.push(`attached?:${siteId}:${keyId}`); return true; },
      attach: async ({ keyId }: { keyId: string }) => { events.push(`attach:${keyId}`); },
      usersOf: async () => [{ siteId: "site-pi-1", siteName: "Bakery" }],
    },
    config: parts.config ?? {},
    transaction: async ({ run }: { run: () => Promise<unknown> }) => { events.push("tx:begin"); const out = await run(); events.push("tx:end"); return out; },
    close: () => undefined,
  };
}

test("a provider key saved to the project runs its write and site attachment inside the project store's transaction", async (t) => {
  t.mock.method(console, "warn", () => {});
  const events: string[] = [];
  let written = false;
  const config = {
    usage: async () => (written ? { keyId: "k" } : {}),
    write: async ({ pluginId }: { pluginId: string }) => { events.push(`write:${pluginId}`); written = true; },
  };
  const localSite = { usage: async () => ({ store: "site", usedByThisSite: false, usedBy: [] }), write: async () => { throw new Error("site write not expected"); } };
  const projectStore = recordingProjectStore(events, { config });
  const references = { set: async ({ credentialId }: { credentialId: string }) => { events.push(`ref:${credentialId}`); } };
  const result = await composeProviderConfig({ ...input({ openProjectStore: async () => projectStore } as unknown as Input["overrides"], "local", []), site: localSite as unknown as Input["site"], references: references as unknown as Input["references"] });
  const saved = await result.providerConfigSource.write({ pluginId: "mailer-x", config: { region: "eu" } } as unknown as Parameters<Input["site"]["write"]>[0]);
  const keyId = "plugin-state:mailer-x:provider.config";
  assert.deepEqual(events, ["tx:begin", "write:mailer-x", `ref:${keyId}`, `attach:${keyId}`, `attached?:site-pi-1:${keyId}`, "tx:end"]);
  assert.deepEqual(saved, { keyId, store: "project", usedByThisSite: true, usedBy: ["Bakery"] });
});

test("the project vault's replace repo re-checks the site's grant and replaces the owner key inside the project store's transaction", async (t) => {
  t.mock.method(console, "warn", () => {});
  const events: string[] = [];
  const owner = {
    find: async ({ id }: { id: string }) => { events.push(`find:${id}`); return { id }; },
    put: async ({ record }: { record: { id: string } }) => { events.push(`put:${record.id}`); return "rev-3"; },
  };
  const projectStore = recordingProjectStore(events, { vaultRepo: owner });
  const result = await composeProviderConfig(input({ openProjectStore: async () => projectStore } as unknown as Input["overrides"], "local", []));
  const replaceRepo = result.projectVault?.replaceRepo;
  assert.notEqual(replaceRepo, undefined);
  const put = await replaceRepo!.put({ record: { workspaceId: "project", id: "key-9" }, expectedRevision: 2 } as unknown as Parameters<NonNullable<typeof replaceRepo>["put"]>[0]);
  assert.equal(put, "rev-3");
  assert.deepEqual(events, ["tx:begin", "attached?:site-pi-1:key-9", "find:key-9", "put:key-9", "tx:end"]);
});

/** The AAD the project vault seals an owner `vendor` key under, as `siteGrantedSealer` parses it. */
const VENDOR_KEY_AAD = `secrets-vault:v1:${JSON.stringify(["project", "key-9", "vendor", "tovu", null, null])}`;

async function projectSealer(events: string[], attached: boolean) {
  const projectStore = recordingProjectStore(events);
  projectStore.attachments.isAttached = async ({ siteId, keyId }) => { events.push(`attached?:${siteId}:${keyId}`); return attached; };
  const sealer = { seal: async () => "sealed", open: async () => { events.push("open"); return "plain-9"; } };
  const store = { ...projectStore, vault: { ...projectStore.vault, sealer } };
  const result = await composeProviderConfig(input({ openProjectStore: async () => store } as unknown as Input["overrides"], "local", []));
  const projectVaultSealer = result.projectVault?.sealer;
  assert.notEqual(projectVaultSealer, undefined);
  return { open: () => projectVaultSealer!.open({ ciphertext: "c" } as unknown as Parameters<NonNullable<typeof projectVaultSealer>["open"]>[0], { aad: VENDOR_KEY_AAD }) };
}

test("the project vault's sealer opens an owner key only while this site's grant for that key stands, checked before and after", async (t) => {
  t.mock.method(console, "warn", () => {});
  const events: string[] = [];
  const { open } = await projectSealer(events, true);
  assert.equal(await open(), "plain-9");
  assert.deepEqual(events, ["attached?:site-pi-1:key-9", "open", "attached?:site-pi-1:key-9"]);
});

test("the project vault's sealer refuses an owner key this site is no longer attached to, without decrypting it", async (t) => {
  t.mock.method(console, "warn", () => {});
  const events: string[] = [];
  const { open } = await projectSealer(events, false);
  await assert.rejects(open(), { message: "This site no longer has access to this saved key. Open Use a saved key to approve access again." });
  assert.deepEqual(events, ["attached?:site-pi-1:key-9"]);
});
