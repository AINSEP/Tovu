import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryMediaProviderCredentialRepo } from "../provider-credential-store.memory.js";
import {
  MediaProviderCredentialSecretStoreUnconfiguredError,
  MediaProviderCredentialValidationError,
  getMediaProviderCredentials,
  type MediaProviderCredentialRecord,
  type MediaProviderCredentialRepoPort,
  resolveMediaProviderCredential,
  saveMediaProviderCredentials,
} from "../provider-credential-store.js";
import { buildVaultAad } from "@jini-ai/platform/secrets/credential-sets";
import { CREDENTIAL_MESSAGES, CREDENTIAL_TOKEN_LIMIT } from "../../../contracts/core/credential-token.js";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { mediaVaultScope } from "../provider-credential-vault.js";

/**
 * @file `provider-credential-store.ts` — the whole-map-replace credential contract behind the
 * admin's Media → "Media providers" tab.
 *
 * The assertions that matter most: a key is never echoed back, an omitted provider is DELETED
 * rather than left alone (the tab expresses Clear as an omission), an entry with no `apiKey` keeps
 * the stored key so a `baseUrl`-only edit does not silently wipe it, UI-spelled provider ids are
 * REJECTED so the engine-canonical id is the only thing that can ever reach storage, and a missing
 * site key fails closed before any row is written rather than persisting a partial map.
 */

const WORKSPACE = "workspace-1";
const clock = { nowMs: () => Date.parse("2026-08-09T00:00:00.000Z"), nowIso: () => "2026-08-09T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, deps: { repo, keyring, sealer, clock } };
}

/** A `KeyringPort` that always fails — simulates a missing `TOVU_SITE_KEY` without
 *  touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no site key: TOVU_SITE_KEY is not set");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
}

test("save stores a key and returns markers only, never the key", async () => {
  const { deps } = makeDeps();

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: (" \ts" + "k-test-abcd1234\n "), baseUrl: "https://api.openai.com/v1", model: "dall-e-3" } },
  });

  assert.deepEqual(saved, {
    openai: {
      baseUrl: "https://api.openai.com/v1",
      model: "dall-e-3",
      apiKeyConfigured: true,
      apiKeyTail: "1234",
      apiKeyHint: { length: 16, last4: "1234" },
    },
  });
  assert.equal(JSON.stringify(saved).includes(("s" + "k-test-abcd1234")), false);
  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.equal(resolved?.apiKey === ("s" + "k-test-abcd1234"), true, "only the entered key edges may be trimmed");
});

test("the stored value round-trips through a fresh read", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { grok: { apiKey: "xai-key-wxyz", baseUrl: "https://api.x.ai/v1" } },
  });

  const read = await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE });

  assert.deepEqual(read, {
    grok: { baseUrl: "https://api.x.ai/v1", apiKeyConfigured: true, apiKeyTail: "wxyz", apiKeyHint: { length: 12, last4: "wxyz" } },
  });
  // Vault hints remain readable even when no sealer is provided.
  assert.deepEqual(await getMediaProviderCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE }), {
    grok: { baseUrl: "https://api.x.ai/v1", apiKeyConfigured: true, apiKeyTail: "wxyz", apiKeyHint: { length: 12, last4: "wxyz" } },
  });
});

test("a provider omitted from the payload is DELETED, not left alone", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-one-1111") }, grok: { apiKey: "xai-two-2222" } },
  });

  // The tab expresses "Clear grok" by sending a map that simply lacks it.
  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKeyConfigured: true, apiKeyTail: "1111" } },
  });

  assert.deepEqual(Object.keys(saved), ["openai"]);
  const read = await getMediaProviderCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(Object.keys(read), ["openai"]);
});

test("an entry with no apiKey keeps the stored key while editing other fields", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-keep-9999") } },
  });

  // What the tab actually re-sends for an untouched provider: the markers it was handed, no key.
  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKeyConfigured: true, apiKeyTail: "9999", model: "gpt-image-2" } },
  });

  assert.equal(saved.openai?.apiKeyConfigured, true);
  assert.equal(saved.openai?.apiKeyTail, "9999");
  assert.equal(saved.openai?.model, "gpt-image-2");
});

test("T17: a legacy keyless provider does not block another provider's metadata edit", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE, providers: { grok: { apiKey: "xai-existing-1234" } },
  });
  // New creates require a key, but migrated/recovered rows can legitimately have none.
  await repo.upsert({
    workspaceId: WORKSPACE, providerId: "openai", baseUrl: "https://api.openai.com/v1", model: null,
    sealed: null, keyTail: null, aadVersion: 0, createdAt: clock.nowIso(), updatedAt: clock.nowIso(),
  });
  const before = await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(before.openai, { baseUrl: "https://api.openai.com/v1" });
  const expected = { ...before, grok: { ...before.grok, model: "edited-model" } };

  await assert.doesNotReject(async () => {
    const saved = await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: expected });
    assert.deepEqual(saved, expected);
  }, "re-sending an existing keyless provider must not require a new token");

  assert.deepEqual(await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE }), expected);
  assert.equal((await repo.listByWorkspaceId(WORKSPACE)).find(row => row.providerId === "openai")?.sealed, null);
  assert.equal((await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "grok" }))?.apiKey,
    "xai-existing-1234");
});

test("a blank apiKey is treated as absent, not as a clear", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-blank-7777") } },
  });

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "" } },
  });

  assert.equal(saved.openai?.apiKeyConfigured, true);
  assert.equal(saved.openai?.apiKeyTail, "7777");
  const before = await deps.repo.listByWorkspaceId(WORKSPACE);
  await assert.rejects(saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE, providers: { openai: { apiKey: "   " } },
  }), { name: "Error", message: "Enter a token. Spaces alone are not a token." });
  assert.deepEqual(await deps.repo.listByWorkspaceId(WORKSPACE), before);
});

test("a provider create with an absent or blank key fails without changing stored providers", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE, providers: { grok: { apiKey: "xai-existing-1234" } },
  });
  const before = await repo.listByWorkspaceId(WORKSPACE);
  for (const apiKey of [undefined, "", "   "]) {
    await assert.rejects(saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { openai: { apiKey, baseUrl: "https://proxy.example.com/v1" } },
    }), { name: "Error", message: "Enter a token. Spaces alone are not a token." });
    assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), before);
  }
});

test("UI-spelled provider ids are rejected so only engine-canonical ids reach storage", async () => {
  const { deps } = makeDeps();

  // The exact divergence that would otherwise persist keys the dispatch engine never finds.
  for (const uiSpelling of ["xai-grok-imagine", "nano-banana", "fal-ai", "leonardo-ai", "custom-image-api", "volcengine-ark"]) {
    await assert.rejects(
      saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { [uiSpelling]: { apiKey: "k-1234" } } }),
      MediaProviderCredentialValidationError,
      `${uiSpelling} must be rejected`
    );
  }

  // ...and each one's engine-canonical counterpart is accepted.
  for (const canonical of ["grok", "nanobanana", "fal", "leonardo", "custom-image", "volcengine"]) {
    const saved = await saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { [canonical]: { apiKey: "k-1234" } },
    });
    assert.equal(saved[canonical]?.apiKeyConfigured, true, `${canonical} must be accepted`);
  }
});

test("a non-string or oversized field is rejected", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { openai: { apiKey: 42 as unknown as string } },
    }),
    MediaProviderCredentialValidationError
  );
  await assert.rejects(
    saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { openai: { baseUrl: "x".repeat(2049) } },
    }),
    MediaProviderCredentialValidationError
  );
});

test("providers itself must be an object: null and an array are both rejected, never treated as an empty map", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: null as unknown as Record<string, never> }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialValidationError);
      assert.equal((err as Error).message, "providers must be an object keyed by provider id");
      return true;
    }
  );
  await assert.rejects(
    saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: [] as unknown as Record<string, never> }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialValidationError);
      assert.equal((err as Error).message, "providers must be an object keyed by provider id");
      return true;
    }
  );
});

test("a provider entry that is null or an array is rejected as not-an-object, distinct from an unknown-field entry", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: null as unknown as object } }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialValidationError);
      assert.equal((err as Error).message, 'provider "openai" must be an object');
      return true;
    }
  );
  await assert.rejects(
    saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: [] as unknown as object } }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialValidationError);
      assert.equal((err as Error).message, 'provider "openai" must be an object');
      return true;
    }
  );
});

/** A `KeyringPort` that rejects with a non-`Error` value — proves `sealNewProviderKeys` handles
 *  arbitrary thrown values with fixed safe copy rather than stringifying possible key material;
 *  `BrokenKeyring` above always throws a real `Error`. */
class NonErrorThrowingKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately non-Error, see class doc
    throw "boom: no key material available";
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
}

test("a non-Error rejection from the keyring returns only the safe secret-store-unconfigured message", async () => {
  const { deps } = makeDeps();
  const broken = { ...deps, keyring: new NonErrorThrowingKeyring() };

  await assert.rejects(
    saveMediaProviderCredentials(broken, { workspaceId: WORKSPACE, providers: { openai: { apiKey: ("s" + "k-x-1234") } } }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialSecretStoreUnconfiguredError);
      assert.equal(
        (err as Error).message,
        "The credential could not be saved or unlocked. Check the site credential store."
      );
      return true;
    }
  );
});

test("a missing site key fails closed WITHOUT writing or deleting anything", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-intact-5555") }, grok: { apiKey: "xai-intact-6666" } },
  });

  const broken = { ...deps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    // Also drops `grok` — proving the abort happens before the tombstone pass, not midway through.
    saveMediaProviderCredentials(broken, { workspaceId: WORKSPACE, providers: { openai: { apiKey: ("s" + "k-new-0000") } } }),
    MediaProviderCredentialSecretStoreUnconfiguredError
  );

  const after = await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(after, {
    openai: { apiKeyConfigured: true, apiKeyTail: "5555", apiKeyHint: { length: 14, last4: "5555" } },
    grok: { apiKeyConfigured: true, apiKeyTail: "6666", apiKeyHint: { length: 15, last4: "6666" } },
  });
});

test("one workspace's providers are invisible to another", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-w1-1111") } },
  });
  await saveMediaProviderCredentials(deps, {
    workspaceId: "workspace-2",
    providers: { grok: { apiKey: "xai-w2-2222" } },
  });

  assert.deepEqual(Object.keys(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE })), ["openai"]);
  assert.deepEqual(Object.keys(await getMediaProviderCredentials({ repo }, { workspaceId: "workspace-2" })), ["grok"]);
});

test("an empty map clears every provider and reads back empty", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-gone-3333") } },
  });

  assert.deepEqual(await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: {} }), {});
  assert.deepEqual(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE }), {});
});

test("preserved-state merging and every write stay inside deps.repo.replaceWorkspace()", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { grok: { apiKey: "xai-existing-4444" } },
  });

  const calls: string[] = [];
  // Wraps the real in-memory repo, recording call order and refusing to open the replace. Proves
  // two things at once: no upsert/delete runs outside the transaction, and — the part that matters
  // for the rotation-resurrection defect — the store no longer takes its own `listByWorkspaceId`
  // snapshot beforehand. A pre-read here would be a staleness window no transaction can close.
  const guardedRepo = {
    vault: deps.repo.vault,
    listByWorkspaceId: (workspaceId: string) => {
      calls.push("listByWorkspaceId");
      return deps.repo.listByWorkspaceId(workspaceId);
    },
    upsert: (record: Parameters<typeof deps.repo.upsert>[0]) => {
      calls.push(`upsert:${record.providerId}`);
      return deps.repo.upsert(record);
    },
    deleteByProviderIds: (input: Parameters<typeof deps.repo.deleteByProviderIds>[0]) => {
      calls.push("deleteByProviderIds");
      return deps.repo.deleteByProviderIds(input);
    },
    replaceWorkspace: async (): Promise<never> => {
      calls.push("replaceWorkspace:refused");
      throw new Error("simulated transaction-open failure — no reads or writes should have happened yet");
    },
  };

  await assert.rejects(
    saveMediaProviderCredentials(
      { ...deps, repo: guardedRepo },
      { workspaceId: WORKSPACE, providers: { openai: { apiKey: ("s" + "k-new-5555") } } }
    ),
    /simulated transaction-open failure/
  );

  assert.deepEqual(
    calls,
    ["replaceWorkspace:refused"],
    "listByWorkspaceId/upsert/deleteByProviderIds must never run outside replaceWorkspace"
  );

  // And the pre-existing row is untouched, proving nothing leaked around the guarded replace.
  const after = await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(after, { grok: { apiKeyConfigured: true, apiKeyTail: "4444", apiKeyHint: { length: 17, last4: "4444" } } });
});

/** A sealer whose `seal` parks on a caller-released gate — the one async step
 *  `saveMediaProviderCredentials` performs before it writes, and therefore the only place a
 *  concurrent save can be made to interleave deterministically. */
class GatedSealer implements SecretSealerPort {
  constructor(
    private readonly inner: SecretSealerPort,
    private readonly gate: Promise<void>
  ) {}

  async seal(input: Parameters<SecretSealerPort["seal"]>[0]) {
    await this.gate;
    return this.inner.seal(input);
  }

  open(input: Parameters<SecretSealerPort["open"]>[0], optional: Parameters<SecretSealerPort["open"]>[1] = {}) {
    return this.inner.open(input, optional);
  }
}

test("a metadata-only save cannot resurrect a key that another save rotated while it was sealing", async () => {
  // The second half of the atomicity defect: `saveMediaProviderCredentials` used to read the
  // workspace's rows BEFORE opening its transaction, then write a merge built from that snapshot.
  // A provider whose entry carries no `apiKey` keeps the key from that snapshot — so a rotation
  // that committed in the window between the read and the write was silently reverted by a save
  // that never intended to touch the key at all.
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-alpha-1111") } },
  });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gatedDeps = { ...deps, sealer: new GatedSealer(deps.sealer, gate) };

  // Metadata-only for `openai`, a genuinely new key for `grok`. Sealing grok's key parks on the
  // gate, holding this save open across the rotation below.
  const slowSave = saveMediaProviderCredentials(gatedDeps, {
    workspaceId: WORKSPACE,
    providers: { openai: { model: "dall-e-3" }, grok: { apiKey: "xai-new-3333" } },
  });

  // Meanwhile an admin rotates openai's key, and that save commits in full.
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-beta-9999") } },
  });

  release();
  const written = await slowSave;

  assert.equal(written.openai?.apiKeyTail, "9999", "the rotation that committed mid-flight must survive");

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  const openai = rows.find((row) => row.providerId === "openai");
  assert.notEqual(openai?.sealed, null);
  assert.equal(
    (await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" }))?.apiKey,
    ("s" + "k-beta-9999"),
    "the stored ciphertext must be the rotated key, not the one this save read before it started"
  );
  assert.deepEqual(await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE }), {
    openai: { model: "dall-e-3", apiKeyConfigured: true, apiKeyTail: "9999", apiKeyHint: { length: 12, last4: "9999" } },
    grok: { apiKeyConfigured: true, apiKeyTail: "3333", apiKeyHint: { length: 12, last4: "3333" } },
  });
});

test("a reader polling throughout a save never observes a half-replaced map", async () => {
  // Codex's reproduction of the same defect from the other side: the old transaction body awaited
  // between each upsert and the tombstone delete, so a continuation queued on the shared connection
  // could observe `[a:new, b:old]` — a map that was never a valid state of this workspace.
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-old-key-1111") }, grok: { apiKey: "xai-old-2222" } },
  });

  const tailsNow = async (): Promise<string> => {
    const map = await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE });
    return Object.keys(map)
      .sort()
      .map((id) => `${id}:${map[id]?.apiKeyTail}`)
      .join(",");
  };
  const BEFORE = "grok:2222,openai:1111";
  const AFTER = "grok:4444,openai:3333";

  const observations: string[] = [];
  const observingRepo = Object.create(repo) as typeof repo;
  observingRepo.replaceWorkspace = async (input) => {
    // Start after sealing, at the replacement boundary, so crypto cannot consume the
    // observer's budget before the writes begin. Keep sampling until replacement settles.
    let replacing = true;
    observations.push(await tailsNow());
    const observer = (async () => {
      while (replacing) {
        observations.push(await tailsNow());
        await Promise.resolve();
      }
    })();
    try {
      return await repo.replaceWorkspace(input);
    } finally {
      replacing = false;
      await observer;
      observations.push(await tailsNow());
    }
  };

  await saveMediaProviderCredentials({ ...deps, repo: observingRepo }, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-new-key-3333") }, grok: { apiKey: "xai-new-4444" } },
  });
  assert.ok(observations.length > 1, "the observer must actually have run while the save was in flight");
  assert.equal(observations[0], BEFORE);
  assert.equal(observations.at(-1), AFTER);
  assert.equal(await tailsNow(), AFTER);
  for (const observed of observations) {
    assert.ok(
      observed === BEFORE || observed === AFTER,
      `a half-replaced map was observable mid-save: ${observed}`
    );
  }
});

test("the in-memory adapter stages its writes: a planner that throws leaves storage exactly as it was", async () => {
  // Rollback proof for the test double itself. Without staging, the upserts applied before the
  // failure would survive, and no test against this adapter could tell a real transaction from a
  // passthrough.
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-kept-1111") } },
  });

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

  assert.deepEqual(await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE }), {
    openai: { apiKeyConfigured: true, apiKeyTail: "1111", apiKeyHint: { length: 12, last4: "1111" } },
  });
});

// ---------------------------------------------------------------------------
// resolveMediaProviderCredential — the one decrypting reader, added 2026-09-02 for
// media-generation/tool-registrations.ts's media_generate_asset.
// ---------------------------------------------------------------------------

test("resolveMediaProviderCredential decrypts a saved key back to its exact original plaintext", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-real-secret-9999"), baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" } },
  });

  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });

  assert.deepEqual(resolved, { apiKey: ("s" + "k-real-secret-9999"), baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" });
});

test("resolveMediaProviderCredential returns null for a provider with no saved row at all", async () => {
  const { deps } = makeDeps();
  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.equal(resolved, null);
});

test("resolveMediaProviderCredential returns null (not an error) for a row saved with baseUrl/model but no key yet", async () => {
  const { deps } = makeDeps();
  // No `apiKey` field at all — a row that only ever set baseUrl/model, the documented "configured
  // with no key yet" state (`MediaProviderCredentialRecord.sealed`/`.keyTail` doc: "a row may
  // legitimately hold only baseUrl/model with no key yet").
  // Seed the legacy keyless row directly: new credential creates now require a key.
  await deps.repo.upsert({
    workspaceId: WORKSPACE, providerId: "openai", baseUrl: "https://api.openai.com/v1", model: null,
    sealed: null, keyTail: null, aadVersion: 0, createdAt: clock.nowIso(), updatedAt: clock.nowIso(),
  });
  assert.deepEqual(await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE }), {
    openai: { baseUrl: "https://api.openai.com/v1" },
  });

  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.equal(resolved, null, "no sealed key means nothing to decrypt — this must not throw or fabricate a key");
});

test("resolveMediaProviderCredential fails closed with MediaProviderCredentialSecretStoreUnconfiguredError when the site key is unavailable at decrypt time", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const workingKeyring = new InMemoryKeyring();
  const workingSealer = new AesGcmSecretSealer(workingKeyring);
  await saveMediaProviderCredentials(
    { repo, keyring: workingKeyring, sealer: workingSealer, clock },
    { workspaceId: WORKSPACE, providers: { openai: { apiKey: ("s" + "k-will-fail-to-open") } } }
  );

  // Same row, but resolved through a sealer backed by a broken keyring — mirrors this suite's own
  // "a missing site key fails closed" fixture for the write path, applied to the read path.
  const brokenSealer = new AesGcmSecretSealer(new BrokenKeyring());
  await assert.rejects(
    () => resolveMediaProviderCredential({ repo, sealer: brokenSealer }, { workspaceId: WORKSPACE, providerId: "openai" }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialSecretStoreUnconfiguredError);
      assert.equal((err as Error).message, "The credential could not be saved or unlocked. Check the site credential store.");
      assert.equal((err as Error).message.includes(("s" + "k-will-fail-to-open")), false, "the plaintext key must never appear in an error message");
      return true;
    }
  );
});

test("resolveMediaProviderCredential never includes the plaintext key anywhere in a JSON-serialized result other than the intended apiKey field", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-visible-only-once-2222") } },
  });
  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.ok(resolved);
  const occurrences = JSON.stringify(resolved).split(("s" + "k-visible-only-once-2222")).length - 1;
  assert.equal(occurrences, 1, "the key must appear exactly once — in apiKey, nowhere duplicated");
});

// ---------------------------------------------------------------------------
// Vault AAD binds workspace and identity. Legacy opening belongs to boot normalization/recovery.
// ---------------------------------------------------------------------------

test("a freshly saved key is sealed as JSON under vault AAD and retains its compatibility marker", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: ("s" + "k-aad-bound-1234") } },
  });

  const [row] = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(row?.aadVersion, 1);

  // Opening under the WRONG aad (the legacy no-aad shape) must fail closed — proof the seal really
  // bound an aad, not merely that the field was set.
  await assert.rejects(() => deps.sealer.open({ sealed: row!.sealed! }));
  const aad = buildVaultAad(row!.vaultRecord!);
  const opened = await deps.sealer.open({ sealed: row!.sealed! }, { aad });
  assert.deepEqual(JSON.parse(opened), { apiKey: ("s" + "k-aad-bound-1234") });
});

test("AAD binding: swapping one provider's ciphertext onto another provider's row fails closed (adversarial cross-row transplant)", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: {
      openai: { apiKey: ("s" + "k-openai-real-token") },
      grok: { apiKey: "xai-grok-real-token" },
    },
  });

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  const openaiRow = rows.find((row) => row.providerId === "openai")!;
  const grokRow = rows.find((row) => row.providerId === "grok")!;

  // Simulate an attacker (or a bad migration) with DB write access moving grok's ciphertext onto
  // the openai row — the AAD (bound to the row's OWN providerId) must reject this even though the
  // AES key is shared app-wide.
  await repo.upsert({ ...openaiRow, sealed: grokRow.sealed, keyTail: grokRow.keyTail });

  await assert.rejects(
    () => resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" }),
    MediaProviderCredentialSecretStoreUnconfiguredError
  );
});

test("AAD binding: the same provider's ciphertext cannot be transplanted to another workspace", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: ("s" + "k-workspace-bound-1234") } } });
  const [row] = await repo.listByWorkspaceId(WORKSPACE);
  await repo.upsert({ ...row!, workspaceId: "workspace-2" });
  await assert.rejects(
    () => resolveMediaProviderCredential(deps, { workspaceId: "workspace-2", providerId: "openai" }),
    MediaProviderCredentialSecretStoreUnconfiguredError,
  );
});

test("provider resolution uses one exact-provider read and one open, even without a default flag", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "selected-token-1234" }, grok: { apiKey: "decoy-token-5678" } } });
  // A migrated singleton can be non-default; direct SQL boot preserves that historical flag.
  const [selected] = await repo.vault.list({ workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null, provider: "openai" });
  await repo.vault.put({ record: { ...selected!, isDefault: false, revision: selected!.revision + 1 }, expectedRevision: selected!.revision });
  let reads = 0;
  let opens = 0;
  const list = repo.vault.list.bind(repo.vault);
  repo.vault.list = async input => {
    reads++;
    assert.equal(input.provider, "openai");
    return list(input);
  };
  repo.vault.find = async () => { throw new Error("unexpected second read"); };
  const open = deps.sealer.open.bind(deps.sealer);
  const resolved = await resolveMediaProviderCredential({ repo, sealer: {
    seal: deps.sealer.seal.bind(deps.sealer), open: (input, options) => { opens++; return open(input, options); },
  } }, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.equal(resolved?.apiKey, "selected-token-1234");
  assert.equal(reads, 1);
  assert.equal(opens, 1);
});

test("media metadata reads and blank-key saves retain hints without opening or sealing", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "safe-token-1234" } } });
  const [before] = await repo.listByWorkspaceId(WORKSPACE);
  const unavailable = { ...deps, sealer: {
    open: async (): Promise<never> => { throw new Error("must not open"); },
    seal: async (): Promise<never> => { throw new Error("must not seal"); },
  } };
  const saved = await saveMediaProviderCredentials(unavailable, { workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "", model: "edited" } } });
  assert.deepEqual(saved.openai?.apiKeyHint, { length: 15, last4: "1234" });
  assert.deepEqual((await getMediaProviderCredentials(unavailable, { workspaceId: WORKSPACE })).openai, saved.openai);
  const [after] = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(after?.sealed, before?.sealed);
  assert.equal(after?.createdAt, before?.createdAt);
});

test("a keyless singleton resolves with one read and zero opens", async () => {
  const { repo, deps } = makeDeps();
  await repo.upsert({ workspaceId: WORKSPACE, providerId: "openai", baseUrl: null, model: "edited",
    sealed: null, keyTail: null, aadVersion: 0, createdAt: clock.nowIso(), updatedAt: clock.nowIso() });
  let reads = 0;
  const list = repo.vault.list.bind(repo.vault);
  repo.vault.list = input => { reads++; return list(input); };
  deps.sealer.open = async () => { throw new Error("must not open a keyless row"); };
  assert.equal(await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" }), null);
  assert.equal(reads, 1);
});

test("short media keys never expose a suffix through saved hints", async () => {
  const { deps } = makeDeps();
  const saved = await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "short" } } });
  assert.deepEqual(saved.openai, { apiKeyConfigured: true, apiKeyHint: { length: 5, last4: null } });
});

// --- Branch pins: every validation, marker and sealing branch, asserted by exact outcome --------

/** Refusal matcher: the exact validation class AND its exact operator-facing message. */
function validation(message: string) {
  return (err: unknown) => err instanceof MediaProviderCredentialValidationError && err.message === message;
}

async function saveRejects(providers: Record<string, unknown>, message: string) {
  const { repo, deps } = makeDeps();
  await assert.rejects(saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE,
    providers: providers as Record<string, never> }), validation(message));
  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
}

const CREDENTIAL_IN_FIELD = "Put credentials in the secret field, not in this field.";

test("a provider id that itself looks like a credential is refused before the catalogue check", async () => {
  await saveRejects({ "Bearer abcdefghijklmnopqrstuvwxyz0123456789": {} }, CREDENTIAL_IN_FIELD);
});

test("an unknown provider id is refused with the engine-canonical hint", async () => {
  await saveRejects({ "xai-grok-imagine": {} },
    'unknown media provider "xai-grok-imagine" — expected an engine-canonical id from @jini-ai/integrations/media-providers');
});

test("a registry-held plugin vendor id is accepted; an alias it would resolve is still refused", async () => {
  // A fake registry: holds `acme-media` exactly, and resolves the alias `acme` to it (as aliases resolve).
  const providerCatalog = { findProvider: ({ id }: { id: string }) => (id === "acme-media" || id === "acme" ? { id: "acme-media" } : null) };
  const { repo, deps } = makeDeps();
  const saved = await saveMediaProviderCredentials({ ...deps, providerCatalog }, { workspaceId: WORKSPACE, providers: { "acme-media": { apiKey: "acme-key-123456" } } });
  assert.equal(saved["acme-media"]?.apiKeyConfigured, true);
  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map(row => row.providerId), ["acme-media"]);
  await assert.rejects(saveMediaProviderCredentials({ ...deps, providerCatalog }, { workspaceId: WORKSPACE, providers: { acme: {} } }),
    validation('unknown media provider "acme" — expected an engine-canonical id from @jini-ai/integrations/media-providers'));
});

test("a whole-map save that omits a plugin vendor keeps its key; omitted built-ins are still tombstoned", async () => {
  const providerCatalog = { findProvider: ({ id }: { id: string }) => (id === "acme-media" ? { id: "acme-media" } : null) };
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials({ ...deps, providerCatalog }, { workspaceId: WORKSPACE, providers: { "acme-media": { apiKey: "acme-key-123456" }, openai: { apiKey: "sk-openai-123456" } } });
  await saveMediaProviderCredentials({ ...deps, providerCatalog }, { workspaceId: WORKSPACE, providers: {} });
  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map(row => row.providerId), ["acme-media"]);
});

test("a whole-map save after the plugin vendor left the registry still keeps its stored key", async () => {
  // Disabled plugin, restart, or a loader fault: the registry no longer holds `acme-media`, yet the
  // admin tab's built-in-only save must not delete the key saved for it (no data loss).
  const providerCatalog = { findProvider: ({ id }: { id: string }) => (id === "acme-media" ? { id: "acme-media" } : null) };
  const emptyCatalog = { findProvider: () => null };
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials({ ...deps, providerCatalog }, { workspaceId: WORKSPACE, providers: { "acme-media": { apiKey: "acme-key-123456" }, openai: { apiKey: "sk-openai-123456" } } });
  await saveMediaProviderCredentials({ ...deps, providerCatalog: emptyCatalog }, { workspaceId: WORKSPACE, providers: { grok: { apiKey: "xai-grok-123456" } } });
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { grok: {} } });
  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map(row => row.providerId).sort(), ["acme-media", "grok"]);
});

test("a primitive provider entry is refused as not-an-object", async () => {
  await saveRejects({ openai: "str" }, 'provider "openai" must be an object');
});

for (const field of ["apiKey", "baseUrl", "model"] as const) {
  test(`a non-string ${field} is refused naming the field and provider`, async () => {
    await saveRejects({ openai: { [field]: 42 } }, `${field} for "openai" must be a string`);
  });
}

// Built at runtime so no credential-shaped literal is written in the source (keeps check:secret-scan clean).
const CREDENTIAL_SHAPED_FIELD_VALUE = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");

for (const field of ["baseUrl", "model"] as const) {
  test(`a ${field} carrying a credential is refused`, async () => {
    await saveRejects({ openai: { [field]: CREDENTIAL_SHAPED_FIELD_VALUE } }, CREDENTIAL_IN_FIELD);
  });

  test(`a ${field} over 2048 characters is refused with the limit`, async () => {
    await saveRejects({ openai: { apiKey: "k-1234", [field]: "x".repeat(2049) } }, `${field} for "openai" exceeds 2048 characters`);
  });

  test(`a ${field} of exactly 2048 characters is accepted`, async () => {
    const { deps } = makeDeps();
    const saved = await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "k-1234", [field]: "x".repeat(2048) } } });
    assert.equal(saved.openai?.[field]?.length, 2048);
  });
}

test("an apiKey is exempt from the field length bound and refused only by the token limit", async () => {
  await saveRejects({ openai: { apiKey: "x".repeat(CREDENTIAL_TOKEN_LIMIT + 1) } },
    "The token exceeds the 8192-character limit. Copy only the token.");
});

test("an apiKey with interior whitespace is refused by token normalization", async () => {
  await saveRejects({ openai: { apiKey: "has space inside" } }, "Hosted tokens must use visible ASCII characters (0x21–0x7E).");
});

test("a whitespace-only apiKey is refused as a validation error, not treated as absent", async () => {
  await saveRejects({ openai: { apiKey: "   " } }, "Enter a token. Spaces alone are not a token.");
});

test("a rotated key reuses the stored vault id and revision, keeping extra stored meta", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "first-token-1111" } } });
  const [before] = await repo.vault.list(mediaVaultScope({ workspaceId: WORKSPACE, providerId: "openai" }));
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "second-token-2222", model: " m2 " } } });
  const [after] = await repo.vault.list(mediaVaultScope({ workspaceId: WORKSPACE, providerId: "openai" }));
  assert.deepEqual([after?.id, after?.revision, after?.meta.model, after?.last4], [before?.id, before!.revision + 1, "m2", "2222"]);
  assert.deepEqual(await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" }),
    { apiKey: "second-token-2222", baseUrl: null, model: "m2" });
});

/** Typed read-only port serving fixed DTOs, for marker states the vault adapter cannot produce. */
function fixedRepo(records: MediaProviderCredentialRecord[]): MediaProviderCredentialRepoPort {
  return { listByWorkspaceId: async () => records, upsert: async () => {}, deleteByProviderIds: async () => {},
    replaceWorkspace: async () => [] };
}

function sealedDto(vaultRecord?: Partial<NonNullable<MediaProviderCredentialRecord["vaultRecord"]>>): MediaProviderCredentialRecord {
  const record: MediaProviderCredentialRecord = { workspaceId: WORKSPACE, providerId: "openai", baseUrl: null, model: null,
    sealed: { keyId: "k", ciphertext: "c", nonce: "n", alg: "a" }, keyTail: "", aadVersion: 1, createdAt: clock.nowIso(), updatedAt: clock.nowIso() };
  if (vaultRecord) Object.defineProperty(record, "vaultRecord", { value: { tokenLength: null, last4: null, ...vaultRecord } });
  return record;
}

test("a sealed DTO without private vault context reads as configured with no hint", async () => {
  assert.deepEqual(await getMediaProviderCredentials({ repo: fixedRepo([sealedDto()]) }, { workspaceId: WORKSPACE }),
    { openai: { apiKeyConfigured: true } });
});

test("a sealed row with an unknown token length reads as configured with no hint", async () => {
  assert.deepEqual(await getMediaProviderCredentials({ repo: fixedRepo([sealedDto({ tokenLength: null, last4: "wxyz" })]) }, { workspaceId: WORKSPACE }),
    { openai: { apiKeyConfigured: true } });
});

test("a long sealed token with no stored last4 reads its length but no tail", async () => {
  assert.deepEqual(await getMediaProviderCredentials({ repo: fixedRepo([sealedDto({ tokenLength: 20, last4: null })]) }, { workspaceId: WORKSPACE }),
    { openai: { apiKeyConfigured: true, apiKeyHint: { length: 20, last4: null } } });
});

test("a sealed token of exactly 12 characters exposes its tail", async () => {
  assert.deepEqual(await getMediaProviderCredentials({ repo: fixedRepo([sealedDto({ tokenLength: 12, last4: "wxyz" })]) }, { workspaceId: WORKSPACE }),
    { openai: { apiKeyConfigured: true, apiKeyHint: { length: 12, last4: "wxyz" }, apiKeyTail: "wxyz" } });
});

test("a sealed token of 11 characters withholds its tail", async () => {
  assert.deepEqual(await getMediaProviderCredentials({ repo: fixedRepo([sealedDto({ tokenLength: 11, last4: "wxyz" })]) }, { workspaceId: WORKSPACE }),
    { openai: { apiKeyConfigured: true, apiKeyHint: { length: 11, last4: null } } });
});

test("a legacy sealed row written without hints reads as configured with no hint", async () => {
  const { repo, deps } = makeDeps();
  await repo.upsert(sealedDto());
  assert.deepEqual(await getMediaProviderCredentials(deps, { workspaceId: WORKSPACE }), { openai: { apiKeyConfigured: true } });
});

test("an envelope whose payload apiKey is not a string fails closed with the safe storage message", async () => {
  const { repo, deps } = makeDeps();
  const vault = createTovuStoreVault({ ...deps, kind: "media-provider", storageError: () => new Error("unexpected storage error") });
  const scope = mediaVaultScope({ workspaceId: WORKSPACE, providerId: "openai" });
  await repo.vault.put({ record: await vault.prepare({ ...scope, id: "vault:odd", expectedRevision: null, provider: "openai", label: "openai",
    meta: { baseUrl: null, model: null }, payload: { apiKey: 5 } }), expectedRevision: null });
  await assert.rejects(resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" }),
    (err: unknown) => err instanceof MediaProviderCredentialSecretStoreUnconfiguredError && err.message === CREDENTIAL_MESSAGES.storage);
});
