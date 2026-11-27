import { SourceControlCredentialValidationError } from "@jini-ai/devops/source-control/site/store.validation";
import { SOURCE_CONTROL_CREDENTIAL_DEPS } from "#src/features/source-control/store";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import type { SecretSealerPort } from "@jini-ai/integrations/secrets";

import { attachedOnlyVault } from "@jini-ai/user-management/project-keys/attached-vault";
import { fakeAttachments } from "#src/features/project-keys/__tests__/helpers";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { sourceControlKeyBinding } from "#src/server/runtime/composition/source-control-key-binding";
import { createCustomCredential, resolveCustomCredentialByLabel, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/store";
import type { CustomCredentialProjectScope } from "#src/features/custom-credentials/types";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/repo.memory";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { InMemoryKeyring } from "../../webhooks/keyring.env.js";
import type { LoadSourceControlProviders } from "../provider-registry.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import { deleteSourceControlCredential, listSourceControlCredentials, resolveDefaultForSourceControl, SourceControlCredentialDuplicateLabelError, SourceControlCredentialNotFoundError } from "@jini-ai/devops/source-control/site/store";
import { createSourceControlCredential, updateSourceControlCredential, type SourceControlCredentialWriteDeps } from "../store.js";
import { exampleRegistry } from "./fixtures/example-provider.js";
import { githubFromSource } from "./fixtures/github-from-source.js";
import { attachedVaultPolicy } from "#src/features/project-keys/vault-policy";

/**
 * @file A canonical Source Control key is a provider-declared custom API key (see
 * `source-control-key-binding.ts`). Create, list, edit and removal all go through that one binding,
 * scoped to the site's own and granted rows. The legacy table is reached only for ids the canonical
 * store does not own. Real AES-GCM sealing; the sealers count opens so a list that unseals is caught.
 */

const SITE_A = "ws-site-a";
const SITE_B = "ws-site-b";
// Fake secrets built at runtime, never literals that look like a key.
const secret = (name: string) => `${name}-${"x".repeat(8)}-${name.length}1234`;

/** github from its real plugin source, plus a legacy-only example host. */
const providers: LoadSourceControlProviders = async ({ workspaceId }) => {
  const github = await githubFromSource({ workspaceId });
  const other = exampleRegistry({ probe: false, ids: ["example-git"] });
  return { list: () => [...github.list(), ...other.list()], get: (required: { providerId: string }) => github.get(required) ?? other.get(required), refusals: [] };
};

function countingSealer({ opens }: { opens: { count: number } }, _optional = {}): { sealer: SecretSealerPort; keyring: InMemoryKeyring } {
  const keyring = new InMemoryKeyring();
  const real = new AesGcmSecretSealer({ keyring });
  const sealer: SecretSealerPort = { seal: (...args) => real.seal(...args), open: (...args) => { opens.count++; return real.open(...args); } };
  return { sealer, keyring };
}

let ids = 0;
function customDeps({ opens }: { opens: { count: number } }, optional: { project?: CustomCredentialProjectScope; vault?: InMemoryVaultRepo } = {}): CustomCredentialWriteDeps {
  const { sealer, keyring } = countingSealer({ opens });
  return { repo: new CustomCredentialVaultRepo({ vault: optional.vault ?? new InMemoryVaultRepo({}) }, optional.project ? { project: optional.project } : {}),
    sealer, keyring, clock: createFakeClock({ startIso: "2026-11-25T00:00:00.000Z" }), idGen: { newId: () => `cred-${++ids}` } };
}

/** A freshly composed Source Control store over existing storage: what a process restart builds. */
function sourceControlStore({ credentials, legacyVault, opens }: { credentials: CustomCredentialWriteDeps; legacyVault: InMemoryVaultRepo; opens: { count: number } }, _optional = {}): SourceControlCredentialWriteDeps {
  const canonical = sourceControlKeyBinding({ credentials, loadProviders: providers });
  const repo = Object.assign(new InMemorySourceControlCredentialSetRepo({ vault: legacyVault }), { canonical });
  const { sealer, keyring } = countingSealer({ opens });
  return { repo, sealer, keyring, clock: credentials.clock, idGen: credentials.idGen, loadSourceControlProviders: providers };
}

// Mutation `legacy-only-list-update-delete`: `store.ts` list/update/delete skip `repo.canonical` -> the canonical
// key is missing from the list and its edit/removal is a legacy "not found" (RED).
test("a canonical Source Control key survives reload and can be listed updated and removed", async () => {
  const opens = { count: 0 };
  const customVault = new InMemoryVaultRepo({});
  const credentials = customDeps({ opens }, { vault: customVault });
  const legacyVault = new InMemoryVaultRepo({});
  const first = sourceControlStore({ credentials, legacyVault, opens });
  const created = await createSourceControlCredential({ deps: first, input: { workspaceId: SITE_A, label: "GitHub", connection: { providerId: "github", token: secret("first") } } });
  const legacy = await createSourceControlCredential({ deps: first, input: { workspaceId: SITE_A, label: "Example", connection: { providerId: "example-git", token: secret("legacy") } } });

  const reloaded = sourceControlStore({ credentials: customDeps({ opens }, { vault: customVault }), legacyVault, opens });
  opens.count = 0;
  const listed = await listSourceControlCredentials({ ...reloaded, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A });
  assert.equal(opens.count, 0, "listing never unseals a key for display");
  assert.deepEqual(listed.map(row => row.id).sort(), [created.id, legacy.id].sort(), "one row per stable id, canonical included");
  const canonicalRow = listed.find(row => row.id === created.id);
  assert.equal(canonicalRow?.providerId, "github");
  assert.equal(canonicalRow?.isDefault, true);
  assert.equal(JSON.stringify(listed).includes(secret("first")), false, "no token in a display row");

  const updated = await updateSourceControlCredential({ deps: reloaded, input: { workspaceId: SITE_A, id: created.id, connection: { token: secret("second") } } });
  assert.equal(updated.id, created.id);
  assert.equal(JSON.stringify(updated).includes(secret("second")), false);
  assert.equal((await resolveDefaultForSourceControl({ ...reloaded, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A, providerId: "github" }))?.connection.token, secret("second"));
  // Owned but refused: the canonical name is the binding, so a rename is denied, never retried as a legacy row.
  await assert.rejects(updateSourceControlCredential({ deps: reloaded, input: { workspaceId: SITE_A, id: created.id, label: "Renamed" } }), SourceControlCredentialValidationError);

  await deleteSourceControlCredential({ ...reloaded, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A, id: created.id });
  assert.equal(await resolveDefaultForSourceControl({ ...reloaded, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A, providerId: "github" }), null);
  assert.deepEqual((await listSourceControlCredentials({ ...reloaded, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A })).map(row => row.id), [legacy.id], "the legacy row is untouched");
});

// Mutation `drop-canonical-workspace-scope`: the binding reads the owner inventory instead of the site's granted
// rows -> the ungranted project key is listed and claimed as this site's (RED).
test("a foreign or ungranted canonical key is neither listed nor edited", async () => {
  const opens = { count: 0 };
  const projectKeys = countingSealer({ opens });
  const project: CustomCredentialProjectScope = { workspaceId: "project", repo: new InMemoryCustomCredentialSetRepo(), ...projectKeys };
  // Another site of the project saves the github key; site A has no grant for it.
  const owner = customDeps({ opens }, { project });
  const foreign = await createCustomCredential(owner, { workspaceId: SITE_B, label: "github", category: "source-control", baseUrl: "https://api.github.com", connection: { token: secret("foreign") }, worksFor: ["github"] });
  assert.equal(foreign.scope, "project");
  const attachments = fakeAttachments();
  const view = new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: project.repo.vault!, siteId: SITE_A, attachments, policy: attachedVaultPolicy }) });
  const siteA = customDeps({ opens }, { project: { ...project, repo: view, createRepo: project.repo, inventoryRepo: project.repo } });
  // Site A's own generic API key is not a Source Control key, even with a source-control category.
  const hosting = await createCustomCredential(siteA, { workspaceId: SITE_A, scope: "site", label: "hosting", category: "source-control", baseUrl: "https://api.example.test", connection: { token: secret("hosting") } });
  const store = sourceControlStore({ credentials: siteA, legacyVault: new InMemoryVaultRepo({}), opens });

  assert.deepEqual(await listSourceControlCredentials({ ...store, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A }), []);
  for (const id of [foreign.id, hosting.id]) {
    await assert.rejects(updateSourceControlCredential({ deps: store, input: { workspaceId: SITE_A, id, connection: { token: secret("overwrite") } } }), SourceControlCredentialNotFoundError);
    await deleteSourceControlCredential({ ...store, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A, id });
  }
  assert.equal((await resolveCustomCredentialByLabel(owner, { workspaceId: SITE_B, label: "github" }))?.connection.token, secret("foreign"));
  assert.equal((await resolveCustomCredentialByLabel(siteA, { workspaceId: SITE_A, label: "hosting" }))?.connection.token, secret("hosting"));

  // Positive control: once granted it is listed, and the shared-key deletion rule still refuses removal here.
  await attachments.attach({ siteId: SITE_A, siteName: "A", keyId: foreign.id });
  assert.deepEqual((await listSourceControlCredentials({ ...store, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A })).map(row => [row.id, row.scope]), [[foreign.id, "project"]]);
  await assert.rejects(deleteSourceControlCredential({ ...store, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A, id: foreign.id }), SourceControlCredentialValidationError);
  assert.equal((await resolveCustomCredentialByLabel(owner, { workspaceId: SITE_B, label: "github" }))?.connection.token, secret("foreign"));
});

test("a canonical Source Control key refuses a host move or a paired field and keeps its token", async () => {
  const opens = { count: 0 };
  const credentials = customDeps({ opens });
  const deps = sourceControlStore({ credentials, legacyVault: new InMemoryVaultRepo({}), opens });
  const created = await createSourceControlCredential({ deps, input: { workspaceId: SITE_A, label: "GitHub", connection: { providerId: "github", token: secret("kept") } } });
  const refusal = (error: unknown) => {
    assert.ok(error instanceof SourceControlCredentialValidationError);
    assert.equal(error.message, "This shared key holds only its provider's token. Save a new key for another host.");
    return true;
  };

  await assert.rejects(updateSourceControlCredential({ deps, input: { workspaceId: SITE_A, id: created.id, connection: { providerId: "example-git", token: secret("moved") } } }), refusal);
  await assert.rejects(updateSourceControlCredential({ deps, input: { workspaceId: SITE_A, id: created.id, connection: { token: secret("paired"), owner: "someone" } } }), refusal);
  assert.equal((await resolveDefaultForSourceControl({ ...deps, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: SITE_A, providerId: "github" }))?.connection.token, secret("kept"));
});

// Mutations: drop the duplicate-label translation; skip the provider-availability check; describe
// a provider that declares no saved key label instead of refusing it.
test("the canonical binding describes by the declared label, refuses an unavailable host and keeps the duplicate-label identity", async () => {
  const keys = sourceControlKeyBinding({ credentials: customDeps({ opens: { count: 0 } }), loadProviders: providers });
  assert.equal(await keys.describe({ workspaceId: SITE_A, providerId: "github" }), null);
  await assert.rejects(keys.describe({ workspaceId: SITE_A, providerId: "example-git" }), { message: "source control provider example-git has no saved key label" });
  await assert.rejects(keys.create({ workspaceId: SITE_A, connection: { providerId: "no-such-host", token: secret("orphan") } }),
    { message: "The source control provider is unavailable. Turn it on and open its key card again." });
  const created = await keys.create({ workspaceId: SITE_A, connection: { providerId: "github", token: secret("first") } });
  assert.deepEqual(await keys.describe({ workspaceId: SITE_A, providerId: "github" }), { id: created.id, label: created.label, providerId: "github" });
  await assert.rejects(keys.create({ workspaceId: SITE_A, connection: { providerId: "github", token: secret("second") } }),
    error => error instanceof SourceControlCredentialDuplicateLabelError);
  assert.equal((await keys.resolve({ workspaceId: SITE_A, providerId: "github" }))?.connection.token, secret("first"));
});
