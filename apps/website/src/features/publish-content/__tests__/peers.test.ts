import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { buildPublishContentPeerAad, PUBLISH_CONTENT_PEER_AAD_VERSION } from "../peer-aad.js";
import {
  createPublishContentPeer,
  deletePublishContentPeer,
  getPublishContentPeerSummary,
  InMemoryPublishContentPeerRepo,
  listPublishContentPeers,
  maskApiKey,
  PublishContentPeerCredentialMissingError,
  PublishContentPeerDuplicateLabelError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
  PublishContentPeerValidationError,
  resolvePeerCredential,
  toPeerSummary,
  updatePublishContentPeer,
  type PublishContentPeerWriteDeps,
} from "../peers.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * Certifies the FROZEN CONTRACT this task's dispatch names: `masked` and `hasCredential` are the
 * only credential-shaped fields that ever leave the server, and the raw key never appears in any
 * summary, error message or serialized report.
 *
 * Uses the REAL `AesGcmSecretSealer` over an `InMemoryKeyring`, never a fake sealer — a fake would
 * make the AAD-binding test vacuous (it would "pass" against an implementation that ignored the
 * AAD entirely).
 */

const WORKSPACE = "ws-1";
const API_KEY = "tovu_live_0123456789abcdef";

function writeDeps(overrides: { ids?: string[]; now?: string } = {}): PublishContentPeerWriteDeps & {
  repo: InMemoryPublishContentPeerRepo;
} {
  const ids = overrides.ids ?? ["peer-1", "peer-2", "peer-3"];
  let cursor = 0;
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryPublishContentPeerRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => overrides.now ?? "2026-09-18T00:00:00.000Z" },
    idGen: { newId: () => ids[cursor++] ?? `peer-${cursor}` },
  };
}

async function createDefaultPeer(deps: PublishContentPeerWriteDeps) {
  return createPublishContentPeer(deps, {
    workspaceId: WORKSPACE,
    label: "production",
    baseUrl: "https://tovu.example.com",
    remoteWorkspaceId: "remote-ws-9",
    apiKey: API_KEY,
  });
}

test("a created peer's summary carries masked + hasCredential and NOTHING sealed", async () => {
  const deps = writeDeps();
  const summary = await createDefaultPeer(deps);

  assert.deepEqual(summary, {
    id: "peer-1",
    label: "production",
    baseUrl: "https://tovu.example.com",
    remoteWorkspaceId: "remote-ws-9",
    masked: "••••cdef",
    hasCredential: true,
  });

  // The whole-object assertion above already proves no extra key exists, but state the security
  // property directly too: serialize the read model and confirm the key, and every sealed field
  // name, is absent from the bytes a client would receive.
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes(API_KEY), false, "raw api key leaked into the summary");
  for (const field of ["sealedCiphertext", "sealedNonce", "sealedKeyId", "sealedAlg", "ciphertext", "nonce", "keyId"]) {
    assert.equal(serialized.includes(field), false, `${field} leaked into the summary`);
  }
});

test("the sealed key never appears in a list response, a get, or a stored record's summary", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);

  const listed = await listPublishContentPeers({ repo: deps.repo }, { workspaceId: WORKSPACE });
  const fetched = await getPublishContentPeerSummary({ repo: deps.repo }, { workspaceId: WORKSPACE, id: "peer-1" });

  // The stored record DOES hold the ciphertext — that is the point of the table. What must never
  // happen is that ciphertext reaching a read model.
  const stored = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.ok(stored?.sealed, "the row must actually be sealed, or this test proves nothing");
  const ciphertext = stored.sealed.ciphertext;

  for (const payload of [JSON.stringify(listed), JSON.stringify(fetched), JSON.stringify(toPeerSummary(stored))]) {
    assert.equal(payload.includes(API_KEY), false, "raw api key leaked");
    assert.equal(payload.includes(ciphertext), false, "sealed ciphertext leaked");
    assert.equal(payload.includes(stored.sealed.nonce), false, "sealed nonce leaked");
  }
});

test("maskApiKey reveals at most the last four characters, and nothing at all for a short key", () => {
  assert.equal(maskApiKey("tovu_live_0123456789abcdef"), "••••cdef");
  assert.equal(maskApiKey("shortkey"), "••••");
  assert.equal(maskApiKey(""), "••••");
});

test("resolvePeerCredential round-trips the key through the real sealer", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);

  const resolved = await resolvePeerCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, id: "peer-1" });
  assert.equal(resolved.apiKey, API_KEY);
  assert.equal(resolved.baseUrl, "https://tovu.example.com");
  assert.equal(resolved.remoteWorkspaceId, "remote-ws-9");
});

test("a ciphertext sealed for one peer cannot be opened as another peer's — the AAD binds the row id", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  await createPublishContentPeer(deps, {
    workspaceId: WORKSPACE,
    label: "staging",
    baseUrl: "https://staging.example.com",
    remoteWorkspaceId: "remote-ws-8",
    apiKey: API_KEY,
  });

  const first = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.ok(first?.sealed);
  // Present peer-1's ciphertext under peer-2's AAD: AEAD auth-tag verification must fail.
  await assert.rejects(
    () => deps.sealer.open({ sealed: first.sealed!, aad: buildPublishContentPeerAad({ workspaceId: WORKSPACE, id: "peer-2" }) }),
    (err: unknown) => err instanceof Error
  );
});

test("an unopenable ciphertext surfaces as the typed secret-store error, never a raw driver error", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  const stored = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.ok(stored);
  // Corrupt the ciphertext in place — the shape a rotated/lost root key produces.
  await deps.repo.update({ ...stored, sealed: { ...stored.sealed!, ciphertext: Buffer.from("garbage").toString("base64") } });

  await assert.rejects(
    () => resolvePeerCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, id: "peer-1" }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerSecretStoreUnconfiguredError);
      assert.match(err.message, /peer 'production' credential could not be opened/);
      assert.equal(err.message.includes(API_KEY), false, "the api key must never reach an error message");
      return true;
    }
  );
});

test("a create stamps the current AAD version so a future v2 is a row-by-row migration", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  const stored = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.equal(stored?.aadVersion, PUBLISH_CONTENT_PEER_AAD_VERSION);
});

test("create validates every operator-supplied field", async () => {
  const deps = writeDeps();
  const bad: Array<[Record<string, unknown>, RegExp]> = [
    [{ label: "" }, /'label' is required/],
    [{ baseUrl: "http://tovu.example.com" }, /its scheme must be https/],
    [{ remoteWorkspaceId: "  " }, /'remoteWorkspaceId' is required/],
    [{ apiKey: undefined }, /'apiKey' is required/],
  ];
  for (const [override, expected] of bad) {
    await assert.rejects(
      () =>
        createPublishContentPeer(deps, {
          workspaceId: WORKSPACE,
          label: "production",
          baseUrl: "https://tovu.example.com",
          remoteWorkspaceId: "remote-ws-9",
          apiKey: API_KEY,
          ...override,
        }),
      (err: unknown) => err instanceof PublishContentPeerValidationError && expected.test(err.message)
    );
  }
});

test("a duplicate label is a typed conflict, not a raw UNIQUE-constraint driver error", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  await assert.rejects(
    () =>
      createPublishContentPeer(deps, {
        workspaceId: WORKSPACE,
        label: "production",
        baseUrl: "https://other.example.com",
        remoteWorkspaceId: "remote-ws-7",
        apiKey: API_KEY,
      }),
    (err: unknown) =>
      err instanceof PublishContentPeerDuplicateLabelError && /a peer labelled 'production' already exists/.test(err.message)
  );
});

test("update leaves an absent field alone and reseals only a supplied apiKey", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });

  const renamed = await updatePublishContentPeer(deps, { workspaceId: WORKSPACE, id: "peer-1", label: "prod-eu" });
  assert.equal(renamed.label, "prod-eu");
  assert.equal(renamed.baseUrl, "https://tovu.example.com");
  assert.equal(renamed.masked, "••••cdef");
  const afterRename = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.deepEqual(afterRename?.sealed, before?.sealed, "a rename must not reseal the credential");

  const rotated = await updatePublishContentPeer(deps, { workspaceId: WORKSPACE, id: "peer-1", apiKey: "tovu_live_zzzzzzzzzz9999" });
  assert.equal(rotated.masked, "••••9999");
  const afterRotate = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.notDeepEqual(afterRotate?.sealed, before?.sealed, "a rotation must produce a fresh ciphertext");
  const reopened = await resolvePeerCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, id: "peer-1" });
  assert.equal(reopened.apiKey, "tovu_live_zzzzzzzzzz9999");
});

test("update and resolve refuse an unknown peer; delete is idempotent", async () => {
  const deps = writeDeps();
  await assert.rejects(
    () => updatePublishContentPeer(deps, { workspaceId: WORKSPACE, id: "nope", label: "x" }),
    (err: unknown) => err instanceof PublishContentPeerNotFoundError
  );
  await assert.rejects(
    () => resolvePeerCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, id: "nope" }),
    (err: unknown) => err instanceof PublishContentPeerNotFoundError
  );
  await deletePublishContentPeer({ repo: deps.repo }, { workspaceId: WORKSPACE, id: "nope" });
});

test("a peer row with no sealed credential refuses at resolve rather than pushing unauthenticated", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  const stored = await deps.repo.findById({ workspaceId: WORKSPACE, id: "peer-1" });
  assert.ok(stored);
  await deps.repo.update({ ...stored, sealed: null, masked: null });

  assert.deepEqual(toPeerSummary({ ...stored, sealed: null, masked: null }).hasCredential, false);
  await assert.rejects(
    () => resolvePeerCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, id: "peer-1" }),
    (err: unknown) => err instanceof PublishContentPeerCredentialMissingError
  );
});

test("a failing keyring fails CLOSED — the row is never written in plaintext", async () => {
  const deps = {
    ...writeDeps(),
    keyring: {
      activeKey: async () => {
        throw new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set");
      },
    } as unknown as PublishContentPeerWriteDeps["keyring"],
  };

  await assert.rejects(
    () => createDefaultPeer(deps),
    (err: unknown) => err instanceof PublishContentPeerSecretStoreUnconfiguredError
  );
  assert.deepEqual(await listPublishContentPeers({ repo: deps.repo }, { workspaceId: WORKSPACE }), []);
});

test("peers are workspace-scoped — another workspace's rows are never listed", async () => {
  const deps = writeDeps();
  await createDefaultPeer(deps);
  await createPublishContentPeer(deps, {
    workspaceId: "ws-2",
    label: "production",
    baseUrl: "https://other.example.com",
    remoteWorkspaceId: "remote-ws-2",
    apiKey: API_KEY,
  });

  const ours = await listPublishContentPeers({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(ours.map((p) => p.id), ["peer-1"]);
});
