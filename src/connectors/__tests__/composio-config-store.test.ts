import assert from "node:assert/strict";
import test from "node:test";

import type { ComposioConfigStore, PublicComposioConfig } from "@jini-ai/integrations/composio";

import { InMemoryKeyring } from "../../integrations/keyring.memory";
import { AesGcmSecretSealer } from "../../integrations/secret-sealer.aesgcm";
import { InMemoryComposioConfigRepo } from "../composio-config-store.memory";
import {
  ComposioConfigSecretStoreUnconfiguredError,
  ComposioConfigValidationError,
  clearComposioApiKey,
  createSnapshotComposioConfigStore,
  getComposioConfigView,
  readComposioConfig,
  saveComposioApiKey,
  saveComposioAuthConfigIds,
  type ComposioConfigView,
} from "../composio-config-store";

/**
 * @file `composio-config-store.ts` — the sealed Composio project key behind the admin's
 * Settings → Connectors tab.
 *
 * The assertions that matter most: the key is never echoed back through any read path, provisioned
 * `authConfigIds` are dropped on a key CHANGE but survive re-pasting the same key (a full-plaintext
 * comparison of the decrypted stored key against the candidate is what makes that work at all under
 * randomized AEAD, where comparing ciphertexts directly would wrongly report every re-paste as a
 * change) — and a same-tail-but-different key is NOT mistaken for a re-paste, because the 4-char
 * tail is a display marker only, never the identity check. A missing master secret fails closed
 * before anything is written, and the synchronous snapshot store refuses to become a second source
 * of truth for the key.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-08-09T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryComposioConfigRepo();
  const keyring = new InMemoryKeyring();
  return { repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock };
}

test("an unconfigured workspace reads as not configured, with no tail", async () => {
  const deps = makeDeps();
  assert.deepEqual(await getComposioConfigView(deps, { workspaceId: WORKSPACE }), {
    configured: false,
    apiKeyTail: "",
  });
});

test("saving a key reports markers only and never the key itself", async () => {
  const deps = makeDeps();
  const view = await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });

  assert.deepEqual(view, { configured: true, apiKeyTail: "1234" });
  assert.equal(
    JSON.stringify(view).includes("SECRET"),
    false,
    "the response must not carry key material"
  );

  const stored = await deps.repo.findByWorkspaceId(WORKSPACE);
  assert.notEqual(stored, null);
  assert.equal(
    JSON.stringify(stored?.sealed).includes("SECRET"),
    false,
    "the row must hold ciphertext, not plaintext"
  );
});

test("readComposioConfig is the only path that returns the decrypted key", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.equal(config.apiKey, "comp_live_SECRET1234");
  assert.deepEqual(config.authConfigIds, {});
});

test("readComposioConfig reports an unconfigured workspace as an empty key, not an error", async () => {
  const deps = makeDeps();
  assert.deepEqual(await readComposioConfig(deps, { workspaceId: WORKSPACE }), {
    apiKey: "",
    authConfigIds: {},
  });
});

test("re-saving the SAME key preserves provisioned auth-config ids", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  await saveComposioAuthConfigIds(deps, {
    workspaceId: WORKSPACE,
    authConfigIds: { github: "ac_github_1" },
  });

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(
    config.authConfigIds,
    { github: "ac_github_1" },
    "AES-GCM re-seals the same key to different ciphertext; comparing ciphertexts here would have wrongly reported a key change and dropped these"
  );
});

test("saving a DIFFERENT key discards auth-config ids from the previous project", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  await saveComposioAuthConfigIds(deps, {
    workspaceId: WORKSPACE,
    authConfigIds: { github: "ac_github_1" },
  });

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_OTHER9999" });

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(config.authConfigIds, {});
  assert.equal(config.apiKey, "comp_live_OTHER9999");
});

test("saving a DIFFERENT key that happens to share the same tail still discards stale auth-config ids", async () => {
  // Regression test: `saveComposioApiKey` used to compare only the last 4 characters (`keyTail`)
  // to decide whether the key had changed. Two distinct keys sharing a tail would then be
  // misreported as "unchanged", carrying the PREVIOUS project's auth-config ids onto a record now
  // sealing a genuinely different key — silently pointing the provider at resources the new key
  // cannot see (see `saveComposioApiKey`'s doc comment for the 404 this produces downstream).
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_AAAAAAAA1234" });
  await saveComposioAuthConfigIds(deps, {
    workspaceId: WORKSPACE,
    authConfigIds: { github: "ac_github_1" },
  });

  // Same last 4 characters ("1234") as the key above, but not the same key.
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_ZZZZZZZZ1234" });

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(
    config.authConfigIds,
    {},
    "a same-tail but different key must be treated as changed, not mistaken for a re-paste"
  );
  assert.equal(config.apiKey, "comp_live_ZZZZZZZZ1234");
});

test("an existing key that can no longer be decrypted is treated as changed, not compared", async () => {
  // Models a rotated master secret: the OLD sealed row cannot be opened by the CURRENT keyring.
  // The comparison must fail closed (report "changed") rather than throw or silently skip the
  // save — a comparison the code cannot make confidently must not block the write it only
  // optimizes.
  const repo = new InMemoryComposioConfigRepo();
  const firstKeyring = new InMemoryKeyring();
  await saveComposioApiKey(
    { repo, keyring: firstKeyring, sealer: new AesGcmSecretSealer(firstKeyring), clock },
    { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" }
  );
  await saveComposioAuthConfigIds(
    { repo, keyring: firstKeyring, sealer: new AesGcmSecretSealer(firstKeyring), clock },
    { workspaceId: WORKSPACE, authConfigIds: { github: "ac_github_1" } }
  );

  const rotatedKeyring = new InMemoryKeyring();
  const rotatedDeps = { repo, keyring: rotatedKeyring, sealer: new AesGcmSecretSealer(rotatedKeyring), clock };
  await saveComposioApiKey(rotatedDeps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });

  const config = await readComposioConfig(rotatedDeps, { workspaceId: WORKSPACE });
  assert.deepEqual(
    config.authConfigIds,
    {},
    "an unopenable prior key must not be assumed unchanged just because it cannot be checked"
  );
});

test("clearing removes the key and every auth-config id, and is idempotent", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  await saveComposioAuthConfigIds(deps, {
    workspaceId: WORKSPACE,
    authConfigIds: { github: "ac_github_1" },
  });

  assert.deepEqual(await clearComposioApiKey(deps, { workspaceId: WORKSPACE }), {
    configured: false,
    apiKeyTail: "",
  });
  assert.deepEqual(await readComposioConfig(deps, { workspaceId: WORKSPACE }), {
    apiKey: "",
    authConfigIds: {},
  });

  assert.deepEqual(await clearComposioApiKey(deps, { workspaceId: WORKSPACE }), {
    configured: false,
    apiKeyTail: "",
  });
});

test("clearing preserves createdAt rather than deleting the row", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  await clearComposioApiKey(deps, { workspaceId: WORKSPACE });

  const row = await deps.repo.findByWorkspaceId(WORKSPACE);
  assert.notEqual(row, null, "the row is tombstoned by nulling, not removed");
  assert.equal(row?.sealed, null);
  assert.equal(row?.keyTail, null);
});

test("a blank or oversized key is rejected before anything is written", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () => saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "   " }),
    ComposioConfigValidationError
  );
  await assert.rejects(
    () => saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "x".repeat(513) }),
    ComposioConfigValidationError
  );

  assert.equal(await deps.repo.findByWorkspaceId(WORKSPACE), null);
});

test("an unavailable master secret fails closed instead of storing plaintext", async () => {
  const deps = makeDeps();
  const failing = {
    ...deps,
    keyring: {
      activeKey: () => Promise.reject(new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set")),
      deriveSigningSecret: () => Promise.reject(new Error("unused")),
      derive: () => Promise.reject(new Error("unused")),
    } as unknown as typeof deps.keyring,
  };

  await assert.rejects(
    () => saveComposioApiKey(failing, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" }),
    ComposioConfigSecretStoreUnconfiguredError
  );
  assert.equal(await deps.repo.findByWorkspaceId(WORKSPACE), null);
});

test("saveComposioAuthConfigIds skips a workspace that has no row", async () => {
  const deps = makeDeps();
  await saveComposioAuthConfigIds(deps, {
    workspaceId: WORKSPACE,
    authConfigIds: { github: "ac_github_1" },
  });
  assert.equal(
    await deps.repo.findByWorkspaceId(WORKSPACE),
    null,
    "auth-config ids are meaningless without the key that provisioned them"
  );
});

test("the snapshot store satisfies Jini's synchronous ComposioConfigStore contract", () => {
  const store = createSnapshotComposioConfigStore({
    initial: { apiKey: "comp_live_SECRET1234", authConfigIds: { github: "ac_github_1" } },
  });

  // Assignability is the contract under test: the provider is constructed with this object.
  const asJiniStore: ComposioConfigStore = store;
  assert.deepEqual(asJiniStore.read(), {
    apiKey: "comp_live_SECRET1234",
    authConfigIds: { github: "ac_github_1" },
  });
  assert.deepEqual(asJiniStore.readPublic(), { configured: true, apiKeyTail: "1234" });
});

test("the snapshot store refuses to let write() become a second source of truth for the key", () => {
  const store = createSnapshotComposioConfigStore({
    initial: { apiKey: "comp_live_SECRET1234", authConfigIds: {} },
  });

  store.write({ apiKey: "comp_live_IMPOSTOR" });

  assert.equal(
    store.read().apiKey,
    "comp_live_SECRET1234",
    "the sealed row is the system of record; an unsealed process-local override would diverge on restart"
  );
});

test("snapshot auth-config mutations are reported to the persist callback", () => {
  const persisted: Record<string, string>[] = [];
  const store = createSnapshotComposioConfigStore({
    initial: { apiKey: "comp_live_SECRET1234", authConfigIds: {} },
    persistAuthConfigIds: (ids) => persisted.push(ids),
  });

  store.setAuthConfigId("github", "ac_github_1");
  store.setAuthConfigId("  ", "ac_blank");
  store.deleteAuthConfigId("github");
  store.deleteAuthConfigId("never-set");

  assert.deepEqual(persisted, [{ github: "ac_github_1" }, {}]);
  assert.deepEqual(store.read().authConfigIds, {});
});

test("replace installs a freshly decrypted config after a key change", () => {
  const store = createSnapshotComposioConfigStore({
    initial: { apiKey: "", authConfigIds: {} },
  });
  assert.equal(store.readPublic().configured, false);

  store.replace({ apiKey: "comp_live_SECRET1234", authConfigIds: { github: "ac_github_1" } });

  assert.deepEqual(store.readPublic(), { configured: true, apiKeyTail: "1234" });
  assert.deepEqual(store.read().authConfigIds, { github: "ac_github_1" });
});

test("the view shape stays assignable to Jini's PublicComposioConfig", async () => {
  const deps = makeDeps();
  const view: ComposioConfigView = await saveComposioApiKey(deps, {
    workspaceId: WORKSPACE,
    apiKey: "comp_live_SECRET1234",
  });
  // Pins the structural duplication called out in the store's doc comment: if Jini widens
  // `PublicComposioConfig`, this stops compiling instead of drifting silently.
  const asJiniPublic: PublicComposioConfig = view;
  assert.equal(asJiniPublic.configured, true);
});
