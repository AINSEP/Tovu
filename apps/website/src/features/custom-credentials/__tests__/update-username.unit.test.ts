import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import {
  createCustomCredential,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  CustomCredentialValidationError,
  type CustomCredentialWriteDeps,
} from "../store.js";

/**
 * @file `updateCustomCredential`'s top-level `username` field (2026-09-01) — lets an operator fix a
 * saved credential's username on its own, with no token retype, the fix for the live name.com 401
 * this field exists for (see `store.ts`'s own doc on `UpdateCustomCredentialInput.username` and on
 * this function's `username`/`connection` precedence section for the full incident writeup). Mirrors
 * `resolve-by-label.unit.test.ts`'s own fixture shape: a real `AesGcmSecretSealer` + `InMemoryKeyring`,
 * no plaintext-passthrough sealer double.
 */

const WORKSPACE = "ws-1";

function makeWriteDeps(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryCustomCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => "2026-09-01T00:00:00.000Z" },
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };
}

test("updateCustomCredential: a username-only update (no connection) persists the new username and leaves the sealed ciphertext byte-identical", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  assert.ok(before);

  const result = await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id, username: "leonaburime@gmail.com" });
  assert.equal(result.username, "leonaburime@gmail.com");

  const after = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  assert.ok(after);
  // The whole point of this field: the token never needed to move for this fix to land. A
  // byte-identical `sealed` object (not just "still decrypts to the same token") proves the update
  // path never even called `sealer.seal()` for this request.
  assert.deepEqual(after.sealed, before.sealed);
});

test("updateCustomCredential: a token-only update (connection supplied, no top-level username) still works, unaffected by the new field", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  const result = await updateCustomCredential(deps, {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { token: "sk_live_rotated", username: "still-here" },
  });
  assert.equal(result.username, "still-here");
});

test("updateCustomCredential: both `username` and `connection` supplied in the same call — the top-level `username` wins for the column", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  const result = await updateCustomCredential(deps, {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { token: "sk_live_rotated", username: "from-connection" },
    username: "from-top-level",
  });
  assert.equal(result.username, "from-top-level");
});

test("updateCustomCredential: `username: null` explicitly clears a saved username", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  const result = await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id, username: null });
  assert.equal("username" in result, false);
});

test("updateCustomCredential: `username: null` (no connection) also strips the sealed payload's own embedded username, so the real decrypting read path (resolveCustomCredentialByLabel) does not resurrect it", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  const result = await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id, username: null });
  assert.equal("username" in result, false);

  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "name.com" });
  assert.ok(resolved);
  // Before the fix, `record.username` is `undefined` so `resolveCustomCredentialByLabel`'s
  // `record.username ?? decrypted.username` fallback returned the OLD sealed username right back.
  assert.deepEqual(resolved?.connection, { token: "sk_live_original" });
});

test("updateCustomCredential: `username: \"\"` (blank string) is rejected — not a silent clear, not a silent no-op", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  await assert.rejects(
    () => updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id, username: "" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialValidationError);
      assert.equal((err as Error).message, "'username' must be a non-empty string, or null to clear it");
      return true;
    }
  );
});

test("updateCustomCredential: omitting both `username` and `connection` leaves the saved username unchanged", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    connection: { token: "sk_live_original", username: "old-username" },
  });

  const result = await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "renamed" });
  assert.equal(result.username, "old-username");
});
