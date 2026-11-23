import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { VaultError } from "@jini-ai/core/contracts/vault";

import * as generic from "@jini-ai/integrations/credentialed-http/sets";
import * as store from "../store.js";
import { CredentialSetVaultRepo } from "@jini-ai/integrations/credentialed-http/sets";
import { CustomCredentialVaultRepo, customVaultRecord, customVaultScope } from "../vault-repo.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";

/**
 * @file EXTRACT-S8 C1 seam: (1) the moved host-wired `sets/` code in Jini imports only `@jini-ai/core`
 * and same-directory files — no db/platform/UI/Tovu/project/vendor path and no product owner literal —
 * and the old Tovu re-export shells are gone (SH-3: importers use the Jini entry directly); (2) the Tovu old entries keep their identity: same error class objects,
 * same repository class/constructor shape, same vault object, canonical `VaultError` codes and the
 * historical raw UNIQUE message.
 */

const OLD_SHELLS = ["host.ts", "vault-repo.ts", "store.ts"].map(name => new URL(`../sets/${name}`, import.meta.url));

test("the sets/ re-export shells are gone; the moved code imports nothing but @jini-ai/core subpaths and same-directory files", () => {
  // Why: SH-3 deleted the three shells; a shell coming back would give the moved code a second Tovu path.
  for (const file of OLD_SHELLS) assert.equal(existsSync(file), false, `${file.pathname}: re-export shell must not exist`);
  const dir = dirname(fileURLToPath(import.meta.resolve("@jini-ai/integrations/credentialed-http/sets")));
  for (const name of ["host", "vault-repo", "store"]) {
    const files = [`${name}.js`, `${name}.d.ts`].map(file => join(dir, file));
    let count = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]!);
      count += specifiers.length;
      for (const specifier of specifiers) {
        assert.ok(/^@jini-ai\/core(\/[a-z/-]+)?$/.test(specifier) || /^\.\/[a-z-]+\.js$/.test(specifier), `${file}: forbidden import ${specifier}`);
      }
      assert.doesNotMatch(source, /require\(|#src\/|@tovu\/|@jini-ai\/(?!core)/, `${file}: no Tovu, db, platform or other Jini package`);
      assert.doesNotMatch(source, /["']tovu["']|Shared Keys|P25_|TOVU_|secrets_vault/, `${file}: no product owner, wording or table names`);
    }
    assert.ok(count > 0, `${name} has imports`);
  }
});

test("store.ts re-exports the canonical sets/ error classes as the same objects", () => {
  for (const name of ["CustomCredentialValidationError", "CustomCredentialDuplicateLabelError", "CustomCredentialConcurrentModificationError",
    "CustomCredentialSecretStoreUnconfiguredError", "CustomCredentialNotFoundError"] as const) {
    assert.equal(store[name], generic[name], name);
    assert.equal(store[name].name, name);
  }
});

test("CustomCredentialVaultRepo keeps its class identity, constructor shape and own fields", () => {
  const vault = new InMemoryVaultRepo({});
  const repo = new CustomCredentialVaultRepo({ vault });
  assert.ok(repo instanceof CredentialSetVaultRepo);
  assert.equal(repo.vault, vault, "repo.vault === suppliedVault");
  assert.deepEqual(Object.keys(repo), ["vault", "project", "findByLabel"]);
  assert.equal(repo.findByLabel, undefined, "no indexed reader on a plain vault");
  const project = { workspaceId: "p", repo, sealer: {} as never, keyring: {} as never };
  assert.equal(new CustomCredentialVaultRepo({ vault }, { project }).project, project);
  const granted = Object.assign(Object.create(vault) as InMemoryVaultRepo, { findByLabel: async () => null });
  const indexed = new CustomCredentialVaultRepo({ vault: granted });
  assert.equal(indexed.vault, granted);
  assert.equal(typeof indexed.findByLabel, "function");
  assert.ok(new InMemoryCustomCredentialSetRepo() instanceof CustomCredentialVaultRepo);
});

test("prototype-derived repo wrappers (Object.create) still reach the host policy", async () => {
  const wrapper = Object.create(new InMemoryCustomCredentialSetRepo()) as InMemoryCustomCredentialSetRepo;
  assert.equal(await wrapper.findById({ workspaceId: "w", id: "missing" }), null);
  assert.deepEqual(await wrapper.listByWorkspace({ workspaceId: "w" }), []);
});

test("Tovu bindings keep the tovu owner scope and canonical VaultError codes", () => {
  assert.deepEqual(customVaultScope({ workspaceId: "w" }), { workspaceId: "w", kind: "vendor", ownerKey: "tovu", principalId: null, binding: null });
  assert.deepEqual(customVaultScope({ workspaceId: "w", id: "i", kind: "custom" }), { workspaceId: "w", kind: "custom", ownerKey: "tovu", principalId: null, binding: null, id: "i" });
  const row = { ...customVaultScope({ workspaceId: "w", id: "i" }), id: "i", provider: null, label: "L", isDefault: false, revision: 1,
    sealed: { keyId: "k", ciphertext: "c", nonce: "n", alg: "a" }, last4: null, tokenLength: null,
    meta: { credentialType: "custom", worksFor: [], category: "ops", baseUrl: "https://a.example", additionalHosts: [], username: null },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  assert.throws(() => customVaultRecord({ row: { ...row, ownerKey: "other" } }), (error: unknown) => error instanceof VaultError && error.code === "context");
  assert.throws(() => customVaultRecord({ row: { ...row, sealed: null } }), (error: unknown) => error instanceof VaultError && error.code === "invalid-record");
  const record = customVaultRecord({ row, expectedRevision: 1 });
  assert.equal(record.vaultExpectedRevision, 1);
  assert.equal(Object.keys(record).includes("vaultRecord"), false);
});

test("a vault label conflict keeps the historical raw UNIQUE message", async () => {
  const repo = new InMemoryCustomCredentialSetRepo();
  const base = { workspaceId: "w", label: "Same", category: "ops" as const, baseUrl: "https://a.example", additionalHosts: [], worksFor: [],
    sealed: { keyId: "k", ciphertext: "c", nonce: "n", alg: "a" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  await repo.insert({ ...base, id: "a" });
  await assert.rejects(repo.insert({ ...base, id: "b" }), { message: "UNIQUE constraint failed: secrets_vault.workspace_id, secrets_vault.kind, secrets_vault.label" });
});
