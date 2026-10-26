import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createCustomCredential, listCustomCredentials, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { attachedOnlyVault } from "#src/features/project-keys/attached-vault";
import { protectProjectKeyDeletes } from "#src/features/project-keys/protected-vault";
import { createProjectKeys } from "#src/features/project-keys/service";
import { fakeAttachments } from "#src/features/project-keys/__tests__/helpers";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminCustomCredentialsRoutes, type AdminCustomCredentialsDeps } from "../custom-credentials.js";

/** Real vault adapters and an injected reference store exercise metadata visibility separately
 * from runtime credential access. Fake secrets are constructed at runtime and never logged.
 */
function inventoryFixture(_required = {}, _optional = {}) {
  const vault = new InMemoryVaultRepo({});
  const attachments = fakeAttachments();
  const transaction = async <T>({ run }: { run: () => Promise<T> }) => run();
  const guarded = protectProjectKeyDeletes({ vault, attachments, siteId: "shop-id", transaction });
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const project = { workspaceId: "project", keyring, sealer,
    repo: new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: guarded, attachments, siteId: "shop-id" }) }),
    deletionRepo: new CustomCredentialVaultRepo({ vault: guarded }) };
  const repo = new CustomCredentialVaultRepo({ vault: new InMemoryVaultRepo({}) }, { project });
  const keys = createProjectKeys({ vault, attachments, siteId: "shop-id", siteName: "Shop", transaction, reapply: async () => "now" });
  let sequence = 0;
  const write = { repo, sealer, keyring, clock: createFakeClock({ startIso: "2026-10-26T00:00:00.000Z" }), idGen: { newId: () => `credential-${++sequence}` } };
  const deps: AdminCustomCredentialsDeps = { workspaceId: "workspace", customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring, clock: write.clock, idGen: write.idGen,
    authorize: async () => ({ allowed: true, reason: "test" }), projectKeys: keys };
  const save = ({ label, scope }: { label: string; scope?: "project" | "site" }) => createCustomCredential(write, {
    workspaceId: deps.workspaceId, label, scope, category: "general", baseUrl: "https://api.example.test",
    connection: { token: ["synthetic", label.replaceAll(" ", "-"), "value"].join("-") },
  });
  return { deps, write, keys, attachments, save };
}

async function inventoryClient({ t, deps }: { t: import("node:test").TestContext; deps: AdminCustomCredentialsDeps }, _optional = {}) {
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminCustomCredentialsRoutes(app, deps);
  const root = await startTestServer(app, t);
  return () => fetch(`${root}/api/admin/v1/workspaces/${deps.workspaceId}/system/custom/credentials`);
}

test("admin inventory keeps an unattached key visible, reports exact site usage, and never grants runtime access by listing", async t => {
  const { deps, write, save, keys, attachments } = inventoryFixture();
  const saved = await save({ label: "Project API" });
  const read = await inventoryClient({ t, deps });
  const token = ["synthetic", "Project-API", "value"].join("-");
  const initial = await (await read()).json();
  assert.equal(initial.projectKeysAvailable, true);
  assert.equal(initial.credentials.length, 1);
  assert.deepEqual(initial.credentials[0], { ...saved, usedBy: [], usedByThisSite: false });
  assert.equal(JSON.stringify(initial).includes(token), false);
  assert.equal("sealed" in initial.credentials[0], false);
  assert.deepEqual(await listCustomCredentials(write, { workspaceId: deps.workspaceId }), []);
  assert.equal(await resolveCustomCredentialByLabel(write, { workspaceId: deps.workspaceId, label: saved.label }), null);
  await attachments.attach({ keyId: saved.id, siteId: "docs-id", siteName: "Docs" });
  await keys.use({ keyId: saved.id, use: true });
  const attached = await (await read()).json();
  assert.deepEqual(attached.credentials[0].usedBy, ["Docs", "Shop"]);
  assert.equal(attached.credentials[0].usedByThisSite, true);
  assert.equal((await listCustomCredentials(write, { workspaceId: deps.workspaceId })).length, 1);
  await keys.use({ keyId: saved.id, use: false });
  const detached = await (await read()).json();
  assert.equal(detached.credentials[0].id, saved.id);
  assert.deepEqual(detached.credentials[0].usedBy, ["Docs"]);
  assert.equal(detached.credentials[0].usedByThisSite, false);
  assert.equal(await resolveCustomCredentialByLabel(write, { workspaceId: deps.workspaceId, label: saved.label }), null);
});

test("admin inventory retains same-label site and project keys while runtime precedence stays site-first", async t => {
  const { deps, write, save, keys } = inventoryFixture();
  const project = await save({ label: "Shared label" });
  const site = await save({ label: "Shared label", scope: "site" });
  await keys.use({ keyId: project.id, use: true });
  const read = await inventoryClient({ t, deps });
  const result = await (await read()).json();
  assert.deepEqual(result.credentials.map((row: { id: string; scope: string }) => ({ id: row.id, scope: row.scope })), [
    { id: site.id, scope: "site" }, { id: project.id, scope: "project" },
  ]);
  assert.equal(result.credentials[1].usedByThisSite, true);
  assert.deepEqual((await listCustomCredentials(write, { workspaceId: deps.workspaceId })).map(row => row.id), [site.id]);
});

test("admin inventory denies unauthorized readers before inspecting project metadata", async t => {
  const { deps } = inventoryFixture();
  let reads = 0;
  const read = await inventoryClient({ t, deps: { ...deps,
    authorize: async () => ({ allowed: false, reason: "no_grant" }),
    projectKeys: { ...deps.projectKeys!, list: async () => { reads++; return []; } },
  } });
  const response = await read();
  assert.equal(response.status, 403);
  assert.equal(reads, 0);
});
