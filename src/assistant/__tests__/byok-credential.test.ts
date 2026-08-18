import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../webhooks/keyring.memory";
import { InMemoryAdminExecutionCredentialRepo } from "../execution-credential-store.memory";
import { setExecutionCredential } from "../execution-credential-store";
import {
  createRequestSuppliedExecutionCredentialPort,
  createStoredExecutionCredentialPort,
} from "../byok-credential";

/**
 * @file `byok-credential.ts`'s two `ExecutionCredentialPort` implementations.
 *
 * The property under test that matters most for `createStoredExecutionCredentialPort`: the owner's
 * decided fallback order — a request-supplied credential wins when present, and the admin's own
 * stored row is used only when the request omits one — plus that it genuinely never throws (a
 * decrypt failure degrades to `null`, matching `resolveExecutionCredential`'s own contract).
 */

const WORKSPACE = "workspace-1";
const ADMIN_A = "principal-admin-a";
const clock = { nowIso: () => "2026-08-05T00:00:00.000Z" };

function makeStoredPortDeps() {
  const repo = new InMemoryAdminExecutionCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer };
}

// ---------------------------------------------------------------------------
// createRequestSuppliedExecutionCredentialPort — unchanged parse contract, now async
// ---------------------------------------------------------------------------

test("createRequestSuppliedExecutionCredentialPort resolves a valid request-supplied config", async () => {
  const port = createRequestSuppliedExecutionCredentialPort();
  const resolved = await port.resolve({
    requestBody: { protocol: "anthropic", apiKey: "sk-ant-test", model: "claude-opus-4-8" },
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
  });
  assert.deepEqual(resolved, { protocol: "anthropic", apiKey: "sk-ant-test", model: "claude-opus-4-8" });
});

test("createRequestSuppliedExecutionCredentialPort never reads a store — a missing apiKey resolves to null regardless of identity", async () => {
  const port = createRequestSuppliedExecutionCredentialPort();
  const resolved = await port.resolve({
    requestBody: { protocol: "anthropic" },
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
  });
  assert.equal(resolved, null);
});

// ---------------------------------------------------------------------------
// createStoredExecutionCredentialPort — the fallback order the owner decided
// ---------------------------------------------------------------------------

test("a request-supplied credential wins even when a stored one exists", async () => {
  const { repo, sealer, keyring } = makeStoredPortDeps();
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "stored-key-0000", protocol: "anthropic", model: "claude-opus-4-8" }
  );

  const port = createStoredExecutionCredentialPort({ repo, sealer });
  const resolved = await port.resolve({
    requestBody: { protocol: "openai", apiKey: "request-supplied-key", model: "gpt-4o" },
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
  });

  assert.deepEqual(resolved, { protocol: "openai", apiKey: "request-supplied-key", model: "gpt-4o" });
});

test("falls back to the stored credential when the request omits apiKey", async () => {
  const { repo, sealer, keyring } = makeStoredPortDeps();
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      apiKey: "stored-key-0000",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-opus-4-8",
      maxTokens: 8192,
    }
  );

  const port = createStoredExecutionCredentialPort({ repo, sealer });
  const resolved = await port.resolve({ requestBody: {}, workspaceId: WORKSPACE, principalId: ADMIN_A });

  assert.deepEqual(resolved, {
    protocol: "anthropic",
    apiKey: "stored-key-0000",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    maxTokens: 8192,
  });
});

test("falls back to stored when the request supplies an empty apiKey (not just an omitted one)", async () => {
  const { repo, sealer, keyring } = makeStoredPortDeps();
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "stored-key-0000", protocol: "anthropic", model: "claude-opus-4-8" }
  );

  const port = createStoredExecutionCredentialPort({ repo, sealer });
  const resolved = await port.resolve({
    requestBody: { protocol: "anthropic", apiKey: "", model: "claude-opus-4-8" },
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
  });

  assert.equal(resolved?.apiKey, "stored-key-0000");
});

test("resolves null when neither the request nor the stored row has a usable credential", async () => {
  const { repo, sealer } = makeStoredPortDeps();
  const port = createStoredExecutionCredentialPort({ repo, sealer });
  const resolved = await port.resolve({ requestBody: {}, workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved, null);
});

test("a stored row with no model set is treated as unusable, not returned with model missing", async () => {
  const { repo, sealer, keyring } = makeStoredPortDeps();
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "stored-key-0000", protocol: "anthropic" } // no model
  );

  const port = createStoredExecutionCredentialPort({ repo, sealer });
  const resolved = await port.resolve({ requestBody: {}, workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved, null);
});

test("a decrypt failure on the stored row degrades to null, it does not throw", async () => {
  const { repo, sealer, keyring } = makeStoredPortDeps();
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "stored-key-0000", protocol: "anthropic", model: "claude-opus-4-8" }
  );

  // A sealer over a DIFFERENT root key generation — simulates a rotated/reset master secret.
  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  const port = createStoredExecutionCredentialPort({ repo, sealer: otherSealer });
  const resolved = await port.resolve({ requestBody: {}, workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved, null);
});

test("resolves the OTHER admin's stored row when that principal id is passed — proves the port is identity-scoped, not global", async () => {
  const { repo, sealer, keyring } = makeStoredPortDeps();
  const ADMIN_B = "principal-admin-b";
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "admin-a-key", protocol: "anthropic", model: "claude-opus-4-8" }
  );
  await setExecutionCredential(
    { repo, sealer, keyring, clock },
    { workspaceId: WORKSPACE, principalId: ADMIN_B, apiKey: "admin-b-key", protocol: "openai", model: "gpt-4o" }
  );

  const port = createStoredExecutionCredentialPort({ repo, sealer });
  const resolvedA = await port.resolve({ requestBody: {}, workspaceId: WORKSPACE, principalId: ADMIN_A });
  const resolvedB = await port.resolve({ requestBody: {}, workspaceId: WORKSPACE, principalId: ADMIN_B });

  assert.equal(resolvedA?.apiKey, "admin-a-key");
  assert.equal(resolvedB?.apiKey, "admin-b-key");
});
