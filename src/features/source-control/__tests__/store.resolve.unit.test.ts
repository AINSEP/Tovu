import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import {
  createSourceControlCredential,
  resolveDefaultForSourceControl,
  SourceControlCredentialSecretStoreUnconfiguredError,
  type SourceControlCredentialWriteDeps,
} from "../store.js";

/**
 * @file `resolveDefaultForSourceControl` — the first decrypting read this feature has ever had (see
 * `store.ts`'s file header: "the day a git-operating feature needs one, it can be added"). Mirrors
 * `publish-credentials/__tests__/store.unit.test.ts`'s own `resolveDefaultForPublish` coverage:
 * decrypts the provider's DEFAULT row, never an id-specific one; returns `null` (not an error) when a
 * provider has no default, even when other providers have rows; a genuine decrypt failure (wrong key)
 * throws rather than degrading to `null`.
 */

/** Always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state.
 *  Byte-identical double to `publish-credentials/__tests__/store.unit.test.ts`'s own `BrokenKeyring`,
 *  kept local rather than imported cross-feature (this file's own convention — see `store.ts`'s header
 *  on why this table's decrypt path is not shared with the publish-credentials sibling). */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

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

/**
 * Live-found (2026-08-16), the daemon-side twin of `publish-credentials/__tests__/store.unit.test.ts`'s
 * own "converts a decrypt failure... into the typed error" test: a row saved with a working root key,
 * then resolved by a process that never had one. Before this fix, `resolveDefaultForSourceControl` let
 * the keyring's raw `Error` escape untyped — this feature's own caller,
 * `commit-site.ts`'s `commitSiteToSourceControl`, has NO try/catch around this call at all (unlike the
 * publish-credentials sibling, which at least had a `sendStoreError` boundary to escape past), so the
 * raw error became an unhandled rejection with nothing anywhere to catch it. This test proves the
 * TYPE, not just that it throws — the test right above already proved "rejects", and a raw `Error`
 * satisfies that assertion just as well as this typed one does, which is exactly how this gap hid.
 */
test("resolveDefaultForSourceControl converts a decrypt failure (missing root key) into the typed SourceControlCredentialSecretStoreUnconfiguredError, never a raw Error", async () => {
  const workingDeps = makeDeps();
  await createSourceControlCredential(workingDeps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github", token: "t" } });

  // Same saved row, but a keyring that cannot derive the key to open it — simulates the live scenario:
  // the row already exists, the CURRENT process just has no root key.
  const brokenDeps = { repo: workingDeps.repo, sealer: new AesGcmSecretSealer(new BrokenKeyring()) };

  await assert.rejects(
    () => resolveDefaultForSourceControl(brokenDeps, { workspaceId: WORKSPACE, providerId: "github" }),
    SourceControlCredentialSecretStoreUnconfiguredError
  );
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
