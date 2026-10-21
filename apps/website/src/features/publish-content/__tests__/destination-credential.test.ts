import assert from "node:assert/strict";
import test from "node:test";

import { PublishTrustHandshakeError, type PublishSession } from "#src/features/publish-trust/handshake-client";
import { resolvePublishDestinationCredential, type PublishDestinationCredentialDeps } from "../destination-credential.js";
import { PublishContentPeerNotFoundError, type PublishContentPeerRecord } from "../peers.js";

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
  const repo = { findById: async () => record } as unknown as PublishDestinationCredentialDeps["repo"];
  return { repo, sealer: {} as never, keyring: {} as never, httpClient: {} as never };
}

function sessionAnswering(workspaceId: string, calls: unknown[]) {
  return async (_deps: unknown, input: unknown): Promise<PublishSession> => {
    calls.push(input);
    return { token: "session-token", expiresAt: "2026-10-01T01:00:00.000Z", capabilities: [], identity: { installationId: "inst", workspaceId, origin: "https://destination.test" } };
  };
}

test("an unknown destination id is refused as not found before any handshake", async () => {
  const calls: unknown[] = [];
  await assert.rejects(
    resolvePublishDestinationCredential(depsWith(null), { workspaceId: WS, id: "nope" }, { openSession: sessionAnswering("dest-ws", calls) }),
    (error: unknown) => error instanceof PublishContentPeerNotFoundError && error.message === "peer 'nope' was not found",
  );
  assert.deepEqual(calls, []);
});

test("a connected destination resolves to a session token, and a backstop request asks the handshake for backstop scope", async () => {
  const calls: unknown[] = [];
  const credential = await resolvePublishDestinationCredential(depsWith(connectedRecord()), { workspaceId: WS, id: "dest-1", backstop: true }, { openSession: sessionAnswering("dest-ws", calls) });
  assert.deepEqual(credential, { id: "dest-1", label: "destination.test", baseUrl: "https://destination.test", remoteWorkspaceId: "dest-ws", apiKey: "session-token" });
  await resolvePublishDestinationCredential(depsWith(connectedRecord()), { workspaceId: WS, id: "dest-1" }, { openSession: sessionAnswering("dest-ws", calls) });
  assert.deepEqual(calls, [
    { baseUrl: "https://destination.test", workspaceId: WS, backstop: true },
    { baseUrl: "https://destination.test", workspaceId: WS },
  ]);
});

test("a destination now answering for a different workspace is refused — publishing there would be a misdelivery", async () => {
  await assert.rejects(
    resolvePublishDestinationCredential(depsWith(connectedRecord()), { workspaceId: WS, id: "dest-1" }, { openSession: sessionAnswering("rebuilt-ws", []) }),
    (error: unknown) => error instanceof PublishTrustHandshakeError && error.failure === "refused"
      && error.message === "destination.test is not the site this computer was connected to. Connect it again to confirm.",
  );
});
