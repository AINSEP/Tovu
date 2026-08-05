import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../integrations/keyring.memory";
import type { KeyringPort } from "../../integrations/ports";
import { InMemoryAdminExecutionCredentialRepo } from "../execution-credential-store.memory";
import {
  ExecutionCredentialSecretStoreUnconfiguredError,
  ExecutionCredentialValidationError,
  deleteExecutionCredential,
  getExecutionCredential,
  resolveExecutionCredential,
  setExecutionCredential,
} from "../execution-credential-store";

/**
 * @file `execution-credential-store.ts` — the ADMIN's own BYOK credential, write-only contract and
 * the never-throws runtime read path. Mirrors `site-credential-store.test.ts`'s assertion shape for
 * the sibling ADR-058 store, plus the property that store did not need: row-level isolation across
 * the `(workspaceId, principalId)` composite scope, so one admin's PUT/DELETE can never touch
 * another admin's row, or another workspace's row for the SAME principal id.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const ADMIN_A = "principal-admin-a";
const ADMIN_B = "principal-admin-b";
const clock = { nowIso: () => "2026-08-05T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryAdminExecutionCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, deps: { repo, keyring, sealer, clock } };
}

/** A `KeyringPort` that always fails `derive()`/`activeKey()` — simulates a missing
 *  `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state. */
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

// ---------------------------------------------------------------------------
// getExecutionCredential
// ---------------------------------------------------------------------------

test("an admin nobody has configured reads as not-set, with sensible defaults", async () => {
  const { deps } = makeDeps();
  const view = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.deepEqual(view, {
    isSet: false,
    masked: null,
    protocol: "anthropic",
    providerId: null,
    baseUrl: null,
    model: null,
    maxTokens: null,
    updatedAt: null,
  });
});

// ---------------------------------------------------------------------------
// setExecutionCredential
// ---------------------------------------------------------------------------

test("setting an apiKey seals it, masks it, and never returns the plaintext", async () => {
  const { deps, repo } = makeDeps();
  const view = await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "sk-ant-api03-EXAMPLE9999",
  });

  assert.equal(view.isSet, true);
  assert.equal(view.masked, "••••9999");
  assert.ok(!("apiKey" in view));
  assert.ok(!JSON.stringify(view).includes("sk-ant-api03"));

  const stored = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.ok(stored?.sealed);
  assert.notEqual(stored?.sealed?.ciphertext, "sk-ant-api03-EXAMPLE9999");
});

test("an empty apiKey is rejected — DELETE clears a key, PUT does not accept blank", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "   " }),
    ExecutionCredentialValidationError
  );
});

test("a non-string protocol/baseUrl/model is rejected before any write", async () => {
  const { deps, repo } = makeDeps();
  await assert.rejects(
    () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, protocol: 12345 as unknown as string }),
    ExecutionCredentialValidationError
  );
  assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
});

test("a non-positive maxTokens is rejected before any write", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, maxTokens: 0 }),
    ExecutionCredentialValidationError
  );
});

test("omitting apiKey leaves the previously-stored key untouched — only model changes", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "first-key-0000" });
  const afterFirst = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });

  const afterSecond = await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, model: "claude-opus-4-8" });

  assert.equal(afterSecond.isSet, true);
  assert.equal(afterSecond.masked, afterFirst.masked);
  assert.equal(afterSecond.model, "claude-opus-4-8");

  // The runtime path still resolves the ORIGINAL key — proves the sealed blob itself was untouched.
  const resolved = await resolveExecutionCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved?.apiKey, "first-key-0000");
});

test("a rotation (second apiKey) fully replaces the first — the old key no longer resolves", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "old-key-1111" });
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "new-key-2222" });

  const resolved = await resolveExecutionCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved?.apiKey, "new-key-2222");
});

test("a missing master secret fails CLOSED with a distinct error, and writes nothing", async () => {
  const { repo } = makeDeps();
  const brokenKeyring = new BrokenKeyring();
  const brokenSealer = new AesGcmSecretSealer(brokenKeyring);

  await assert.rejects(
    () =>
      setExecutionCredential(
        { repo, sealer: brokenSealer, keyring: brokenKeyring, clock },
        { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "would-be-a-real-key" }
      ),
    ExecutionCredentialSecretStoreUnconfiguredError
  );

  assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
});

// ---------------------------------------------------------------------------
// Row-level isolation — the property this store has that ADR-058's sibling did not need
// ---------------------------------------------------------------------------

test("two different admins in the SAME workspace have fully independent credentials", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "admin-a-key-1111", model: "claude-opus-4-8" });
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B, apiKey: "admin-b-key-2222", model: "gpt-4o" });

  const viewA = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  const viewB = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B });
  assert.equal(viewA.masked, "••••1111");
  assert.equal(viewB.masked, "••••2222");
  assert.equal(viewA.model, "claude-opus-4-8");
  assert.equal(viewB.model, "gpt-4o");

  // Deleting A's key must not touch B's.
  await deleteExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  const afterDelete = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B });
  assert.equal(afterDelete.isSet, true);
  assert.equal(afterDelete.masked, "••••2222");
});

test("the SAME principal id in two different workspaces has fully independent credentials", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "workspace-1-key-1111" });
  await setExecutionCredential(deps, { workspaceId: OTHER_WORKSPACE, principalId: ADMIN_A, apiKey: "workspace-2-key-2222" });

  const inFirst = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  const inSecond = await getExecutionCredential(deps, { workspaceId: OTHER_WORKSPACE, principalId: ADMIN_A });
  assert.equal(inFirst.masked, "••••1111");
  assert.equal(inSecond.masked, "••••2222");
});

// ---------------------------------------------------------------------------
// deleteExecutionCredential
// ---------------------------------------------------------------------------

test("delete clears only the key — protocol/providerId/baseUrl/model/maxTokens survive", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "to-be-deleted",
    protocol: "openai",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    maxTokens: 4096,
  });

  const view = await deleteExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });

  assert.equal(view.isSet, false);
  assert.equal(view.masked, null);
  assert.equal(view.protocol, "openai");
  assert.equal(view.providerId, "openai");
  assert.equal(view.baseUrl, "https://api.openai.com/v1");
  assert.equal(view.model, "gpt-4o");
  assert.equal(view.maxTokens, 4096);
});

test("deleting an already-unset key is a harmless no-op, not an error", async () => {
  const { deps } = makeDeps();
  const view = await deleteExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(view.isSet, false);
});

// ---------------------------------------------------------------------------
// resolveExecutionCredential — must never throw
// ---------------------------------------------------------------------------

test("resolveExecutionCredential returns null when no row exists", async () => {
  const { repo, sealer } = makeDeps();
  const resolved = await resolveExecutionCredential({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved, null);
});

test("resolveExecutionCredential returns null (not a throw) when the sealed row cannot be opened", async () => {
  const { deps, repo } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "some-key" });

  // A sealer over a DIFFERENT root key generation — simulates a rotated/reset master secret.
  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  let warned = 0;
  const resolved = await resolveExecutionCredential(
    { repo, sealer: otherSealer },
    { workspaceId: WORKSPACE, principalId: ADMIN_A },
    () => {
      warned += 1;
    }
  );

  assert.equal(resolved, null);
  assert.equal(warned, 1);
});

test("resolveExecutionCredential returns the key and config together on success", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "resolvable-key",
    protocol: "anthropic",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    maxTokens: 8192,
  });

  const resolved = await resolveExecutionCredential({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.deepEqual(resolved, {
    apiKey: "resolvable-key",
    protocol: "anthropic",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    maxTokens: 8192,
  });
});
