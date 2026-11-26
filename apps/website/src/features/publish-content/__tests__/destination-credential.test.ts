import assert from "node:assert/strict";
import test from "node:test";

import { PublishTrustHandshakeError } from "@jini-ai/cms/publish/trust/handshake-error";
import type { openPublishSession, PublishSession } from "@jini-ai/cms/publish/trust/handshake-client";
import { resolvePublishDestinationCredential, type PublishDestinationCredentialDeps } from "../destination-credential.js";
import { PublishContentPeerNotFoundError, PublishContentPeerSecretStoreUnconfiguredError } from "@jini-ai/cms/publish/content/peers";
import { createPublishContentPeer, type PublishContentPeerRecord } from "@jini-ai/cms/publish/content/peer-registry";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "../../webhooks/keyring.env.js";
import { InMemoryPublishContentPeerRepo } from "../peers.js";

/** @file The connected-destination branch of `resolvePublishDestinationCredential` with the
 *  handshake replaced by a recording session opener (the real three-call handshake is proven
 *  end to end in `server/__tests__/routes/publish-zero-setup-end-to-end.test.ts`). */

const WS = "source-ws";

function connectedRecord(over: Partial<PublishContentPeerRecord> = {}): PublishContentPeerRecord {
  return {
    workspaceId: WS, id: "dest-1", label: "destination.test", baseUrl: "https://destination.test", remoteWorkspaceId: "dest-ws",
    sealed: null, masked: null, aadVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...over,
  };
}

function depsWith(record: PublishContentPeerRecord | null): PublishDestinationCredentialDeps {
  const repo = new InMemoryPublishContentPeerRepo();
  if (record) repo.findById = async ({ workspaceId, id }) =>
    workspaceId === record.workspaceId && id === record.id ? record : null;
  const keyring = new InMemoryKeyring();
  return { repo, sealer: new AesGcmSecretSealer({ keyring }), keyring, httpClient: { send: async () => assert.fail("no live HTTP request expected") } };
}

function sessionAnswering(workspaceId: string, calls: unknown[]) {
  return async ({ input }: Parameters<typeof openPublishSession>[0]): Promise<PublishSession> => {
    calls.push(input);
    return { token: "session-token", expiresAt: "2026-10-01T01:00:00.000Z", capabilities: [], identity: { installationId: "inst", workspaceId, origin: "https://destination.test" } };
  };
}

test("an unknown destination id is refused as not found before any handshake", async () => {
  const calls: unknown[] = [];
  await assert.rejects(
    resolvePublishDestinationCredential({ deps: depsWith(null), input: { workspaceId: WS, id: "nope" } }, { openSession: sessionAnswering("dest-ws", calls) }),
    (error: unknown) => error instanceof PublishContentPeerNotFoundError && error.message === "peer 'nope' was not found",
  );
  assert.deepEqual(calls, []);
});

test("a connected destination resolves to a session token, and a backstop request asks the handshake for backstop scope", async () => {
  const calls: unknown[] = [];
  const credential = await resolvePublishDestinationCredential({ deps: depsWith(connectedRecord()), input: { workspaceId: WS, id: "dest-1", backstop: true } }, { openSession: sessionAnswering("dest-ws", calls) });
  assert.deepEqual(credential, { id: "dest-1", label: "destination.test", baseUrl: "https://destination.test", remoteWorkspaceId: "dest-ws", apiKey: "session-token" });
  await resolvePublishDestinationCredential({ deps: depsWith(connectedRecord()), input: { workspaceId: WS, id: "dest-1" } }, { openSession: sessionAnswering("dest-ws", calls) });
  assert.deepEqual(calls, [
    { baseUrl: "https://destination.test", workspaceId: WS, backstop: true },
    { baseUrl: "https://destination.test", workspaceId: WS },
  ]);
});

test("a destination now answering for a different workspace is refused — publishing there would be a misdelivery", async () => {
  await assert.rejects(
    resolvePublishDestinationCredential({ deps: depsWith(connectedRecord()), input: { workspaceId: WS, id: "dest-1" } }, { openSession: sessionAnswering("rebuilt-ws", []) }),
    (error: unknown) => error instanceof PublishTrustHandshakeError && error.failure === "refused"
      && error.message === "destination.test is not the site this computer was connected to. Connect it again to confirm.",
  );
});

test("a row with a sealed key takes the explicit-peer path: no handshake, and an unopenable key surfaces only the safe error", async () => {
  const calls: unknown[] = [];
  const deps = depsWith(null);
  const { id } = await createPublishContentPeer({
    deps: { ...deps, clock: { nowMs: () => 0 }, idGen: { newId: () => "dest-1" } },
    input: { workspaceId: WS, label: "destination.test", baseUrl: "https://destination.test", remoteWorkspaceId: "dest-ws", apiKey: "fixture-key" },
  });
  deps.sealer.open = async () => { throw new Error("private decrypt failure"); };
  await assert.rejects(
    resolvePublishDestinationCredential({ deps, input: { workspaceId: WS, id } }, { openSession: sessionAnswering("dest-ws", calls) }),
    (error: unknown) => error instanceof PublishContentPeerSecretStoreUnconfiguredError
      && error.message === "peer 'destination.test' credential could not be opened",
  );
  assert.deepEqual(calls, [], "a sealed peer must never open a connected-destination session");
});
