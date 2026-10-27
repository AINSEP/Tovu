import { protectProjectKeyDeletes } from "#src/features/project-keys/protected-vault";
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

test("a site's own row overrides the project's; other sites keep the project's", async () => {
  const project = projectScope();
  const siteA = siteDeps({ project });
  const siteB = siteDeps({ project });
  await save(siteA, SITE_A, "hosting", secret("project"));
  const own = await save(siteB, SITE_B, "hosting", secret("site-b"), { scope: "site" });
  assert.equal(own.scope, "site");
  assert.equal((await resolveCustomCredentialByLabel(siteB, { workspaceId: SITE_B, label: "hosting" }))?.connection.token, secret("site-b"));
  assert.equal((await resolveCustomCredentialByLabel(siteA, { workspaceId: SITE_A, label: "hosting" }))?.connection.token, secret("project"));
  const listed = await listCustomCredentials(siteB, { workspaceId: SITE_B });
  assert.deepEqual(listed.map(({ label, scope }) => ({ label, scope })), [{ label: "hosting", scope: "site" }], "the shadowed project row is not listed twice");
});

test("an existing site-only credential keeps working, listed beside project rows in label order", async () => {
  const project = projectScope();
  const site = siteDeps({ project });
  await save(site, SITE_A, "b-legacy", secret("legacy"), { scope: "site" });
  await save(site, SITE_A, "a-shared", secret("shared"));
  await save(site, SITE_A, "c-shared", secret("shared-c"));
  assert.equal((await resolveCustomCredentialByLabel(site, { workspaceId: SITE_A, label: "b-legacy" }))?.connection.token, secret("legacy"));
  const listed = await listCustomCredentials(site, { workspaceId: SITE_A });
  assert.deepEqual(listed.map(({ label, scope }) => [label, scope]), [["a-shared", "project"], ["b-legacy", "site"], ["c-shared", "project"]]);
});

test("a project save whose label this site already uses is refused (the site row would hide it)", async () => {
  const project = projectScope();
  const site = siteDeps({ project });
  await save(site, SITE_A, "hosting", secret("legacy"), { scope: "site" });
  await assert.rejects(save(site, SITE_A, "hosting", secret("new")), CustomCredentialDuplicateLabelError);
  await assert.rejects(save(site, SITE_A, "other", secret("new"), { scope: "everywhere" }), CustomCredentialValidationError);
  assert.deepEqual(await project.repo.listByWorkspace({ workspaceId: "project" }), []);
});

test("T6: project key renames refuse site-owned and unattached project labels", async (t) => {
  const project = projectScope();
  const attachments = fakeAttachments();
  const site = siteDeps({ project: { ...project,
    repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: project.repo.vault!, siteId: SITE_A, attachments }) }),
    deletionRepo: project.repo,
  } });
  const siteKey = await save(site, SITE_A, "site-label", secret("site"), { scope: "site" });
  const first = await save(site, SITE_A, "first-project-key", secret("first"));
  const second = await save(site, SITE_A, "second-project-key", secret("second"));
  const hidden = await save(site, SITE_A, "hidden-project-label", secret("hidden"));
  await attachments.attach({ siteId: SITE_A, siteName: "A", keyId: first.id });
  await attachments.attach({ siteId: SITE_A, siteName: "A", keyId: second.id });
  assert.equal(await describeCredential(site, { workspaceId: SITE_A, id: hidden.id }), null);

  await t.test("a site label collision is refused before it hides the renamed project key", async () => {
    await assert.rejects(
      updateCustomCredential(site, { workspaceId: SITE_A, id: first.id, label: siteKey.label }),
      CustomCredentialDuplicateLabelError,
    );
    assert.equal((await describeCredentialByLabel(site, { workspaceId: SITE_A, label: first.label }))?.id, first.id);
    assert.equal((await describeCredentialByLabel(site, { workspaceId: SITE_A, label: siteKey.label }))?.id, siteKey.id);
    assert.equal((await project.repo.findById({ workspaceId: project.workspaceId, id: first.id }))?.label, first.label);
  });

  await t.test("an unattached project label collision is translated to the domain duplicate error", async () => {
    await assert.rejects(
      updateCustomCredential(site, { workspaceId: SITE_A, id: second.id, label: hidden.label }),
      CustomCredentialDuplicateLabelError,
    );
    assert.equal((await describeCredentialByLabel(site, { workspaceId: SITE_A, label: second.label }))?.id, second.id);
    assert.equal((await project.repo.findById({ workspaceId: project.workspaceId, id: second.id }))?.label, second.label);
    assert.equal((await project.repo.findById({ workspaceId: project.workspaceId, id: hidden.id }))?.label, hidden.label);
    assert.equal(await describeCredential(site, { workspaceId: SITE_A, id: hidden.id }), null);
    assert.equal(await attachments.isAttached({ siteId: SITE_A, keyId: hidden.id }), false);
  });
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
  const a = siteDeps({ project: { ...project, repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: raw, siteId: SITE_A, attachments }) }) } });
  const saved = await save(a, SITE_A, "attached-only", secret("attached"));
  assert.equal(await describeCredential(a, { workspaceId: SITE_A, id: saved.id }), null);
  assert.equal(await resolveCustomCredentialByLabel(a, { workspaceId: SITE_A, label: "attached-only" }), null);
  await attachments.attach({ siteId: SITE_A, keyId: saved.id, siteName: "A" });
  assert.equal((await resolveCustomCredentialByLabel(a, { workspaceId: SITE_A, label: "attached-only" }))?.connection.token, secret("attached"));
  const b = siteDeps({ project: { ...project, repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: raw, siteId: SITE_B, attachments }) }) } });
  assert.equal(await describeCredential(b, { workspaceId: SITE_B, id: saved.id }), null);
  await attachments.detach({ siteId: SITE_A, keyId: saved.id });
  assert.deepEqual(await listCustomCredentials(a, { workspaceId: SITE_A }), []);
});


test("an explicit delete can remove an unattached project key and refuses a hidden key used by another site", async () => {
  const project = projectScope(); const attachments = fakeAttachments();
  const raw = project.repo.vault!;
  const protectedVault = protectProjectKeyDeletes({ vault: raw, attachments, siteId: SITE_A, transaction: async ({ run }) => run() });
  const deps = siteDeps({ project: { ...project,
    repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: protectedVault, siteId: SITE_A, attachments }) }),
    deletionRepo: new CustomCredentialVaultRepo({ vault: protectedVault }),
  } });
  const saved = await save(deps, SITE_A, "unused", secret("unused"));
  assert.equal(await describeCredential(deps, { workspaceId: SITE_A, id: saved.id }), null);
  await deleteCustomCredential(deps, { workspaceId: SITE_A, id: saved.id });
  assert.equal(await raw.find({ workspaceId: "project", id: saved.id }), null);
  const next = await save(deps, SITE_A, "used-elsewhere", secret("elsewhere"));
  await attachments.attach({ siteId: SITE_B, siteName: "B", keyId: next.id });
  await assert.rejects(deleteCustomCredential(deps, { workspaceId: SITE_A, id: next.id }), { message: "Used by B too. To stop using it here, choose 'Stop using it on this site'." });
  assert.equal((await raw.find({ workspaceId: "project", id: next.id }))?.id, next.id);
});
