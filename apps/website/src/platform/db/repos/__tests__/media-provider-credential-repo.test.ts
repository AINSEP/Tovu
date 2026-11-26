import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { createHash } from "node:crypto";
import { CREDENTIAL_MESSAGES, CredentialInputError, normalizeCredentialToken } from "@jini-ai/platform/secrets/credential-token";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { MEDIA_PROVIDERS } from "@jini-ai/integrations/media-providers/catalog";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import assert from "node:assert/strict";
import test from "node:test";
import { ensureVaultRepoFixture } from "./vault-repo.fixture.js";

import type { MediaProviderCredentialRecord } from "@jini-ai/cms/media/site/provider-credential-contracts";
import { resolveMediaProviderCredential, saveMediaProviderCredentials } from "@jini-ai/cms/media/site/provider-credential-store";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlMediaProviderCredentialRepo } from "../../../../features/media/media-provider-credential-repo.js";

const MEDIA_CREDENTIAL_POLICY = { ownerKey: "tovu", legacyIds: { grok: ["xai-grok-imagine"] },
  parseMeta: ({ meta }: { meta: unknown }) => parseTovuStoreMeta({ kind: "media-provider", meta }) as { baseUrl: string | null; model: string | null } };
const MEDIA_CREDENTIAL_BINDINGS = { vaultPolicy: MEDIA_CREDENTIAL_POLICY,
  credentialPolicy: { assertCredentialFreeField, normalizeCredentialToken }, builtInProviderIds: new Set(MEDIA_PROVIDERS.map(provider => provider.id)),
  credentialInputMessage: ({ error }: { error: unknown }) => error instanceof CredentialInputError ? error.message : undefined,
  storageMessage: CREDENTIAL_MESSAGES.storage, sha256Hex: ({ text }: { text: string }) => createHash("sha256").update(text).digest("hex"),
  createVault: (required: Omit<Parameters<typeof createTovuStoreVault>[0], "kind">) => createTovuStoreVault({ ...required, kind: "media-provider" }),
};


/** Existing characterization suite now exercises Jini's vault-backed facade on both dialects.
 * The step is activated on disposable fixtures only; production migration registration is untouched.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-09T00:00:00.000Z";
let nextId = 0;
const idGen = { newId: () => `fresh-vault-${++nextId}` };

function makeRecord(overrides: Partial<MediaProviderCredentialRecord> = {}): MediaProviderCredentialRecord {
  return {
    workspaceId: WORKSPACE,
    providerId: "openai",
    baseUrl: null,
    model: null,
    sealed: null,
    keyTail: null,
    aadVersion: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describeEachDialect(
  "MediaProviderCredentialRepoPort",
  { tables: ["workspaces"], make: (kernel) => ({ kernel, repo: new SqlMediaProviderCredentialRepo({ kernel, idGen }) }) },
  (make) => {
    async function makeRepo() {
      const { kernel, repo } = make();
      await ensureVaultRepoFixture({ kernel });
      await seedWorkspaces(kernel, [WORKSPACE, OTHER_WORKSPACE]);
      return repo;
    }

    test("listByWorkspaceId returns an empty array when no rows exist", async () => {
      assert.deepEqual(await (await makeRepo()).listByWorkspaceId({ workspaceId: WORKSPACE }), []);
    });

    test("upsert then list round-trips a sealed record exactly", async () => {
      const repo = await makeRepo();
      const record = makeRecord({
        baseUrl: "https://api.openai.com/v1",
        model: "dall-e-3",
        sealed: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
        keyTail: "", aadVersion: 1,
      });

      await repo.upsert(record);

      assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: WORKSPACE }), [record]);
    });

    test("a keyless row round-trips with sealed and keyTail both null", async () => {
      const repo = await makeRepo();
      const record = makeRecord({ baseUrl: "https://proxy.example.com/v1" });

      await repo.upsert(record);

      const [found] = await repo.listByWorkspaceId({ workspaceId: WORKSPACE });
      assert.equal(found?.sealed, null);
      assert.equal(found?.keyTail, null);
      assert.equal(found?.baseUrl, "https://proxy.example.com/v1");
    });

    test("a non-default media singleton resolves with one exact-provider query and one open", async () => {
      const repo = await makeRepo();
      const keyring = new InMemoryKeyring();
      const sealer = new AesGcmSecretSealer({ keyring });
      const deps = { repo, keyring, sealer, idGen, clock: { nowMs: () => Date.parse(NOW) } };
      await saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId: WORKSPACE, providers: { openai: { apiKey: "real-media-token-1234" } } } });
      const [selected] = await repo.vault.list({ workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null, provider: "openai" });
      await repo.vault.put({ record: { ...selected!, isDefault: false, revision: selected!.revision + 1 }, expectedRevision: selected!.revision });
      let reads = 0;
      let opens = 0;
      const list = repo.vault.list.bind(repo.vault);
      repo.vault.list = input => { reads++; assert.equal(input.provider, "openai"); return list(input); };
      repo.vault.find = async () => { throw new Error("unexpected second read"); };
      const resolved = await resolveMediaProviderCredential({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, repo, sealer: {
        seal: sealer.seal.bind(sealer), open: (input, options) => { opens++; return sealer.open(input, options); },
      } }, workspaceId: WORKSPACE, providerId: "openai" });
      assert.equal(resolved?.apiKey, "real-media-token-1234");
      assert.equal(reads, 1);
      assert.equal(opens, 1);
    });

    test("upsert on the same (workspace, provider) updates the one row rather than adding a second", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ model: "dall-e-3" }));
      await repo.upsert(makeRecord({ model: "gpt-image-2", updatedAt: "2026-08-09T01:00:00.000Z" }));

      const rows = await repo.listByWorkspaceId({ workspaceId: WORKSPACE });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.model, "gpt-image-2");
    });

    test("two providers coexist in one workspace under the composite key", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "openai" }));
      await repo.upsert(makeRecord({ providerId: "leonardo" }));

      const ids = (await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map((row) => row.providerId).sort();
      assert.deepEqual(ids, ["leonardo", "openai"]);
    });

    test("listByWorkspaceId never returns another workspace's rows", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ workspaceId: WORKSPACE, providerId: "openai" }));
      await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "leonardo" }));

      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map((r) => r.providerId), ["openai"]);
      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: OTHER_WORKSPACE })).map((r) => r.providerId), ["leonardo"]);
    });

    test("deleteByProviderIds removes only the named ids", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "openai" }));
      await repo.upsert(makeRecord({ providerId: "leonardo" }));
      await repo.upsert(makeRecord({ providerId: "fal" }));

      await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["leonardo", "fal"] });

      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map((r) => r.providerId), ["openai"]);
    });

    test("deleteByProviderIds on an empty list is a no-op, not an IN () syntax error", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord());

      await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: [] });

      assert.equal((await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).length, 1);
    });

    test("deleteByProviderIds never crosses a workspace boundary", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "openai" }));

      await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai"] });

      assert.equal((await repo.listByWorkspaceId({ workspaceId: OTHER_WORKSPACE })).length, 1);
    });

    test("deleteByProviderIds on ids with no rows is harmless", async () => {
      const repo = await makeRepo();
      await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai", "leonardo"] });
      assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: WORKSPACE }), []);
    });

    test("replaceWorkspace commits every upsert and the tombstone delete together", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "leonardo" }));

      const written = await repo.replaceWorkspace({
        workspaceId: WORKSPACE,
        plan: () => ({
          upserts: [makeRecord({ providerId: "openai", model: "dall-e-3" })],
          tombstoneProviderIds: ["leonardo"],
        }),
      });

      assert.deepEqual(written.map((r) => r.providerId), ["openai"]);
      const rows = await repo.listByWorkspaceId({ workspaceId: WORKSPACE });
      assert.deepEqual(rows.map((r) => r.providerId).sort(), ["openai"]);
    });

    test("replaceWorkspace rolls back writes it had already applied when a later write in the same transaction fails (atomicity proof)", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "leonardo", model: "kept" }));

      await assert.rejects(
        () =>
          repo.replaceWorkspace({
            workspaceId: WORKSPACE,
            plan: () => ({
              upserts: [
                makeRecord({ providerId: "openai", model: "dall-e-3" }),
                // Duplicate identity fails CAS AFTER the first write, proving batch rollback.
                makeRecord({ providerId: "openai", model: "duplicate" }),
              ],
              tombstoneProviderIds: ["leonardo"],
            }),
          }),
        /Secrets vault: conflict/
      );

      const rows = await repo.listByWorkspaceId({ workspaceId: WORKSPACE });
      assert.deepEqual(
        rows.map((r) => r.providerId).sort(),
        ["leonardo"],
        "the openai row written before the failure must roll back, and the planned tombstone must not be reached"
      );
      assert.equal(rows[0]?.model, "kept");
    });

    test("replaceWorkspace applies nothing when the planner itself throws", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "leonardo", model: "kept" }));

      await assert.rejects(
        () =>
          repo.replaceWorkspace({
            workspaceId: WORKSPACE,
            plan: () => {
              throw new Error("planner refused");
            },
          }),
        /planner refused/
      );

      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map((r) => r.model), ["kept"]);
    });

    test("the planner is handed the rows as of the transaction, never a caller's earlier snapshot", async () => {
      // The staleness half of the atomicity defect: the store used to read the workspace itself, merge
      // against that snapshot, and only then open a transaction. Anything committed in between was
      // overwritten by the merge. The read now lives inside the boundary.
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "openai", model: "v1" }));
      const staleSnapshot = await repo.listByWorkspaceId({ workspaceId: WORKSPACE });
      await repo.upsert(makeRecord({ providerId: "openai", model: "v2" }));

      let seenByPlanner: string[] = [];
      await repo.replaceWorkspace({
        workspaceId: WORKSPACE,
        plan: ({ existing }) => {
          seenByPlanner = existing.map((row) => `${row.providerId}:${row.model}`);
          return { upserts: [], tombstoneProviderIds: [] };
        },
      });

      assert.deepEqual(staleSnapshot.map((r) => r.model), ["v1"]);
      assert.deepEqual(seenByPlanner, ["openai:v2"], "the planner must see committed state, not the caller's older read");
    });

    test("replaceWorkspace reads, plans and writes inside the real kernel transaction", async () => {
      const { kernel } = make();
      await ensureVaultRepoFixture({ kernel });
      await seedWorkspaces(kernel, [WORKSPACE]);
      const transactionStates: boolean[] = [];
      const observedKernel: typeof kernel = { ...kernel,
        run: (fn) => {
          transactionStates.push(kernel.inTransaction());
          return kernel.run(fn);
        },
      };
      const repo = new SqlMediaProviderCredentialRepo({ kernel: observedKernel, idGen });
      await repo.replaceWorkspace({ workspaceId: WORKSPACE, plan: () => {
        assert.equal(kernel.inTransaction(), true, "the planner must run inside the transaction");
        return { upserts: [makeRecord()], tombstoneProviderIds: [] };
      } });
      assert.ok(transactionStates.length > 0, "the real database must have been accessed");
      assert.ok(transactionStates.every(Boolean), "every read and write must use the transaction executor");
      assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: WORKSPACE }), [makeRecord()]);
    });

    test("a metadata-only SQL save preserves a rotation committed while its other key was sealing", async () => {
      const repo = await makeRepo();
      const keyring = new InMemoryKeyring();
      const sealer = new AesGcmSecretSealer({ keyring });
      const deps = { repo, keyring, sealer, idGen, clock: { nowMs: () => Date.parse(NOW) } };
      await saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-old-1111" } } } });
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const sealing = new Promise<void>((resolve) => { entered = resolve; });
      const slow = saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps, sealer: {
        open: sealer.open.bind(sealer),
        seal: async (input) => { entered(); await gate; return sealer.seal(input); },
      } }, input: { workspaceId: WORKSPACE, providers: { openai: { model: "edited" }, leonardo: { apiKey: "xai-new-3333" } } } });
      try {
        await sealing;
        await saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-rotated-9999" } } } });
      } finally {
        release();
      }
      await slow;
      assert.deepEqual(await resolveMediaProviderCredential({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, workspaceId: WORKSPACE, providerId: "openai" }), {
        apiKey: "sk-rotated-9999", baseUrl: null, model: "edited",
      });
      assert.equal((await resolveMediaProviderCredential({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, workspaceId: WORKSPACE, providerId: "leonardo" }))?.apiKey, "xai-new-3333");
    });

    test("replaceWorkspace never reads or tombstones another workspace's rows", async () => {
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "openai" }));
      await repo.upsert(makeRecord({ workspaceId: WORKSPACE, providerId: "leonardo" }));

      let seenByPlanner: string[] = [];
      await repo.replaceWorkspace({
        workspaceId: WORKSPACE,
        plan: ({ existing }) => {
          seenByPlanner = existing.map((row) => row.providerId);
          return { upserts: [], tombstoneProviderIds: ["leonardo", "openai"] };
        },
      });

      assert.deepEqual(seenByPlanner, ["leonardo"]);
      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: OTHER_WORKSPACE })).map((r) => r.providerId), ["openai"]);
      assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: WORKSPACE }), []);
    });

    test("a reader polling on the shared connection can never observe a half-replaced map", async () => {
      // Codex's live reproduction against better-sqlite3: the old `transaction()` awaited between each
      // upsert and the tombstone delete, and because this connection is shared and synchronous, another
      // queued continuation could run mid-transaction and read uncommitted, half-replaced state
      // (`[a:new, b:old]`). `replaceWorkspace`'s body has no suspension point, so there is no turn of
      // the event loop at which such a state exists.
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "openai", model: "old" }));
      await repo.upsert(makeRecord({ providerId: "leonardo", model: "old" }));

      const modelsNow = async (): Promise<string> =>
        (await repo.listByWorkspaceId({ workspaceId: WORKSPACE }))
          .map((row) => `${row.providerId}:${row.model}`)
          .sort()
          .join(",");

      let replacing = true;
      const observations: string[] = [];
      const observer = (async () => {
        for (let turn = 0; turn < 5000 && replacing; turn += 1) {
          observations.push(await modelsNow());
          await Promise.resolve();
        }
      })();

      await repo.replaceWorkspace({
        workspaceId: WORKSPACE,
        plan: () => ({
          upserts: [
            makeRecord({ providerId: "openai", model: "new" }),
            makeRecord({ providerId: "leonardo", model: "new" }),
          ],
          tombstoneProviderIds: [],
        }),
      });
      replacing = false;
      await observer;

      assert.ok(observations.length > 0);
      for (const observed of observations) {
        assert.ok(
          observed === "leonardo:old,openai:old" || observed === "leonardo:new,openai:new",
          `uncommitted half-replaced state was observable: ${observed}`
        );
      }
    });

    test("an async planner smuggled past the type system fails closed instead of reopening the interleaving window", async () => {
      // `MediaProviderCredentialReplacePlanner` forbids a promise return, which is the primary defence.
      // This pins the runtime behaviour behind it: a planner cast past that type does not quietly write
      // a partial map or leave the transaction hanging open — it aborts and rolls back.
      const repo = await makeRepo();
      await repo.upsert(makeRecord({ providerId: "leonardo", model: "kept" }));

      await assert.rejects(() =>
        repo.replaceWorkspace({
          workspaceId: WORKSPACE,
          plan: (async () => ({
            upserts: [makeRecord({ providerId: "openai" })],
            tombstoneProviderIds: ["leonardo"],
          })) as unknown as Parameters<typeof repo.replaceWorkspace>[0]["plan"],
        })
      );

      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map((r) => r.providerId), ["leonardo"]);

      // ...and the connection is usable afterwards, proving the aborted transaction really closed.
      await repo.upsert(makeRecord({ providerId: "openai" }));
      assert.deepEqual((await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map((r) => r.providerId).sort(), ["leonardo", "openai"]);
    });
  }
);
