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
  resolveMediaProviderCredential,
  saveMediaProviderCredentials,
} from "../provider-credential-store.js";

/**
 * @file `provider-credential-store.ts` — the whole-map-replace credential contract behind the
 * admin's Media → "Media providers" tab.
 *
 * The assertions that matter most: a key is never echoed back, an omitted provider is DELETED
 * rather than left alone (the tab expresses Clear as an omission), an entry with no `apiKey` keeps
 * the stored key so a `baseUrl`-only edit does not silently wipe it, UI-spelled provider ids are
 * REJECTED so the engine-canonical id is the only thing that can ever reach storage, and a missing
 * master secret fails closed before any row is written rather than persisting a partial map.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-08-09T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, deps: { repo, keyring, sealer, clock } };
}

/** A `KeyringPort` that always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without
 *  touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

test("save stores a key and returns markers only, never the key", async () => {
  const { deps } = makeDeps();

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-test-abcd1234", baseUrl: "https://api.openai.com/v1", model: "dall-e-3" } },
  });

  assert.deepEqual(saved, {
    openai: {
      baseUrl: "https://api.openai.com/v1",
      model: "dall-e-3",
      apiKeyConfigured: true,
      apiKeyTail: "1234",
    },
  });
  assert.equal(JSON.stringify(saved).includes("sk-test-abcd1234"), false);
});

test("the stored value round-trips through a fresh read", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { grok: { apiKey: "xai-key-wxyz", baseUrl: "https://api.x.ai/v1" } },
  });

  const read = await getMediaProviderCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });

  assert.deepEqual(read, {
    grok: { baseUrl: "https://api.x.ai/v1", apiKeyConfigured: true, apiKeyTail: "wxyz" },
  });
});

test("a provider omitted from the payload is DELETED, not left alone", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-one-1111" }, grok: { apiKey: "xai-two-2222" } },
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
    providers: { openai: { apiKey: "sk-keep-9999" } },
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

test("a blank apiKey is treated as absent, not as a clear", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-blank-7777" } },
  });

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "   " } },
  });

  assert.equal(saved.openai?.apiKeyConfigured, true);
  assert.equal(saved.openai?.apiKeyTail, "7777");
});

test("a provider with no key at all is stored without markers", async () => {
  const { deps } = makeDeps();

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { baseUrl: "https://proxy.example.com/v1" } },
  });

  assert.deepEqual(saved, { openai: { baseUrl: "https://proxy.example.com/v1" } });
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

/** A `KeyringPort` that rejects with a non-`Error` value — `sealNewProviderKeys`'s catch block has a
 *  ternary (`err instanceof Error ? err.message : String(err)`) whose `String(err)` half only a
 *  non-Error rejection reaches; `BrokenKeyring` above always throws a real `Error`. */
class NonErrorThrowingKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately non-Error, see class doc
    throw "boom: no key material available";
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

test("a non-Error rejection from the keyring is still stringified into the secret-store-unconfigured message", async () => {
  const { deps } = makeDeps();
  const broken = { ...deps, keyring: new NonErrorThrowingKeyring() };

  await assert.rejects(
    saveMediaProviderCredentials(broken, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-x-1234" } } }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialSecretStoreUnconfiguredError);
      assert.equal(
        (err as Error).message,
        "media provider credential secret store is unconfigured: boom: no key material available"
      );
      return true;
    }
  );
});

test("a missing master secret fails closed WITHOUT writing or deleting anything", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-intact-5555" }, grok: { apiKey: "xai-intact-6666" } },
  });

  const broken = { ...deps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    // Also drops `grok` — proving the abort happens before the tombstone pass, not midway through.
    saveMediaProviderCredentials(broken, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-new-0000" } } }),
    MediaProviderCredentialSecretStoreUnconfiguredError
  );

  const after = await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(after, {
    openai: { apiKeyConfigured: true, apiKeyTail: "5555" },
    grok: { apiKeyConfigured: true, apiKeyTail: "6666" },
  });
});

test("one workspace's providers are invisible to another", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-w1-1111" } },
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
    providers: { openai: { apiKey: "sk-gone-3333" } },
  });

  assert.deepEqual(await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: {} }), {});
  assert.deepEqual(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE }), {});
});

test("every read AND write of the whole-map replace happens strictly inside deps.repo.replaceWorkspace() — nothing runs before it opens", async () => {
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
      { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-new-5555" } } }
    ),
    /simulated transaction-open failure/
  );

  assert.deepEqual(
    calls,
    ["replaceWorkspace:refused"],
    "listByWorkspaceId/upsert/deleteByProviderIds must never run outside replaceWorkspace"
  );

  // And the pre-existing row is untouched, proving nothing leaked around the guarded replace.
  const after = await getMediaProviderCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(after, { grok: { apiKeyConfigured: true, apiKeyTail: "4444" } });
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

  open(input: Parameters<SecretSealerPort["open"]>[0]) {
    return this.inner.open(input);
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
    providers: { openai: { apiKey: "sk-alpha-1111" } },
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
    providers: { openai: { apiKey: "sk-beta-9999" } },
  });

  release();
  const written = await slowSave;

  assert.equal(written.openai?.apiKeyTail, "9999", "the rotation that committed mid-flight must survive");

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  const openai = rows.find((row) => row.providerId === "openai");
  assert.notEqual(openai?.sealed, null);
  assert.equal(
    await deps.sealer.open({ sealed: openai!.sealed! }),
    "sk-beta-9999",
    "the stored ciphertext must be the rotated key, not the one this save read before it started"
  );
  assert.deepEqual(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE }), {
    openai: { model: "dall-e-3", apiKeyConfigured: true, apiKeyTail: "9999" },
    grok: { apiKeyConfigured: true, apiKeyTail: "3333" },
  });
});

test("a reader polling throughout a save never observes a half-replaced map", async () => {
  // Codex's reproduction of the same defect from the other side: the old transaction body awaited
  // between each upsert and the tombstone delete, so a continuation queued on the shared connection
  // could observe `[a:new, b:old]` — a map that was never a valid state of this workspace.
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-old-1111" }, grok: { apiKey: "xai-old-2222" } },
  });

  const tailsNow = async (): Promise<string> => {
    const map = await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE });
    return Object.keys(map)
      .sort()
      .map((id) => `${id}:${map[id]?.apiKeyTail}`)
      .join(",");
  };
  const BEFORE = "grok:2222,openai:1111";
  const AFTER = "grok:4444,openai:3333";

  let saving = true;
  const observations: string[] = [];
  const observer = (async () => {
    for (let turn = 0; turn < 5000 && saving; turn += 1) {
      observations.push(await tailsNow());
      await Promise.resolve();
    }
  })();

  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-new-3333" }, grok: { apiKey: "xai-new-4444" } },
  });
  saving = false;
  await observer;

  assert.ok(observations.length > 1, "the observer must actually have run while the save was in flight");
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
    providers: { openai: { apiKey: "sk-kept-1111" } },
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

  assert.deepEqual(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE }), {
    openai: { apiKeyConfigured: true, apiKeyTail: "1111" },
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
    providers: { openai: { apiKey: "sk-real-secret-9999", baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" } },
  });

  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });

  assert.deepEqual(resolved, { apiKey: "sk-real-secret-9999", baseUrl: "https://api.openai.com/v1", model: "gpt-image-2" });
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
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { baseUrl: "https://api.openai.com/v1" } },
  });

  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.equal(resolved, null, "no sealed key means nothing to decrypt — this must not throw or fabricate a key");
});

test("resolveMediaProviderCredential fails closed with MediaProviderCredentialSecretStoreUnconfiguredError when the master secret is unavailable at decrypt time", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const workingKeyring = new InMemoryKeyring();
  const workingSealer = new AesGcmSecretSealer(workingKeyring);
  await saveMediaProviderCredentials(
    { repo, keyring: workingKeyring, sealer: workingSealer, clock },
    { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-will-fail-to-open" } } }
  );

  // Same row, but resolved through a sealer backed by a broken keyring — mirrors this suite's own
  // "a missing master secret fails closed" fixture for the write path, applied to the read path.
  const brokenSealer = new AesGcmSecretSealer(new BrokenKeyring());
  await assert.rejects(
    () => resolveMediaProviderCredential({ repo, sealer: brokenSealer }, { workspaceId: WORKSPACE, providerId: "openai" }),
    (err: unknown) => {
      assert.ok(err instanceof MediaProviderCredentialSecretStoreUnconfiguredError);
      assert.match((err as Error).message, /openai/);
      assert.equal((err as Error).message.includes("sk-will-fail-to-open"), false, "the plaintext key must never appear in an error message");
      return true;
    }
  );
});

test("resolveMediaProviderCredential never includes the plaintext key anywhere in a JSON-serialized result other than the intended apiKey field", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-visible-only-once-2222" } },
  });
  const resolved = await resolveMediaProviderCredential(deps, { workspaceId: WORKSPACE, providerId: "openai" });
  assert.ok(resolved);
  const occurrences = JSON.stringify(resolved).split("sk-visible-only-once-2222").length - 1;
  assert.equal(occurrences, 1, "the key must appear exactly once — in apiKey, nowhere duplicated");
});
