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
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  deleteCustomCredential,
  describeCredential,
  describeCredentialByLabel,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  shareCustomCredentialWithProject,
  updateCustomCredential,
  type CustomCredentialWriteDeps,
} from "../store.js";
import type { CustomCredentialProjectScope } from "../types.js";
import { CustomCredentialVaultRepo } from "../vault-repo.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file Custom credentials are project-first (owner 2026-10-25): a save lands in the project store
 * every site of the project shares; a site's own row (existing, or saved "only for this site") wins
 * over the project's; a server without a project store (Fly) keeps today's site-only behaviour.
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

test("Share with all sites copies a site-only row into the project (same id), verified, then drops the site copy", async () => {
  const project = projectScope();
  const siteA = siteDeps({ project });
  const siteB = siteDeps({ project });
  const token = secret("legacy");
  const own = await save(siteA, SITE_A, "hosting", token, { scope: "site" });
  const shared = await shareCustomCredentialWithProject(siteA, { workspaceId: SITE_A, id: own.id });
  assert.deepEqual({ id: shared.id, scope: shared.scope, label: shared.label }, { id: own.id, scope: "project", label: "hosting" });
  assert.equal(JSON.stringify(shared).includes(token), false, "the summary never carries the secret");
  assert.deepEqual(await siteA.repo.listByWorkspace({ workspaceId: SITE_A }), []);
  assert.equal((await resolveCustomCredentialByLabel(siteB, { workspaceId: SITE_B, label: "hosting" }))?.connection.token, token);
  assert.equal((await resolveCustomCredentialByLabel(siteA, { workspaceId: SITE_A, label: "hosting" }))?.connection.token, token);
});

test("Share replaces a same-label project row in place; refuses without a project or a site row", async () => {
  const project = projectScope();
  const siteA = siteDeps({ project });
  const siteB = siteDeps({ project });
  const before = await save(siteA, SITE_A, "hosting", secret("old"));
  const own = await save(siteB, SITE_B, "hosting", secret("newer"), { scope: "site" });
  const shared = await shareCustomCredentialWithProject(siteB, { workspaceId: SITE_B, id: own.id });
  assert.equal(shared.id, before.id);
  assert.equal((await resolveCustomCredentialByLabel(siteA, { workspaceId: SITE_A, label: "hosting" }))?.connection.token, secret("newer"));
  await assert.rejects(shareCustomCredentialWithProject(siteB, { workspaceId: SITE_B, id: before.id }), CustomCredentialNotFoundError);
  await assert.rejects(shareCustomCredentialWithProject(siteDeps(), { workspaceId: SITE_A, id: "x" }), CustomCredentialValidationError);
});

test("a failed project write leaves the site row in place", async () => {
  const project = projectScope();
  const site = siteDeps({ project });
  const own = await save(site, SITE_A, "hosting", secret("keep"), { scope: "site" });
  const insert = project.repo.insert.bind(project.repo);
  project.repo.insert = async () => { throw new Error("disk full"); };
  await assert.rejects(shareCustomCredentialWithProject(site, { workspaceId: SITE_A, id: own.id }), /disk full/);
  project.repo.insert = insert;
  assert.equal((await describeCredential(site, { workspaceId: SITE_A, id: own.id }))?.scope, "site");
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
