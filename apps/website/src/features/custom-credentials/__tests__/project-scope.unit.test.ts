import { attachedOnlyVault } from "#src/features/project-keys/attached-vault";
import { fakeAttachments } from "#src/features/project-keys/__tests__/helpers";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { abortGuardedCredentialRepo } from "../../vendor-credentials/abort-guarded-repo.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  deleteCustomCredential,
  describeCredential,
  describeCredentialByLabel,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CustomCredentialWriteDeps,
} from "../store.js";
import type { CustomCredentialProjectScope } from "../types.js";
import { CustomCredentialVaultRepo } from "../vault-repo.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file Custom credentials save to the project (owner 2026-10-25); a site's own row wins over an
 * attached project row. Scope tests inject an unfiltered project repo; attachment tests below use
 * the production attached-only view. A server without a project store (Fly) stays site-only.
 * Real AES-GCM sealing with a separate key per store, so a row only opens with the store that sealed it.
 */

const SITE_A = "ws-site-a";
const SITE_B = "ws-site-b";
// Fake secrets built at runtime, never literals that look like a key.
const secret = (name: string) => `${name}-${"x".repeat(8)}-${name.length}1234`;

function projectScope(): CustomCredentialProjectScope {
  const keyring = new InMemoryKeyring();
  return { workspaceId: "project", repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring };
}

let ids = 0;
function siteDeps(optional: { project?: CustomCredentialProjectScope } = {}): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return { repo: new CustomCredentialVaultRepo({ vault: new InMemoryVaultRepo({}) }, optional), sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-25T00:00:00.000Z" }), idGen: { newId: () => `cred-${++ids}` } };
}

const save = (deps: CustomCredentialWriteDeps, workspaceId: string, label: string, token: string, optional: { scope?: string } = {}) =>
  createCustomCredential(deps, { workspaceId, label, category: "hosting", baseUrl: "https://api.example.test", connection: { token }, ...optional });

test("a save lands in the project store and a second site of the project reads it", async () => {
  const project = projectScope();
  const siteA = siteDeps({ project });
  const siteB = siteDeps({ project });
  const token = secret("shared");
  const saved = await save(siteA, SITE_A, "hosting", token);
  assert.equal(saved.scope, "project");
  assert.deepEqual(await siteA.repo.listByWorkspace({ workspaceId: SITE_A }), [], "nothing in site A's own vault");
  assert.equal((await project.repo.listByWorkspace({ workspaceId: "project" })).length, 1);
  assert.equal((await resolveCustomCredentialByLabel(siteB, { workspaceId: SITE_B, label: "hosting" }))?.connection.token, token);
  assert.equal((await describeCredentialByLabel(siteB, { workspaceId: SITE_B, label: "hosting" }))?.scope, "project");
  assert.equal((await describeCredential(siteB, { workspaceId: SITE_B, id: saved.id }))?.scope, "project");
});

test("an explicit local save stays editable with a configured owner store", async () => {
  const project = projectScope(), site = siteDeps({ project });
  const saved = await save(site, SITE_A, "hosting", secret("project"));
  const local = await save(site, SITE_A, "other", secret("site"), { scope: "site" });
  await updateCustomCredential(site, { workspaceId: SITE_A, id: local.id, connection: { token: secret("rotated") } });
  assert.equal((await resolveCustomCredentialByLabel(site, { workspaceId: SITE_A, label: "other" }))?.connection.token, secret("rotated"));
  assert.equal((await describeCredentialByLabel(site, { workspaceId: SITE_A, label: "hosting" }))?.id, saved.id);
});

test("existing local keys remain readable when an owner store is configured", async () => {
  const old = siteDeps();
  await save(old, SITE_A, "legacy", secret("legacy"));
  const project = projectScope();
  const site = { ...old, repo: new CustomCredentialVaultRepo({ vault: old.repo.vault! }, { project }) };
  assert.equal((await resolveCustomCredentialByLabel(site, { workspaceId: SITE_A, label: "legacy" }))?.connection.token, secret("legacy"));
  assert.equal((await listCustomCredentials(site, { workspaceId: SITE_A })).length, 1);
});

test("a project save whose label this site already uses is refused (the site row would hide it)", async () => {
  const project = projectScope();
  const site = siteDeps({ project });
  await save({ ...site, repo: new CustomCredentialVaultRepo({ vault: site.repo.vault! }) }, SITE_A, "hosting", secret("legacy"));
  await assert.rejects(save(site, SITE_A, "hosting", secret("new")), CustomCredentialDuplicateLabelError);
  await assert.rejects(save(site, SITE_A, "other", secret("new"), { scope: "everywhere" }), CustomCredentialValidationError);
  assert.deepEqual(await project.repo.listByWorkspace({ workspaceId: "project" }), []);
});

test("a granted consumer cannot rename or rotate the shared owner entry", async () => {
  const project = projectScope(), owner = siteDeps({ project });
  const saved = await save(owner, SITE_A, "shared", secret("owner"));
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: SITE_A, siteName: "A", keyId: saved.id });
  const site = siteDeps({ project: { ...project, createRepo: project.repo, repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: project.repo.vault!, siteId: SITE_A, attachments }) }) } });
  await assert.rejects(updateCustomCredential(site, { workspaceId: SITE_A, id: saved.id, label: "changed" }), /Shared Keys/);
  assert.equal((await project.repo.findById({ workspaceId: "project", id: saved.id }))?.label, "shared");
});

test("without a project store (Fly / production) saves go to the site vault and summaries carry no scope", async () => {
  const site = siteDeps();
  const saved = await save(site, SITE_A, "hosting", secret("fly"));
  assert.equal("scope" in saved, false);
  assert.equal((await site.repo.listByWorkspace({ workspaceId: SITE_A })).length, 1);
  assert.equal((await resolveCustomCredentialByLabel(site, { workspaceId: SITE_A, label: "hosting" }))?.connection.token, secret("fly"));
  assert.equal("scope" in (await listCustomCredentials(site, { workspaceId: SITE_A }))[0]!, false);
  // "project" asked for where there is none: still the site vault.
  assert.equal("scope" in (await save(site, SITE_A, "other", secret("fly2"), { scope: "project" })), false);
});

test("a project row is rotated and deleted where it lives, for every site", async () => {
  const project = projectScope();
  const siteA = siteDeps({ project });
  const siteB = siteDeps({ project });
  const saved = await save(siteA, SITE_A, "hosting", secret("first"));
  const rotated = await updateCustomCredential(siteB, { workspaceId: SITE_B, id: saved.id, connection: { token: secret("second") } });
  assert.equal(rotated.scope, "project");
  assert.equal((await resolveCustomCredentialByLabel(siteA, { workspaceId: SITE_A, label: "hosting" }))?.connection.token, secret("second"));
  assert.deepEqual(await siteB.repo.listByWorkspace({ workspaceId: SITE_B }), []);
  await deleteCustomCredential(siteB, { workspaceId: SITE_B, id: saved.id });
  assert.equal(await resolveCustomCredentialByLabel(siteA, { workspaceId: SITE_A, label: "hosting" }), null);
});

test("a project row opens only with the project's key", async () => {
  const project = projectScope();
  const site = siteDeps({ project });
  await save(site, SITE_A, "hosting", secret("sealed"));
  const otherKey = new InMemoryKeyring();
  const wrongKey = siteDeps({ project: { ...project, sealer: new AesGcmSecretSealer(otherKey), keyring: otherKey } });
  await assert.rejects(resolveCustomCredentialByLabel(wrongKey, { workspaceId: SITE_A, label: "hosting" }), CustomCredentialSecretStoreUnconfiguredError);
});

test("an aborted save never writes the project half either", async () => {
  const project = projectScope();
  const site = siteDeps({ project });
  const controller = new AbortController();
  controller.abort();
  const guarded = { ...site, repo: abortGuardedCredentialRepo({ store: site.repo, signal: controller.signal }) };
  await assert.rejects(save(guarded, SITE_A, "hosting", secret("late")));
  assert.deepEqual(await project.repo.listByWorkspace({ workspaceId: "project" }), []);
});


test("custom project keys stay hidden until attached and detach immediately across label and id lookups", async () => {
  const project = projectScope(); const attachments = fakeAttachments();
  const raw = project.repo.vault!;
  const a = siteDeps({ project: { ...project, createRepo: project.repo, repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: raw, siteId: SITE_A, attachments }) }) } });
  const saved = await save(a, SITE_A, "attached-only", secret("attached"));
  assert.equal(await describeCredential(a, { workspaceId: SITE_A, id: saved.id }), null);
  assert.equal(await resolveCustomCredentialByLabel(a, { workspaceId: SITE_A, label: "attached-only" }), null);
  await attachments.attach({ siteId: SITE_A, keyId: saved.id, siteName: "A" });
  assert.equal((await resolveCustomCredentialByLabel(a, { workspaceId: SITE_A, label: "attached-only" }))?.connection.token, secret("attached"));
  const b = siteDeps({ project: { ...project, createRepo: project.repo, repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: raw, siteId: SITE_B, attachments }) }) } });
  assert.equal(await describeCredential(b, { workspaceId: SITE_B, id: saved.id }), null);
  await attachments.detach({ siteId: SITE_A, keyId: saved.id });
  assert.deepEqual(await listCustomCredentials(a, { workspaceId: SITE_A }), []);
});


test("the trusted owner replacement port rotates only a granted shared key", async () => {
  const project = projectScope(), owner = siteDeps({ project });
  const saved = await save(owner, SITE_A, "shared", secret("first"));
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: SITE_A, siteName: "A", keyId: saved.id });
  const view = attachedOnlyVault({ vault: project.repo.vault!, siteId: SITE_A, attachments });
  const site = siteDeps({ project: { ...project, createRepo: project.repo, replaceRepo: project.repo,
    repo: new CustomCredentialVaultRepo({ vault: view }) } });
  await assert.rejects(updateCustomCredential(site, { workspaceId: SITE_A, id: saved.id, connection: { token: secret("denied") } }), /Shared Keys/);
  await updateCustomCredential({ ...site, allowSharedKeyReplacement: true }, { workspaceId: SITE_A, id: saved.id, connection: { token: secret("second") } });
  assert.equal((await resolveCustomCredentialByLabel(site, { workspaceId: SITE_A, label: "shared" }))?.connection.token, secret("second"));
  await attachments.detach({ siteId: SITE_A, keyId: saved.id });
  await assert.rejects(updateCustomCredential({ ...site, allowSharedKeyReplacement: true }, { workspaceId: SITE_A, id: saved.id, connection: { token: secret("denied") } }), /no custom credential/);
});
