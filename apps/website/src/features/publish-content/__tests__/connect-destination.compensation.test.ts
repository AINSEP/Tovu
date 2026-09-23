/**
 * @file Regression cover for sol's 2026-09-20 review, Medium finding 5 — "connect/disconnect split
 * required state across two unbound writes".
 *
 * Connecting writes an authorisation grant into committed deploy config AND a peer row into
 * SQLite; disconnecting removes both. The two live in different persistence systems, so no
 * transaction can span them — the answer is compensation, not a shared unit of work (unlike the
 * two-SQLite-writes case `features/trash`'s `TransactionRunner` solves).
 *
 * Before this file, neither half compensated. Connect wrote the grant and then saved the row: if
 * the row write failed, the request reported failure and the UI said "disconnected" while a
 * durable grant sat in the deploy config, ready to become live on the next deploy. Disconnect
 * reversed the grant and then deleted the row: if the delete failed, the UI kept saying
 * "connected" while the authorisation was already gone, so the next publish failed for no reason
 * the operator could see.
 *
 * What this file pins is not "the second write never fails" — it is that a failed second write
 * leaves the two systems agreeing with each other.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_PEER_AAD_VERSION } from "../peer-aad.js";
import { connectAndRecordDestination, disconnectAndForgetDestination } from "../connect-destination.js";
import { InMemoryPublishContentPeerRepo, type PublishContentPeerRecord, type PublishContentPeerRepoPort } from "../peers.js";

const WORKSPACE = "ws-1";
const SITE = "https://site-a.example";
const REMOTE_WORKSPACE = "remote-a";

/** Records which grant writes happened, in order, so a test can assert the grant was put back. */
class RecordingProvisioning {
  readonly calls: string[] = [];
  readonly target = { kind: "test", path: "deploy.json", nextStep: "Deploy this site once more." };

  async readProvisioned() {
    return { ok: true as const, grant: null, target: this.target };
  }

  async connect() {
    this.calls.push("connect");
    return { ok: true as const, changed: true, target: this.target };
  }

  async disconnect() {
    this.calls.push("disconnect");
    return { ok: true as const, changed: true, target: this.target };
  }
}

function connectedRow(): PublishContentPeerRecord {
  return {
    workspaceId: WORKSPACE,
    id: "peer-1",
    label: "site-a.example",
    baseUrl: SITE,
    remoteWorkspaceId: REMOTE_WORKSPACE,
    sealed: null,
    masked: null,
    aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
  };
}

/** A repo whose chosen write always fails, to drive the second half of each pair off the rails. */
function repoFailingOn(
  method: "insert" | "update" | "delete",
  message: string
): PublishContentPeerRepoPort & { readonly inner: InMemoryPublishContentPeerRepo } {
  const inner = new InMemoryPublishContentPeerRepo();
  return {
    inner,
    insert: async (record) => {
      if (method === "insert") throw new Error(message);
      return inner.insert(record);
    },
    update: async (record) => {
      if (method === "update") throw new Error(message);
      return inner.update(record);
    },
    findById: (input) => inner.findById(input),
    listByWorkspace: (input) => inner.listByWorkspace(input),
    delete: async (input) => {
      if (method === "delete") throw new Error(message);
      return inner.delete(input);
    },
  };
}

function connectDeps(repo: PublishContentPeerRepoPort, provisioning: RecordingProvisioning) {
  return {
    repo,
    clock: { nowIso: () => "2026-09-20T12:00:00.000Z" },
    idGen: { newId: () => "peer-1" },
    // The grant half is already written by the time the peer row is saved, so these tests inject
    // the completed handshake result rather than standing up a fake destination server.
    connectGrant: async () => ({
      identity: { workspaceId: REMOTE_WORKSPACE, generation: 1 },
      baseUrl: SITE,
      changed: true,
      target: provisioning.target,
      nextStep: "Deploy this site once more.",
    }),
    reverseGrant: async () => {
      provisioning.calls.push("disconnect");
      return { changed: true, target: provisioning.target };
    },
  };
}

test("a failed peer-row write during connect reverses the grant instead of leaving it armed", async () => {
  const provisioning = new RecordingProvisioning();
  const repo = repoFailingOn("insert", "sqlite: disk I/O error");

  await assert.rejects(
    () => connectAndRecordDestination(connectDeps(repo, provisioning), { workspaceId: WORKSPACE, baseUrl: SITE, entityTypes: ["post"] }),
    /sqlite: disk I\/O error/,
    "the original failure must reach the caller, not be swallowed by the compensation"
  );

  assert.deepEqual(
    provisioning.calls,
    ["disconnect"],
    "the grant written moments earlier must be reversed — a durable authorisation must not outlive a connect the operator was told failed"
  );
  assert.deepEqual(await repo.inner.listByWorkspace({ workspaceId: WORKSPACE }), []);
});

test("a failed grant reversal during disconnect puts the peer row back", async () => {
  const provisioning = new RecordingProvisioning();
  const inner = new InMemoryPublishContentPeerRepo();
  await inner.insert(connectedRow());

  const deps = {
    repo: inner,
    clock: { nowIso: () => "2026-09-20T12:00:00.000Z" },
    idGen: { newId: () => "peer-2" },
    reverseGrant: async (): Promise<never> => {
      throw new Error("This site's publishing settings could not be saved: config file is read-only");
    },
  };

  await assert.rejects(
    () => disconnectAndForgetDestination(deps, { workspaceId: WORKSPACE }),
    /config file is read-only/
  );

  const rows = await inner.listByWorkspace({ workspaceId: WORKSPACE });
  assert.deepEqual(
    rows.map((row) => row.baseUrl),
    [SITE],
    "the grant is still live, so the peer row must still say so — a disconnect that failed must not read as one that worked"
  );
});

test("a clean disconnect removes both halves", async () => {
  const provisioning = new RecordingProvisioning();
  const inner = new InMemoryPublishContentPeerRepo();
  await inner.insert(connectedRow());

  const result = await disconnectAndForgetDestination(
    {
      repo: inner,
      clock: { nowIso: () => "2026-09-20T12:00:00.000Z" },
      idGen: { newId: () => "peer-2" },
      reverseGrant: async () => {
        provisioning.calls.push("disconnect");
        return { changed: true, target: provisioning.target };
      },
    },
    { workspaceId: WORKSPACE }
  );

  assert.equal(result.site?.baseUrl, SITE);
  assert.equal(result.changed, true);
  assert.deepEqual(await inner.listByWorkspace({ workspaceId: WORKSPACE }), []);
  assert.deepEqual(provisioning.calls, ["disconnect"]);
});

test("a clean connect writes both halves and reports the saved row", async () => {
  const provisioning = new RecordingProvisioning();
  const inner = new InMemoryPublishContentPeerRepo();

  const result = await connectAndRecordDestination(connectDeps(inner, provisioning), {
    workspaceId: WORKSPACE,
    baseUrl: SITE,
    entityTypes: ["post"],
  });

  assert.equal(result.site.baseUrl, SITE);
  assert.equal(result.site.hasCredential, false);
  assert.deepEqual(provisioning.calls, [], "a successful connect must never reverse its own grant");
  const rows = await inner.listByWorkspace({ workspaceId: WORKSPACE });
  assert.deepEqual(rows.map((row) => row.baseUrl), [SITE]);
});
