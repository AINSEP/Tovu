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
