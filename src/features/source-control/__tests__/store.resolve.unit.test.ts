import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../integrations/keyring.memory";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory";
import { createSourceControlCredential, resolveDefaultForSourceControl, type SourceControlCredentialWriteDeps } from "../store";

/**
 * @file `resolveDefaultForSourceControl` — the first decrypting read this feature has ever had (see
 * `store.ts`'s file header: "the day a git-operating feature needs one, it can be added"). Mirrors
 * `publish-credentials/__tests__/store.unit.test.ts`'s own `resolveDefaultForPublish` coverage:
 * decrypts the provider's DEFAULT row, never an id-specific one; returns `null` (not an error) when a
 * provider has no default, even when other providers have rows; a genuine decrypt failure (wrong key)
 * throws rather than degrading to `null`.
 */

const WORKSPACE = "ws-source-control-resolve";
const NOW = "2026-08-16T00:00:00.000Z";

function makeDeps(overrides: Partial<SourceControlCredentialWriteDeps> = {}): SourceControlCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemorySourceControlCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `src-cred-${(counter += 1)}` },
    ...overrides,
  };
}

test("resolveDefaultForSourceControl decrypts the provider's default connection, never an id-specific one", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "Personal", connection: { providerId: "github", token: "ghp_real_secret" } });
  const second = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "Work", connection: { providerId: "github", token: "ghp_work_secret" }, isDefault: true });

  const resolved = await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "github" });
  assert.ok(resolved);
  assert.equal(resolved.id, second.id);
  assert.equal(resolved.label, "Work");
  assert.deepEqual(resolved.connection, { providerId: "github", token: "ghp_work_secret" });
});

test("resolveDefaultForSourceControl returns null (never throws) when the provider has no default, even with rows for OTHER providers", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "GL", connection: { providerId: "gitlab", token: "glpat_secret" } });

  assert.equal(await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "github" }), null);
});

test("resolveDefaultForSourceControl throws on a genuine decrypt failure rather than silently returning null", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "Personal", connection: { providerId: "github", token: "ghp_real_secret" } });

  const wrongKeyDeps = { ...deps, sealer: new AesGcmSecretSealer(new InMemoryKeyring()) };
  await assert.rejects(() => resolveDefaultForSourceControl(wrongKeyDeps, { workspaceId: WORKSPACE, providerId: "github" }));
});

test("resolveDefaultForSourceControl round-trips a bitbucket connection's paired username, not just the token", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "BB",
    connection: { providerId: "bitbucket", token: "bb_app_password", username: "octocat" },
  });

  const resolved = await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "bitbucket" });
  assert.deepEqual(resolved?.connection, { providerId: "bitbucket", token: "bb_app_password", username: "octocat" });
});
