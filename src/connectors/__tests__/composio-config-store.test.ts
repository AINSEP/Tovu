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
 * `authConfigIds` are dropped on a key CHANGE but survive re-pasting the same key (the tail
 * comparison, not a ciphertext comparison, is what makes that work at all under randomized AEAD), a
 * missing master secret fails closed before anything is written, and the synchronous snapshot store
 * refuses to become a second source of truth for the key.
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
