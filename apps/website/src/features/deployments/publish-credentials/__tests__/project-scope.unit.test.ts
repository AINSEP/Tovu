import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { abortGuardedCredentialRepo } from "#src/features/vendor-credentials/abort-guarded-repo";
import { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import type { VendorCredentialProjectScope } from "#src/features/vendor-credentials/types";
import { createCustomCredential } from "#src/features/custom-credentials/store";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { loadBundledDeployTargets } from "../../deploy-targets/__tests__/bundled-deploy-targets.fixture.js";
import { createDbPublishCredentialSource } from "../../static-publish/credentials.js";
import {
  createPublishCredential,
  deletePublishCredential,
  findPublishCredentialRecord,
  healAccountLabel,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialValidationError,
  resolveDefaultForPublish,
  updatePublishCredential,
  type PublishCredentialWriteDeps,
} from "../store.js";

/**
 * @file Publish (deploy) credentials are project-first (owner 2026-10-25), the same rule as custom
 * keys: a save lands in the project store every site of the project shares; a site's own row
 * (existing, or saved "only for this site") wins; no project store (Fly) keeps today's behaviour.
 * Includes the regression item 1 opened: a generic API key saved with "Works for: vercel" lands in
 * the project store, and deploy must still find it. Real AES-GCM, a separate key per store.
 */

const SITE_A = "ws-site-a";
const SITE_B = "ws-site-b";
// Fake secrets built at runtime, never literals that look like a key.
const secret = (name: string) => `${name}-${"x".repeat(8)}-${name.length}1234`;

/** One project store: its vault, keyring and sealer, as `project-store.ts`'s `ProjectVaultScope` exposes. */
function projectStore() {
  const keyring = new InMemoryKeyring();
  return { vault: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer(keyring) };
}
type ProjectStoreFixture = ReturnType<typeof projectStore>;

let ids = 0;
/** One site: its own vault, with both credential stores' project halves over the same project vault
 *  (as `deps.ts`'s `credentialProject` attaches them). */
function site(project?: ProjectStoreFixture) {
  const keyring = new InMemoryKeyring();
  const vault = new InMemoryVaultRepo({});
  const half = <R>(repo: R) => project ? { project: { workspaceId: "project", repo, sealer: project.sealer, keyring: project.keyring } } : {};
  const vendorProject = project && half(new VendorCredentialSetVaultRepo({ vault: project.vault, kind: "vendor", vendor: true })).project as VendorCredentialProjectScope;
  const deps: PublishCredentialWriteDeps = {
    repo: new VendorCredentialSetVaultRepo({ vault, kind: "vendor", vendor: true }, vendorProject ? { project: vendorProject } : {}),
    sealer: new AesGcmSecretSealer(keyring), keyring, clock: createFakeClock({ startIso: "2026-10-25T00:00:00.000Z" }),
    idGen: { newId: () => `cred-${++ids}` }, loadDeployTargets: loadBundledDeployTargets,
  };
  const customRepo = new CustomCredentialVaultRepo({ vault }, project ? half(new CustomCredentialVaultRepo({ vault: project.vault })) : {});
  const saveApiKey = (workspaceId: string, label: string, token: string, optional: { scope?: string } = {}) =>
    createCustomCredential({ ...deps, repo: customRepo }, { workspaceId, label, worksFor: ["vercel"], category: "general",
      baseUrl: "https://api.vercel.com", connection: { token }, ...optional });
  return { deps, saveApiKey, source: createDbPublishCredentialSource(deps) };
}

const saveVercel = (deps: PublishCredentialWriteDeps, workspaceId: string, label: string, token: string, optional: { scope?: string } = {}) =>
  createPublishCredential(deps, { workspaceId, label, connection: { providerId: "vercel", token }, ...optional });

test("regression: an API key saved with Works for vercel lands in the project and deploy finds it", async () => {
  const project = projectStore();
  const a = site(project);
  const token = secret("api");
  const key = await a.saveApiKey(SITE_A, "Production access", token);
  assert.equal(key.scope, "project");
  assert.equal(await a.deps.repo.findById({ workspaceId: SITE_A, id: key.id }), null, "nothing in the site vault");

  assert.deepEqual(await a.source.isConfigured({ workspaceId: SITE_A, target: "vercel" }), { configured: true });
  assert.deepEqual(await a.source.resolve({ workspaceId: SITE_A, target: "vercel" }), { ok: true, token, credentialId: key.id });
  assert.deepEqual(await a.source.resolve({ workspaceId: SITE_A, target: "vercel", credentialId: key.id }), { ok: true, token, credentialId: key.id });
  // A second site of the same project deploys with it too.
  const b = site(project);
  assert.deepEqual(await b.source.resolve({ workspaceId: SITE_B, target: "vercel" }), { ok: true, token, credentialId: key.id });
  const rows = await listPublishCredentials(b.deps, { workspaceId: SITE_B });
  assert.deepEqual(rows.map(row => [row.id, row.credentialType, row.scope, row.isDefault]), [[key.id, "custom", "project", true]]);
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(token));
});

test("publish-host card (vercel): a save lands in the project store and every site of the project publishes with it", async () => {
  const project = projectStore();
  const a = site(project);
  const token = secret("vercel");
  const saved = await saveVercel(a.deps, SITE_A, "default", token);
  assert.equal(saved.scope, "project");
  assert.equal(saved.isDefault, true);
  assert.equal(await a.deps.repo.findById({ workspaceId: SITE_A, id: saved.id }), null);
  const stored = await project.vault.find({ workspaceId: "project", id: saved.id });
  assert.equal(stored?.kind, "vendor");
  assert.ok(!JSON.stringify(stored).includes(token), "sealed at rest");

  const b = site(project);
  assert.deepEqual(await resolveDefaultForPublish(b.deps, { workspaceId: SITE_B, providerId: "vercel" }),
    { id: saved.id, label: "default", connection: { providerId: "vercel", token } });
});

test("a site's own row wins over the project's, for the default and in the list", async () => {
  const project = projectStore();
  const a = site(project);
  const shared = await saveVercel(a.deps, SITE_A, "default", secret("shared"));
  const b = site(project);
  const own = await saveVercel(b.deps, SITE_B, "default", secret("own"), { scope: "site" });
  assert.equal(own.scope, "site");

  assert.deepEqual(await b.source.resolve({ workspaceId: SITE_B, target: "vercel" }), { ok: true, token: secret("own"), credentialId: own.id });
  assert.deepEqual(await a.source.resolve({ workspaceId: SITE_A, target: "vercel" }), { ok: true, token: secret("shared"), credentialId: shared.id });
  // Same vendor and label: the site row shadows the project one in this site's list.
  assert.deepEqual((await listPublishCredentials(b.deps, { workspaceId: SITE_B })).map(row => [row.id, row.scope]), [[own.id, "site"]]);
});

test("an ambiguous site stays ambiguous instead of silently using the project key", async () => {
  const project = projectStore();
  const a = site(project);
  await saveVercel(a.deps, SITE_A, "shared", secret("shared"));
  const b = site(project);
  const first = await b.saveApiKey(SITE_B, "Vercel one", secret("one"), { scope: "site" });
  await b.saveApiKey(SITE_B, "Vercel two", secret("two"), { scope: "site" });
  assert.equal((await b.source.resolve({ workspaceId: SITE_B, target: "vercel" })).ok, false);
  assert.deepEqual(await b.source.resolve({ workspaceId: SITE_B, target: "vercel", credentialId: first.id }), { ok: true, token: secret("one"), credentialId: first.id });
});

test("a project save whose vendor and label the site already uses is refused; a bad scope is refused", async () => {
  const project = projectStore();
  const a = site(project);
  await saveVercel(a.deps, SITE_A, "default", secret("own"), { scope: "site" });
  await assert.rejects(() => saveVercel(a.deps, SITE_A, "default", secret("again")), PublishCredentialDuplicateLabelError);
  await assert.rejects(() => saveVercel(a.deps, SITE_A, "other", secret("x"), { scope: "everywhere" }), PublishCredentialValidationError);
  assert.equal((await project.vault.list({ workspaceId: "project", kind: "vendor", ownerKey: "tovu", principalId: null, binding: null })).length, 0);
});

test("update, heal and delete change a project row where it lives, through the abort guard", async () => {
  const project = projectStore();
  const a = site(project);
  const saved = await saveVercel(a.deps, SITE_A, "default", secret("first"));
  const guarded = { ...a.deps, repo: abortGuardedCredentialRepo({ store: a.deps.repo, signal: new AbortController().signal }) };
  const updated = await updatePublishCredential(guarded, { workspaceId: SITE_A, id: saved.id, label: "renamed", connection: { providerId: "vercel", token: secret("second") } });
  assert.deepEqual([updated.label, updated.scope], ["renamed", "project"]);
  assert.deepEqual((await resolveDefaultForPublish(site(project).deps, { workspaceId: SITE_B, providerId: "vercel" }))?.connection, { providerId: "vercel", token: secret("second") });

  await healAccountLabel(a.deps, { workspaceId: SITE_A, id: saved.id, accountLabel: "acme" });
  assert.equal((await findPublishCredentialRecord(a.deps, { workspaceId: SITE_A, id: saved.id }))?.accountLabel, "acme");

  await deletePublishCredential(guarded, { workspaceId: SITE_A, id: saved.id });
  assert.equal(await project.vault.find({ workspaceId: "project", id: saved.id }), null);
  assert.equal(await findPublishCredentialRecord(a.deps, { workspaceId: SITE_A, id: saved.id }), null);
});

test("no project store (Fly): saves stay in the site vault and summaries carry no scope", async () => {
  const a = site();
  const token = secret("fly");
  const saved = await saveVercel(a.deps, SITE_A, "default", token);
  assert.equal("scope" in saved, false);
  assert.ok(await a.deps.repo.findById({ workspaceId: SITE_A, id: saved.id }));
  assert.deepEqual(await a.source.resolve({ workspaceId: SITE_A, target: "vercel" }), { ok: true, token, credentialId: saved.id });
  await deletePublishCredential(a.deps, { workspaceId: SITE_A, id: saved.id });
  assert.equal(await a.deps.repo.findById({ workspaceId: SITE_A, id: saved.id }), null);
});
