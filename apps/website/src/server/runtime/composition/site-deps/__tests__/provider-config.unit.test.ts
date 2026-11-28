import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file `composeProviderConfigSource`: saved provider settings are migrated by the rules the named plugin itself
 * declares, and the site's custom-credential repo falls back to the project's credentials (with the project's
 * own inventory) only when a project vault and a project store both exist. The credential repo classes are
 * recorders so the scope handed to them can be read back.
 */

const repos: { kind: string; args: unknown[] }[] = [];
mock.module(new URL("../../../../../features/custom-credentials/vault-repo.js", import.meta.url).href, { namedExports: {
  CustomCredentialVaultRepo: class { readonly args: unknown[]; constructor(...args: unknown[]) { this.args = args; repos.push({ kind: "vault", args }); } } } });
mock.module(new URL("../../../../../features/custom-credentials/custom-credential-repo.js", import.meta.url).href, { namedExports: {
  SqlCustomCredentialSetRepo: class { readonly args: unknown[]; constructor(...args: unknown[]) { this.args = args; repos.push({ kind: "sql", args }); } } } });
const { composeProviderConfigSource } = await import("../provider-config.js");
type Required = Parameters<typeof composeProviderConfigSource>[0];

/** Drops the recorder classes' prototypes so scopes compare by content. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const migration = (to: string) => ({ contributes: { providers: [{ settingsMigrations: [{ when: { field: "region", in: ["legacy"] }, set: { region: to } }] }] } });

function compose({ projectVault, projectStore }: { projectVault?: unknown; projectStore?: unknown } = {}) {
  repos.length = 0;
  const kernel = { kernel: "content" };
  const saved = { settings: { region: "legacy", key: "k-1" } };
  const { providerConfigSource, customCredentialSetRepo } = composeProviderConfigSource({
    savedProviderConfig: { read: async () => saved, readSettings: async () => saved },
    pluginRuntime: { discoverPlugins: async () => [{ id: "p-other", manifest: migration("us") }, { id: "p-mail", manifest: migration("eu") }, { id: "p-bare" }] },
    projectVault, kernel, projectStore,
  } as unknown as Required);
  return { providerConfigSource, customCredentialSetRepo: customCredentialSetRepo as unknown as { args: unknown[] }, kernel };
}

test("saved provider settings are migrated by the rules of the plugin they belong to", async () => {
  const { providerConfigSource } = compose();
  const read = providerConfigSource.read as (input: { pluginId: string }) => Promise<{ settings: Record<string, string> }>;
  assert.deepEqual((await read({ pluginId: "p-mail" })).settings, { region: "eu", key: "k-1" });
  assert.deepEqual((await read({ pluginId: "p-other" })).settings, { region: "us", key: "k-1" });
});

test("settings of a plugin with no manifest, or one not discovered, are left as saved", async () => {
  const { providerConfigSource } = compose();
  const read = providerConfigSource.read as (input: { pluginId: string }) => Promise<{ settings: Record<string, string> }>;
  for (const pluginId of ["p-bare", "p-gone"]) assert.deepEqual((await read({ pluginId })).settings, { region: "legacy", key: "k-1" }, pluginId);
});

test("without a project vault the site's credential repo has no project scope", () => {
  const { customCredentialSetRepo, kernel } = compose({ projectStore: { vault: { repo: "store-vault" } } });
  assert.deepEqual(customCredentialSetRepo.args, [kernel, {}]);
  assert.deepEqual(repos.map(r => r.kind), ["sql"]);
});

test("a project vault scopes the site's credentials to the project, adding the project store's inventory only when that store exists", () => {
  const projectVault = { workspaceId: "ws-project", repo: "project-vault", sealer: { s: 1 }, keyring: { k: 1 } };
  const vaultRepo = (vault: string) => ({ args: [{ vault }] });
  const withoutStore = compose({ projectVault });
  assert.deepEqual(plain(withoutStore.customCredentialSetRepo.args[1]), { project: { workspaceId: "ws-project", repo: vaultRepo("project-vault"), sealer: { s: 1 }, keyring: { k: 1 } } });
  const withStore = compose({ projectVault, projectStore: { vault: { repo: "store-vault" } } });
  assert.deepEqual(plain(withStore.customCredentialSetRepo.args[1]), {
    project: { workspaceId: "ws-project", repo: vaultRepo("project-vault"), sealer: { s: 1 }, keyring: { k: 1 }, inventoryRepo: vaultRepo("store-vault") },
  });
});
