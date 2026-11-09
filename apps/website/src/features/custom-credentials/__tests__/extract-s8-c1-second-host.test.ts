import assert from "node:assert/strict";
import test from "node:test";
import { buildVaultAad, createVaultMetaParsers, InMemoryVaultRepo, SecretsVaultService, VaultError, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { CredentialSetProjectScope } from "@jini-ai/core/contracts/credentials";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { CredentialSetStoreHost, CredentialSetVaultPolicy } from "../sets/host.js";
import { CredentialSetVaultRepo } from "../sets/vault-repo.js";
import {
  createCredentialSet, deleteCredentialSet, describeCredentialSet, describeCredentialSetByLabel, listCredentialSets,
  resolveCredentialSetByLabel, updateCredentialSet, CustomCredentialDuplicateLabelError, CustomCredentialValidationError,
  type CredentialSetWriteDeps,
} from "../sets/store.js";

/**
 * @file EXTRACT-S8 C1 seam: a SECOND host (owner `acme-host`, its own categories, messages, token
 * policy and scope policy) drives the host-wired credential-set store and vault repo with no Tovu
 * binding. Proves owner/kind enforcement through injected inputs, canonical error construction and
 * classification, scope/replace/grant order, same-vault identity and read/open/seal/write counts.
 */

type Cat = "alpha" | "beta";
const OWNER = "acme-host";
const SITE = "site-ws";
const PROJECT = "project-ws";

class AcmeInputError extends Error {}
class AcmeCreateConflict extends Error {}

/** Counts every vault read/write on one in-memory vault. */
function countedVault() {
  const inner = new InMemoryVaultRepo({});
  const counts = { find: 0, list: 0, put: 0, delete: 0, findByLabel: 0 };
  const vault: VaultRepoPort = {
    find: (input, options) => { counts.find++; return inner.find(input, options); },
    list: (input, options) => { counts.list++; return inner.list(input, options); },
    put: (input, options) => { counts.put++; return inner.put(input, options); },
    patchMeta: (input, options) => inner.patchMeta(input, options),
    delete: (input, options) => { counts.delete++; return inner.delete(input, options); },
  };
  return { vault, counts, inner };
}

/** A real AES-GCM sealer whose seal/open calls are counted. */
function countedSealer() {
  const keyring = new InMemoryKeyring();
  const real = new AesGcmSecretSealer(keyring);
  const counts = { seal: 0, open: 0 };
  const sealer = {
    seal: (input: Parameters<AesGcmSecretSealer["seal"]>[0]) => { counts.seal++; return real.seal(input); },
    open: (input: Parameters<AesGcmSecretSealer["open"]>[0], optional?: Parameters<AesGcmSecretSealer["open"]>[1]) => { counts.open++; return real.open(input, optional); },
  };
  return { sealer, keyring, counts };
}

function makeHost() {
  const created: string[] = [];
  const policy: CredentialSetVaultPolicy = {
    ownerKey: OWNER,
    parseMeta: ({ kind, meta, provider }) => createVaultMetaParsers({})[kind]({ meta, provider }),
    compareLabels: (a, b) => {
      if (a.label < b.label) return -1;
      return a.label > b.label ? 1 : 0;
    },
    vaultErrors: {
      create: ({ code }) => { created.push(code); return new VaultError({ code }); },
      codeOf: error => (error instanceof VaultError ? error.code : undefined),
    },
    labelConflict: () => new Error("ACME-UNIQUE label"),
  };
  const host: CredentialSetStoreHost<Cat> = {
    vault: policy,
    openVault: ({ deps, kind }) => new SecretsVaultService({
      repo: deps.repo.vault!, keyring: deps.keyring!, sealer: deps.sealer, metaParsers: createVaultMetaParsers({}),
      authorize: async ({ context }) => { if (context.ownerKey !== OWNER || context.kind !== kind) throw new VaultError({ code: "context" }); },
      now: () => "2026-11-09T00:00:00.000Z", newId: () => { throw new Error("id is minted by the store"); },
    }),
    scopes: (deps, workspaceId) => {
      const site = { deps, workspaceId, scope: "site" as const };
      const project = deps.repo.project;
      return project ? [site, { deps: { ...deps, repo: project.repo, sealer: project.sealer, keyring: project.keyring }, workspaceId: project.workspaceId, scope: "project" as const }] : [site];
    },
    createTarget: (deps, input, invalid) => {
      if (input.scope !== undefined && input.scope !== "site" && input.scope !== "project") throw invalid("ACME scope?");
      const project = deps.repo.project;
      if (!project || input.scope === "site") return { deps, workspaceId: input.workspaceId, scope: "site" };
      return { deps: { ...deps, repo: project.createRepo ?? project.repo, sealer: project.sealer, keyring: project.keyring }, workspaceId: project.workspaceId, scope: "project" };
    },
    isUniqueViolation: error => error instanceof Error && error.message.startsWith("ACME-UNIQUE"),
    isCreateConflict: (error): error is Error => error instanceof AcmeCreateConflict,
    token: {
      normalize: ({ value }) => { if (typeof value !== "string" || value.trim() === "") throw new AcmeInputError("ACME: token required"); return value.trim(); },
      assertFreeField: ({ value, field }) => { if (value.includes("sk_live")) throw new AcmeInputError(`ACME: ${field} looks secret`); },
      isInputError: (error): error is Error => error instanceof AcmeInputError,
    },
    normalizeWorksFor: ({ value }) => {
      if (!Array.isArray(value) || value.some(id => typeof id !== "string")) throw new VaultError({ code: "invalid-meta" });
      return [...new Set(value as string[])];
    },
    categories: ["alpha", "beta"],
    messages: {
      storage: "ACME storage", worksForInvalid: "ACME worksFor", sharedReplacementReadOnly: "ACME replace read-only",
      sharedDeleteReadOnly: "ACME delete read-only", duplicateLabel: ({ label }) => `ACME dup ${label}`,
      projectDuplicateLabel: ({ label }) => `ACME project dup ${label}`, notFound: ({ id }) => `ACME missing ${id}`,
    },
  };
  return { host, policy, created };
}

function siteDeps(optional: { project?: CredentialSetProjectScope<Cat>; findRowByLabel?: boolean } = {}) {
  const v = countedVault();
  const s = countedSealer();
  const repo = new CredentialSetVaultRepo<Cat>({ vault: v.vault, policy: makeHost().policy }, {
    ...(optional.project ? { project: optional.project } : {}),
    ...(optional.findRowByLabel ? { findRowByLabel: async (input: { workspaceId: string; label: string }) => { v.counts.findByLabel++; return (await v.inner.list({ workspaceId: input.workspaceId, kind: "vendor", ownerKey: OWNER, principalId: null })).find(row => row.label === input.label) ?? null; } } : {}),
  });
  let n = 0;
  const deps: CredentialSetWriteDeps<Cat> = { repo, sealer: s.sealer, keyring: s.keyring, clock: { nowMs: () => 0 }, idGen: { newId: () => { n += 1; return `id-${n}`; } } };
  return { deps, vault: v, sealer: s, repo };
}

const base = { workspaceId: SITE, label: "Main", category: "alpha", baseUrl: "https://api.acme.test/v1", connection: { token: "tok-0123456789abcdef", username: "ops" } };

test("second host: create stores the injected owner and kind, one seal, one put; summary is safe", async () => {
  const { host } = makeHost();
  const s = siteDeps();
  const summary = await createCredentialSet({ host, deps: s.deps, input: base });
  assert.deepEqual({ category: summary.category, credentialType: summary.credentialType, username: summary.username, tokenHint: summary.tokenHint }, { category: "alpha", credentialType: "custom", username: "ops", tokenHint: { length: 20, last4: "cdef" } });
  assert.equal(JSON.stringify(summary).includes("tok-0123"), false);
  assert.equal("scope" in summary, false);
  const [row] = await s.vault.inner.list({ workspaceId: SITE, kind: "vendor", ownerKey: OWNER, principalId: null });
  assert.deepEqual({ ownerKey: row!.ownerKey, kind: row!.kind, principalId: row!.principalId, binding: row!.binding, provider: row!.provider, credentialType: row!.meta.credentialType },
    { ownerKey: OWNER, kind: "vendor", principalId: null, binding: null, provider: null, credentialType: "custom" });
  assert.deepEqual({ seal: s.sealer.counts.seal, open: s.sealer.counts.open, put: s.vault.counts.put }, { seal: 1, open: 0, put: 1 });
  assert.equal(s.repo.vault, s.deps.repo.vault, "same vault object");
});

test("second host: categories, token policy and messages are the host's, in the original validation order", async () => {
  const { host } = makeHost();
  const s = siteDeps();
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: { ...base, label: "", category: "nope" } }), new CustomCredentialValidationError("label must be a non-empty string"));
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: { ...base, category: "ops" } }), new CustomCredentialValidationError("category must be one of: alpha, beta"));
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: { ...base, connection: { token: " " } } }), new CustomCredentialValidationError("ACME: token required"));
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: { ...base, label: "sk_live_x" } }), new CustomCredentialValidationError("ACME: label looks secret"));
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: { ...base, worksFor: [1] } }), new CustomCredentialValidationError("ACME worksFor"));
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: { ...base, scope: "elsewhere" } }), new CustomCredentialValidationError("ACME scope?"));
  await assert.rejects(updateCredentialSet({ host, deps: s.deps, input: { workspaceId: SITE, id: "missing" } }), { message: "ACME missing missing" });
  assert.equal(s.sealer.counts.seal, 0, "nothing sealed for rejected input");
});

test("second host: metadata reads open nothing; resolve opens only the selected row with same-read metadata", async () => {
  const { host } = makeHost();
  const s = siteDeps();
  const first = await createCredentialSet({ host, deps: s.deps, input: base });
  await createCredentialSet({ host, deps: s.deps, input: { ...base, label: "Decoy", category: "beta", connection: { token: "decoy-token-xyz-0001" } } });
  const opensBefore = s.sealer.counts.open;
  assert.deepEqual((await listCredentialSets({ host, deps: s.deps, input: { workspaceId: SITE } })).map(row => row.label), ["Decoy", "Main"]);
  assert.equal((await describeCredentialSet({ host, deps: s.deps, input: { workspaceId: SITE, id: first.id } }))?.label, "Main");
  assert.equal((await describeCredentialSetByLabel({ host, deps: s.deps, input: { workspaceId: SITE, label: "Main" } }))?.id, first.id);
  assert.equal(s.sealer.counts.open, opensBefore, "metadata reads never decrypt");
  const resolved = await resolveCredentialSetByLabel({ host, deps: s.deps, input: { workspaceId: SITE, label: "Main" } });
  assert.deepEqual(resolved, { id: first.id, category: "alpha", baseUrl: "https://api.acme.test/v1", additionalHosts: [], connection: { token: "tok-0123456789abcdef", username: "ops" } });
  assert.equal(s.sealer.counts.open, opensBefore + 1, "exactly one open");
});

test("second host: rows outside the trusted owner are refused with the injected canonical context error", async () => {
  const { host, policy, created } = makeHost();
  const s = siteDeps();
  const made = await createCredentialSet({ host, deps: s.deps, input: base });
  const [row] = await s.vault.inner.list({ workspaceId: SITE, kind: "vendor", ownerKey: OWNER, principalId: null });
  const foreign = new CredentialSetVaultRepo<Cat>({ vault: s.vault.vault, policy: { ...policy, ownerKey: "someone-else" } });
  await assert.rejects(foreign.findById({ workspaceId: SITE, id: made.id }), (error: unknown) => policy.vaultErrors.codeOf(error) === "context");
  assert.equal(created.at(-1), "context");
  const record = await s.repo.findById({ workspaceId: SITE, id: made.id });
  assert.equal(Object.keys(record!).includes("vaultRecord"), false, "private context is non-enumerable");
  assert.equal(record!.vaultRecord!.revision, row!.revision);
  assert.equal(JSON.stringify(record).includes("vaultExpectedRevision"), false);
});

test("second host: a same-store duplicate maps the injected UNIQUE error to the host duplicate message", async () => {
  const { host } = makeHost();
  const s = siteDeps();
  await createCredentialSet({ host, deps: s.deps, input: base });
  await assert.rejects(createCredentialSet({ host, deps: s.deps, input: base }), (error: unknown) => error instanceof CustomCredentialDuplicateLabelError && error.message === "ACME dup Main");
});

test("second host: project scope order, trusted replacement and read-only delete use the host policy", async () => {
  const { host } = makeHost();
  const project = siteDeps();
  const replace = { calls: 0 };
  const replaceRepo = new Proxy(project.repo, { get: (target, key, receiver) => {
    if (key === "update") return (record: Parameters<typeof target.update>[0]) => { replace.calls++; return target.update(record); };
    const value = Reflect.get(target, key, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const scope: CredentialSetProjectScope<Cat> = { workspaceId: PROJECT, repo: project.repo, createRepo: project.repo, replaceRepo, sealer: project.sealer.sealer, keyring: project.sealer.keyring };
  const site = siteDeps({ project: scope });
  const shared = await createCredentialSet({ host, deps: site.deps, input: base });
  assert.equal(shared.scope, "project");
  assert.deepEqual({ projectPut: project.vault.counts.put, sitePut: site.vault.counts.put }, { projectPut: 1, sitePut: 0 });
  const local = await createCredentialSet({ host, deps: site.deps, input: { ...base, label: "Local", scope: "site" } });
  assert.equal(local.scope, "site");
  await assert.rejects(createCredentialSet({ host, deps: site.deps, input: { ...base, label: "Local" } }), { message: "ACME dup Local" });
  const resolved = await resolveCredentialSetByLabel({ host, deps: site.deps, input: { workspaceId: SITE, label: "Main" } });
  assert.equal(resolved?.id, shared.id);
  assert.deepEqual({ projectOpen: project.sealer.counts.open, siteOpen: site.sealer.counts.open }, { projectOpen: 1, siteOpen: 0 }, "project row opens with the project sealer");
  await assert.rejects(updateCredentialSet({ host, deps: site.deps, input: { workspaceId: SITE, id: shared.id, label: "Renamed" } }), new CustomCredentialValidationError("ACME replace read-only"));
  const renamed = await updateCredentialSet({ host, deps: { ...site.deps, allowSharedKeyReplacement: true }, input: { workspaceId: SITE, id: shared.id, label: "Renamed" } });
  assert.deepEqual({ label: renamed.label, scope: renamed.scope, replaceCalls: replace.calls }, { label: "Renamed", scope: "project", replaceCalls: 1 });
  await assert.rejects(deleteCredentialSet({ host, deps: site.deps, input: { workspaceId: SITE, id: shared.id } }), new CustomCredentialValidationError("ACME delete read-only"));
  await deleteCredentialSet({ host, deps: site.deps, input: { workspaceId: SITE, id: local.id } });
  assert.equal(site.vault.counts.delete, 1);
});

test("second host: an indexed findRowByLabel on the same vault replaces the metadata scan", async () => {
  const { host } = makeHost();
  const s = siteDeps({ findRowByLabel: true });
  await createCredentialSet({ host, deps: s.deps, input: base });
  const listsBefore = s.vault.counts.list;
  const found = await describeCredentialSetByLabel({ host, deps: s.deps, input: { workspaceId: SITE, label: "Main" } });
  assert.equal(found?.label, "Main");
  assert.deepEqual({ findByLabel: s.vault.counts.findByLabel, lists: s.vault.counts.list - listsBefore }, { findByLabel: 1, lists: 0 });
});

test("second host: a legacy custom-kind row stays custom on update (stored kind keeps authenticating)", async () => {
  const { host } = makeHost();
  const s = siteDeps();
  // New custom-kind rows cannot be minted through the service (unified kind); seal one as legacy data.
  const identity = { workspaceId: SITE, kind: "custom" as const, ownerKey: OWNER, principalId: null, binding: null, id: "legacy-1" };
  const sealed = await s.sealer.sealer.seal({ plaintext: JSON.stringify({ token: "legacy-token-000111" }), key: await s.sealer.keyring.activeKey(), aad: buildVaultAad(identity) });
  const prepared = { ...identity, provider: null, label: "Legacy", isDefault: false, revision: 1, sealed, last4: null, tokenLength: null,
    meta: { credentialType: "custom", worksFor: [], category: "beta", baseUrl: "https://old.acme.test", additionalHosts: [], username: null },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  await s.vault.vault.put({ record: prepared, expectedRevision: null });
  const updated = await updateCredentialSet({ host, deps: s.deps, input: { workspaceId: SITE, id: "legacy-1", username: "new-user" } });
  assert.equal(updated.username, "new-user");
  const row = await s.vault.inner.find({ workspaceId: SITE, id: "legacy-1" });
  assert.equal(row?.kind, "custom");
  const resolved = await resolveCredentialSetByLabel({ host, deps: s.deps, input: { workspaceId: SITE, label: "Legacy" } });
  assert.equal(resolved?.connection.token, "legacy-token-000111");
});
