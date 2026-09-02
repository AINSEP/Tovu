import assert from "node:assert/strict";
import test from "node:test";

import type { ComposioConfigStore, PublicComposioConfig } from "@jini-ai/integrations/composio";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryComposioConfigRepo } from "../composio-config-store.memory.js";
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
} from "../composio-config-store.js";
import { buildComposioConfigAad } from "../composio-config-aad.js";

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
  assert.equal(
    await saveComposioAuthConfigIds(deps, {
      workspaceId: WORKSPACE,
      authConfigIds: { github: "ac_github_1" },
    }),
    false
  );
  assert.equal(
    await deps.repo.findByWorkspaceId(WORKSPACE),
    null,
    "auth-config ids are meaningless without the key that provisioned them"
  );
});

test("saveComposioAuthConfigIds persists ids and leaves the sealed key untouched (happy path)", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  const before = await deps.repo.findByWorkspaceId(WORKSPACE);

  assert.equal(
    await saveComposioAuthConfigIds(deps, {
      workspaceId: WORKSPACE,
      authConfigIds: { github: "ac_github_1", slack: "ac_slack_2" },
    }),
    true
  );

  const after = await deps.repo.findByWorkspaceId(WORKSPACE);
  assert.deepEqual(after?.authConfigIds, { github: "ac_github_1", slack: "ac_slack_2" });
  assert.deepEqual(after?.sealed, before?.sealed, "the sealed key must not be rewritten by this path");
  assert.equal(after?.keyTail, "1234");
  assert.equal(after?.keyGeneration, before?.keyGeneration, "persisting ids must not move the generation on");
});

test("a delayed auth-config write cannot revert a key rotation that landed while it was in flight", async () => {
  // Codex's reproduction of the defect, verbatim in shape: the persist callback reads the row (K1),
  // an admin rotates the key to K2, and only then does the delayed write complete. The old
  // read-modify-write upsert put K1's `sealed`/`keyTail` back while attaching ids provisioned under
  // K2 — the workspace ended up holding the WRONG key with cross-project ids stapled to it.
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_FIRSTKEY1111" });

  // The read half of the persist, captured before the rotation — this is the stale snapshot.
  const staleRow = await deps.repo.findByWorkspaceId(WORKSPACE);
  assert.notEqual(staleRow, null);

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECONDKEY2222" });

  // ...and now the delayed write lands, still believing the row is at the generation it read.
  const applied = await deps.repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: staleRow!.keyGeneration,
    authConfigIds: { github: "ac_provisioned_under_second_key" },
    updatedAt: "2026-08-09T00:00:01.000Z",
  });

  assert.equal(applied, false, "the compare-and-swap must refuse a write aimed at a superseded key");

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.equal(config.apiKey, "comp_live_SECONDKEY2222", "the rotation must survive the delayed write");
  assert.deepEqual(config.authConfigIds, {}, "ids provisioned against another key must not be attached");
  assert.equal((await deps.repo.findByWorkspaceId(WORKSPACE))?.keyTail, "2222");
});

test("the same interleaving through saveComposioAuthConfigIds itself drops the write instead of corrupting the row", async () => {
  // The port-level test above pins the compare-and-swap; this pins the caller that has to use it.
  // `saveComposioAuthConfigIds` must capture the generation alongside the row it reads, not re-read
  // it at write time — re-reading would make the guard vacuous.
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_FIRSTKEY1111" });

  // A repo whose read resolves normally but parks the caller before it can write, so a rotation
  // can be slipped into exactly the window the fire-and-forget persist opens.
  let releaseRotation!: () => void;
  const rotationDone = new Promise<void>((resolve) => {
    releaseRotation = resolve;
  });
  const gatedRepo: typeof deps.repo = {
    findByWorkspaceId: (workspaceId) => deps.repo.findByWorkspaceId(workspaceId),
    upsert: (record) => deps.repo.upsert(record),
    updateAuthConfigIdsIfGenerationMatches: async (input) => {
      await rotationDone;
      return deps.repo.updateAuthConfigIdsIfGenerationMatches(input);
    },
  };

  const delayedPersist = saveComposioAuthConfigIds(
    { repo: gatedRepo, clock: deps.clock },
    { workspaceId: WORKSPACE, authConfigIds: { github: "ac_github_1" } }
  );

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECONDKEY2222" });
  releaseRotation();

  assert.equal(await delayedPersist, false, "the write must be reported as dropped, not silently applied");

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.equal(config.apiKey, "comp_live_SECONDKEY2222");
  assert.deepEqual(config.authConfigIds, {});
});

test("re-pasting the SAME key does not invalidate an auth-config write that was already in flight", async () => {
  // The counterpart to the test above, and the reason the generation is NOT bumped on a no-op save:
  // a re-paste deliberately keeps the provisioned ids, so invalidating a concurrent connect
  // handshake would force a pointless re-provision for a save that changed nothing.
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  const rowBeforePersist = await deps.repo.findByWorkspaceId(WORKSPACE);

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });

  const applied = await deps.repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: rowBeforePersist!.keyGeneration,
    authConfigIds: { github: "ac_github_1" },
    updatedAt: "2026-08-09T00:00:01.000Z",
  });

  assert.equal(applied, true);
  assert.deepEqual((await readComposioConfig(deps, { workspaceId: WORKSPACE })).authConfigIds, {
    github: "ac_github_1",
  });
});

test("clearing the key invalidates an auth-config write that was already in flight", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SECRET1234" });
  const rowBeforeClear = await deps.repo.findByWorkspaceId(WORKSPACE);

  await clearComposioApiKey(deps, { workspaceId: WORKSPACE });

  const applied = await deps.repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: rowBeforeClear!.keyGeneration,
    authConfigIds: { github: "ac_github_1" },
    updatedAt: "2026-08-09T00:00:01.000Z",
  });

  assert.equal(applied, false, "a clear must leave no window for ids to be written back afterwards");
  assert.deepEqual(await readComposioConfig(deps, { workspaceId: WORKSPACE }), {
    apiKey: "",
    authConfigIds: {},
  });
});

test("the key generation moves on for every rotation and clear, and holds for a same-key re-save", async () => {
  const deps = makeDeps();
  const generationNow = async (): Promise<number | undefined> =>
    (await deps.repo.findByWorkspaceId(WORKSPACE))?.keyGeneration;

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_AAAA1111" });
  assert.equal(await generationNow(), 0, "the first key a workspace stores starts the counter");

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_AAAA1111" });
  assert.equal(await generationNow(), 0, "a genuine no-op re-save must not invalidate in-flight writes");

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_BBBB2222" });
  assert.equal(await generationNow(), 1);

  // Same tail as the key above, different key — the tail is a display marker, never the identity.
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_CCCC2222" });
  assert.equal(await generationNow(), 2);

  await clearComposioApiKey(deps, { workspaceId: WORKSPACE });
  assert.equal(await generationNow(), 3);

  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_DDDD3333" });
  assert.equal(await generationNow(), 4, "the counter is monotonic across a clear, never reset");
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

// ---------------------------------------------------------------------------
// AAD (2026-09-02 gap closure) — `composio_config` used to seal with no additional authenticated
// data at all, so a ciphertext was transplantable between workspace rows. New writes must bind
// `workspaceId` into the seal; existing (`aad_version = 0`) rows must keep opening exactly as
// before so no live Composio project key goes dark mid-migration.
// ---------------------------------------------------------------------------

test("a freshly saved key is sealed with AAD bound to workspaceId and the row is marked aadVersion 1", async () => {
  const deps = makeDeps();
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_AAD_BOUND_1234" });

  const row = await deps.repo.findByWorkspaceId(WORKSPACE);
  assert.equal(row?.aadVersion, 1);

  // Opening under the WRONG aad (the legacy no-aad shape) must fail closed.
  await assert.rejects(() => deps.sealer.open({ sealed: row!.sealed! }));
  const opened = await deps.sealer.open({
    sealed: row!.sealed!,
    aad: buildComposioConfigAad({ workspaceId: WORKSPACE }),
  });
  assert.equal(opened, "comp_live_AAD_BOUND_1234");
});

test("a legacy row sealed with NO aad (aadVersion 0) still resolves to its exact plaintext — existing credentials are never bricked", async () => {
  const deps = makeDeps();
  const legacySealed = await deps.sealer.seal({ plaintext: "comp_live_LEGACY_5678", key: await deps.keyring.activeKey() });
  await deps.repo.upsert({
    workspaceId: WORKSPACE,
    sealed: legacySealed,
    keyTail: "5678",
    authConfigIds: {},
    keyGeneration: 0,
    aadVersion: 0,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const config = await readComposioConfig(deps, { workspaceId: WORKSPACE });
  assert.equal(config.apiKey, "comp_live_LEGACY_5678");
});

test("re-pasting the SAME key over a legacy (aadVersion 0) row still recognizes it as unchanged and preserves authConfigIds", async () => {
  // isSameApiKey must open the EXISTING row (legacy, no aad) correctly to compare — a regression
  // here would fail closed into "treat as changed", silently discarding provisioned auth-config ids
  // on every save until the workspace is backfilled.
  const deps = makeDeps();
  const legacySealed = await deps.sealer.seal({ plaintext: "comp_live_SAME_9999", key: await deps.keyring.activeKey() });
  await deps.repo.upsert({
    workspaceId: WORKSPACE,
    sealed: legacySealed,
    keyTail: "9999",
    authConfigIds: { github: "ac_github_1" },
    keyGeneration: 3,
    aadVersion: 0,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const view = await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_SAME_9999" });
  assert.deepEqual(view, { configured: true, apiKeyTail: "9999" });

  const row = await deps.repo.findByWorkspaceId(WORKSPACE);
  assert.deepEqual(row?.authConfigIds, { github: "ac_github_1" }, "authConfigIds must survive a same-key re-save");
  assert.equal(row?.keyGeneration, 3, "keyGeneration must not bump on a same-key re-save");
  // The row was re-saved, so it is now upgraded to the new AAD scheme.
  assert.equal(row?.aadVersion, 1);
});

test("AAD binding: swapping the sealed key onto a DIFFERENT workspace's row fails closed (adversarial cross-workspace transplant)", async () => {
  const deps = makeDeps();
  const OTHER_WORKSPACE = "workspace-2";
  await saveComposioApiKey(deps, { workspaceId: WORKSPACE, apiKey: "comp_live_workspace_one" });
  await saveComposioApiKey(deps, { workspaceId: OTHER_WORKSPACE, apiKey: "comp_live_workspace_two" });

  const rowOne = await deps.repo.findByWorkspaceId(WORKSPACE);
  const rowTwo = await deps.repo.findByWorkspaceId(OTHER_WORKSPACE);

  // Simulate an attacker (or a bad migration) with DB write access moving workspace two's
  // ciphertext onto workspace one's row — the AAD (bound to the row's OWN workspaceId) must reject
  // this even though the AES key is shared app-wide.
  await deps.repo.upsert({ ...rowOne!, sealed: rowTwo!.sealed, keyTail: rowTwo!.keyTail });

  await assert.rejects(() => readComposioConfig(deps, { workspaceId: WORKSPACE }));
});
