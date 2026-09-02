import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import type { KeyringPort } from "../../features/webhooks/index.js";
import { InMemorySiteAssistantCredentialRepo } from "../site-credential-store.memory.js";
import {
  SiteAssistantCredentialValidationError,
  SiteAssistantSecretStoreUnconfiguredError,
  deleteSiteAssistantCredential,
  getSiteAssistantCredential,
  resolveSiteAssistantApiKey,
  setSiteAssistantCredential,
} from "../site-credential-store.js";
import { buildSiteAssistantCredentialAad } from "../site-credential-aad.js";

/**
 * @file `site-credential-store.ts` — ADR-058's write-only credential contract and the runtime
 * consumer's never-throws read path.
 *
 * The assertions that matter most: `apiKey` is never echoed back by GET or by the view SET/DELETE
 * return, an omitted `apiKey` on SET never touches the sealer, a missing master secret fails closed
 * with a distinct error rather than a plaintext write, and `resolveSiteAssistantApiKey` truly never
 * throws — every failure mode it can hit resolves to `null` instead.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-08-04T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemorySiteAssistantCredentialRepo();
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
// getSiteAssistantCredential
// ---------------------------------------------------------------------------

test("a workspace nobody has configured reads as not-set, with sensible defaults", async () => {
  const { deps } = makeDeps();
  const view = await getSiteAssistantCredential(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(view, { isSet: false, masked: null, provider: "google", baseUrl: null, model: null, updatedAt: null });
});

// ---------------------------------------------------------------------------
// setSiteAssistantCredential
// ---------------------------------------------------------------------------

test("setting an apiKey seals it, masks it, and never returns the plaintext", async () => {
  const { deps, repo } = makeDeps();
  const view = await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "AIzaSyABCDEFGHIJKLMNOPqrst9999" });

  assert.equal(view.isSet, true);
  assert.equal(view.masked, "••••9999");
  assert.ok(!("apiKey" in view));
  assert.ok(!JSON.stringify(view).includes("AIzaSy"));

  // And the stored row genuinely holds ciphertext, not the plaintext, at the repo layer too.
  const stored = await repo.findByWorkspaceId(WORKSPACE);
  assert.ok(stored?.sealed);
  assert.notEqual(stored?.sealed?.ciphertext, "AIzaSyABCDEFGHIJKLMNOPqrst9999");
});

test("an empty apiKey is rejected — DELETE clears a key, PUT does not accept blank", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "   " }),
    SiteAssistantCredentialValidationError
  );
});

test("a non-string provider/baseUrl/model is rejected before any write", async () => {
  const { deps, repo } = makeDeps();
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, provider: 12345 as unknown as string }),
    SiteAssistantCredentialValidationError
  );
  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

test("a non-string baseUrl or model is also rejected before any write — not just provider", async () => {
  const { deps, repo } = makeDeps();
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, baseUrl: 12345 as unknown as string }),
    SiteAssistantCredentialValidationError
  );
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, model: { not: "a string" } as unknown as string }),
    SiteAssistantCredentialValidationError
  );
  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

test("setting nothing at all on a never-before-configured workspace seeds an empty row with defaults, touching neither sealer nor keyring", async () => {
  const { deps } = makeDeps();
  const view = await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE });

  assert.equal(view.isSet, false);
  assert.equal(view.masked, null);
  assert.equal(view.provider, "google");
  assert.equal(view.baseUrl, null);
  assert.equal(view.model, null);
});

test("omitting apiKey leaves the previously-stored key untouched — only provider/baseUrl/model change", async () => {
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "first-key-0000" });
  const afterFirst = await getSiteAssistantCredential(deps, { workspaceId: WORKSPACE });

  const afterSecond = await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, model: "gemini-flash-latest" });

  assert.equal(afterSecond.isSet, true);
  assert.equal(afterSecond.masked, afterFirst.masked);
  assert.equal(afterSecond.model, "gemini-flash-latest");

  // The runtime path still resolves the ORIGINAL key — proves the sealed blob itself was untouched,
  // not just that `masked` happens to match.
  const resolved = await resolveSiteAssistantApiKey({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved?.apiKey, "first-key-0000");
});

test("a rotation (second apiKey) fully replaces the first — the old key no longer resolves", async () => {
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "old-key-1111" });
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "new-key-2222" });

  const resolved = await resolveSiteAssistantApiKey({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved?.apiKey, "new-key-2222");
});

test("a missing master secret fails CLOSED with a distinct error, and writes nothing", async () => {
  const { repo, sealer } = makeDeps();
  const brokenKeyring = new BrokenKeyring();
  const brokenSealer = new AesGcmSecretSealer(brokenKeyring); // sealer over the broken keyring
  void sealer; // unused — deliberately shadowed by the broken one below

  await assert.rejects(
    () =>
      setSiteAssistantCredential(
        { repo, sealer: brokenSealer, keyring: brokenKeyring, clock },
        { workspaceId: WORKSPACE, apiKey: "would-be-a-real-key" }
      ),
    SiteAssistantSecretStoreUnconfiguredError
  );

  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

// ---------------------------------------------------------------------------
// deleteSiteAssistantCredential
// ---------------------------------------------------------------------------

test("delete clears only the key — provider/baseUrl/model survive", async () => {
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, {
    workspaceId: WORKSPACE,
    apiKey: "to-be-deleted",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash-latest",
  });

  const view = await deleteSiteAssistantCredential(deps, { workspaceId: WORKSPACE });

  assert.equal(view.isSet, false);
  assert.equal(view.masked, null);
  assert.equal(view.provider, "google");
  assert.equal(view.baseUrl, "https://generativelanguage.googleapis.com");
  assert.equal(view.model, "gemini-flash-latest");
});

test("deleting an already-unset key is a harmless no-op, not an error", async () => {
  const { deps } = makeDeps();
  const view = await deleteSiteAssistantCredential(deps, { workspaceId: WORKSPACE });
  assert.equal(view.isSet, false);
});

// ---------------------------------------------------------------------------
// resolveSiteAssistantApiKey — must never throw
// ---------------------------------------------------------------------------

test("resolveSiteAssistantApiKey returns null (not a throw) when the repo read itself fails", async () => {
  const { sealer } = makeDeps();
  const brokenRepo = {
    findByWorkspaceId: async () => {
      throw new Error("connection reset");
    },
    upsert: async () => {},
    clearKey: async () => {},
  };
  let warned: unknown;
  const resolved = await resolveSiteAssistantApiKey({ repo: brokenRepo, sealer }, { workspaceId: WORKSPACE }, (err) => {
    warned = err;
  });

  assert.equal(resolved, null);
  assert.ok(warned instanceof Error && warned.message === "connection reset");
});

test("resolveSiteAssistantApiKey returns null when no row exists", async () => {
  const { repo, sealer } = makeDeps();
  const resolved = await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved, null);
});

test("resolveSiteAssistantApiKey returns null (not a throw) when the sealed row cannot be opened", async () => {
  const { deps, repo } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "some-key" });

  // A sealer over a DIFFERENT root key than the one that sealed the row — simulates a rotated or
  // reset master secret. `open()` must reject (wrong key -> auth tag mismatch), and the resolver
  // must swallow that into `null`, never propagate it to the caller.
  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  let warned = 0;
  const resolved = await resolveSiteAssistantApiKey(
    { repo, sealer: otherSealer },
    { workspaceId: WORKSPACE },
    () => {
      warned += 1;
    }
  );

  assert.equal(resolved, null);
  assert.equal(warned, 1);
});

test("resolveSiteAssistantApiKey's onDecryptFailure defaults to a silent no-op — a decrypt failure with no callback supplied still just resolves null", async () => {
  const { deps, repo } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "some-key" });

  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  const resolved = await resolveSiteAssistantApiKey({ repo, sealer: otherSealer }, { workspaceId: WORKSPACE });

  assert.equal(resolved, null, "the default no-op must still let the failure resolve to null rather than throwing");
});

test("resolveSiteAssistantApiKey returns the key, provider, baseUrl, and model together on success", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setSiteAssistantCredential(deps, {
    workspaceId: WORKSPACE,
    apiKey: "resolvable-key",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash-latest",
  });

  const resolved = await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WORKSPACE });
  assert.deepEqual(resolved, {
    apiKey: "resolvable-key",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash-latest",
  });
});

// ---------------------------------------------------------------------------
// AAD (2026-09-02 gap closure) — `site_assistant_credentials` used to seal with no additional
// authenticated data at all, so a ciphertext was transplantable between workspace rows. New writes
// must bind `workspaceId` into the seal; existing (`aad_version = 0`) rows must keep opening exactly
// as before so no live visitor-assistant key goes dark mid-migration.
// ---------------------------------------------------------------------------

test("a freshly saved key is sealed with AAD bound to workspaceId and the row is marked aadVersion 1", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "aad-bound-key-1234" });

  const row = await repo.findByWorkspaceId(WORKSPACE);
  assert.equal(row?.aadVersion, 1);

  // Opening under the WRONG aad (the legacy no-aad shape) must fail closed.
  await assert.rejects(() => sealer.open({ sealed: row!.sealed! }));
  const opened = await sealer.open({ sealed: row!.sealed!, aad: buildSiteAssistantCredentialAad({ workspaceId: WORKSPACE }) });
  assert.equal(opened, "aad-bound-key-1234");
});

test("a legacy row sealed with NO aad (aadVersion 0) still resolves to its exact plaintext — existing credentials are never bricked", async () => {
  const { deps, repo, sealer, keyring } = makeDeps();
  const legacySealed = await sealer.seal({ plaintext: "legacy-no-aad-5678", key: await keyring.activeKey() });
  await repo.upsert({
    workspaceId: WORKSPACE,
    provider: "google",
    baseUrl: null,
    model: null,
    sealed: legacySealed,
    masked: "••••5678",
    aadVersion: 0,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  const resolved = await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WORKSPACE });
  assert.deepEqual(resolved, { apiKey: "legacy-no-aad-5678", provider: "google", baseUrl: null, model: null });
});

test("a metadata-only edit over a legacy (aadVersion 0) row leaves the ciphertext AND its aadVersion untouched", async () => {
  // `setSiteAssistantCredential` with no `apiKey` must carry the existing sealed value forward
  // byte-for-byte, not merely resolve to the right plaintext — carrying the wrong `aadVersion`
  // alongside an UNCHANGED ciphertext would make the row unopenable (the ciphertext still has no
  // aad baked into its auth tag, but the row would now claim it does).
  const { deps, repo, sealer, keyring } = makeDeps();
  const legacySealed = await sealer.seal({ plaintext: "legacy-untouched-1111", key: await keyring.activeKey() });
  await repo.upsert({
    workspaceId: WORKSPACE,
    provider: "google",
    baseUrl: null,
    model: null,
    sealed: legacySealed,
    masked: "••••1111",
    aadVersion: 0,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  });

  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, model: "gemini-flash-latest" });

  const row = await repo.findByWorkspaceId(WORKSPACE);
  assert.equal(row?.aadVersion, 0, "aadVersion must still say legacy — the ciphertext itself was never re-sealed");
  const resolved = await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved?.apiKey, "legacy-untouched-1111", "the carried-forward ciphertext must still open correctly");
});

test("AAD binding: swapping the sealed key onto a DIFFERENT workspace's row fails closed (adversarial cross-workspace transplant)", async () => {
  const { deps, repo } = makeDeps();
  const OTHER_WORKSPACE = "workspace-2";
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "workspace-one-key" });
  await setSiteAssistantCredential(deps, { workspaceId: OTHER_WORKSPACE, apiKey: "workspace-two-key" });

  const rowOne = await repo.findByWorkspaceId(WORKSPACE);
  const rowTwo = await repo.findByWorkspaceId(OTHER_WORKSPACE);

  // Simulate an attacker (or a bad migration) with DB write access moving workspace two's
  // ciphertext onto workspace one's row — the AAD (bound to the row's OWN workspaceId) must reject
  // this even though the AES key is shared app-wide.
  await repo.upsert({ ...rowOne!, sealed: rowTwo!.sealed, masked: rowTwo!.masked });

  const resolved = await resolveSiteAssistantApiKey(deps, { workspaceId: WORKSPACE });
  assert.equal(resolved, null, "resolveSiteAssistantApiKey never throws — a transplanted ciphertext must resolve to null, not the wrong plaintext");
});
