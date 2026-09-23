/**
 * @file Regression cover for sol's 2026-09-20 review, High finding 4 — "multiple 'connected'
 * destinations cause silent first-row publication".
 *
 * `saveConnectedDestination` keyed its replace on `baseUrl`, so connecting this computer to a
 * SECOND site inserted a second `sealed: null` row instead of moving the connection. Every reader
 * then took `rows.find((row) => row.sealed === null)` — the first row in repository order — and
 * none of them disclosed that there was more than one. The operator saw "connected", and Publish
 * went wherever the repository happened to list first.
 *
 * The grant layer cannot represent two connections in the first place: `publish-trust/connect.ts`
 * writes the grant through `provisioning.connect`, which "merges by source installation id, so
 * running it twice REPLACES this computer's own entry", and `disconnectDestination` takes no
 * address because there is only ever one entry to remove. A second `sealed: null` peer row is
 * therefore not a second connection — it is a row describing an authorisation that no longer
 * exists. This file pins the peer table to the same one-connection model.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_PEER_AAD_VERSION } from "../peer-aad.js";
import {
  InMemoryPublishContentPeerRepo,
  saveConnectedDestination,
  selectConnectedDestination,
  type PublishContentPeerRecord,
} from "../peers.js";

const WORKSPACE = "ws-1";
const SITE_A = "https://site-a.example";
const SITE_B = "https://site-b.example";

function fixedClock(iso: string): { nowIso(): string } {
  return { nowIso: () => iso };
}

function sequentialIdGen(): { newId(): string } {
  let n = 0;
  return { newId: () => `peer-${++n}` };
}

test("connecting this computer to a second site MOVES the connection — it never leaves two connected rows", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  const idGen = sequentialIdGen();

  await saveConnectedDestination(
    { repo, clock: fixedClock("2026-09-20T10:00:00.000Z"), idGen },
    { workspaceId: WORKSPACE, label: "site-a.example", baseUrl: SITE_A, remoteWorkspaceId: "remote-a" }
  );
  await saveConnectedDestination(
    { repo, clock: fixedClock("2026-09-20T11:00:00.000Z"), idGen },
    { workspaceId: WORKSPACE, label: "site-b.example", baseUrl: SITE_B, remoteWorkspaceId: "remote-b" }
  );

  const rows = await repo.listByWorkspace({ workspaceId: WORKSPACE });
  const connected = rows.filter((row) => row.sealed === null);
  assert.deepEqual(
    connected.map((row) => row.baseUrl),
    [SITE_B],
    "this computer holds exactly one grant, so it must hold exactly one connected destination row"
  );
});

test("re-connecting the SAME site still updates its row in place rather than replacing it", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  const idGen = sequentialIdGen();

  const first = await saveConnectedDestination(
    { repo, clock: fixedClock("2026-09-20T10:00:00.000Z"), idGen },
    { workspaceId: WORKSPACE, label: "site-a.example", baseUrl: SITE_A, remoteWorkspaceId: "remote-a" }
  );
  const again = await saveConnectedDestination(
    { repo, clock: fixedClock("2026-09-20T11:00:00.000Z"), idGen },
    { workspaceId: WORKSPACE, label: "site-a.example", baseUrl: SITE_A, remoteWorkspaceId: "remote-a" }
  );

  assert.equal(again.id, first.id, "re-connecting the same site must not mint a new row id");
  const rows = await repo.listByWorkspace({ workspaceId: WORKSPACE });
  assert.equal(rows.length, 1);
});

test("moving the connection leaves a hand-configured destination and its credential alone", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  const sealedRow: PublishContentPeerRecord = {
    workspaceId: WORKSPACE,
    id: "peer-sealed",
    label: "hand-configured",
    baseUrl: "https://hand.example",
    remoteWorkspaceId: "remote-hand",
    sealed: "sealed-blob",
    masked: "tovu_live_…cdef",
    aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  await repo.insert(sealedRow);

  const idGen = sequentialIdGen();
  await saveConnectedDestination(
    { repo, clock: fixedClock("2026-09-20T10:00:00.000Z"), idGen },
    { workspaceId: WORKSPACE, label: "site-a.example", baseUrl: SITE_A, remoteWorkspaceId: "remote-a" }
  );
  await saveConnectedDestination(
    { repo, clock: fixedClock("2026-09-20T11:00:00.000Z"), idGen },
    { workspaceId: WORKSPACE, label: "site-b.example", baseUrl: SITE_B, remoteWorkspaceId: "remote-b" }
  );

  const rows = await repo.listByWorkspace({ workspaceId: WORKSPACE });
  assert.deepEqual(
    rows.map((row) => row.baseUrl).sort(),
    ["https://hand.example", SITE_B],
    "superseding a connection must never delete a peer the owner configured by hand with a credential"
  );
});

test("selectConnectedDestination never picks arbitrarily between two connected rows", async () => {
  const older: PublishContentPeerRecord = {
    workspaceId: WORKSPACE,
    id: "peer-old",
    label: "site-a.example",
    baseUrl: SITE_A,
    remoteWorkspaceId: "remote-a",
    sealed: null,
    masked: null,
    aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
  };
  const newer: PublishContentPeerRecord = { ...older, id: "peer-new", label: "site-b.example", baseUrl: SITE_B, remoteWorkspaceId: "remote-b", createdAt: "2026-09-20T11:00:00.000Z", updatedAt: "2026-09-20T11:00:00.000Z" };

  // Repository order deliberately puts the STALE row first — the order sol's failure chain relied
  // on. The single grant belongs to whichever connection was made last, so the newest row is the
  // only one it can authorise.
  assert.equal(selectConnectedDestination([older, newer])?.id, "peer-new");
  assert.equal(selectConnectedDestination([newer, older])?.id, "peer-new");
});

test("selectConnectedDestination answers only for CONNECTED rows — a hand-configured peer is not a connection", async () => {
  const connected: PublishContentPeerRecord = {
    workspaceId: WORKSPACE,
    id: "peer-connected",
    label: "site-a.example",
    baseUrl: SITE_A,
    remoteWorkspaceId: "remote-a",
    sealed: null,
    masked: null,
    aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
  };
  const sealed: PublishContentPeerRecord = { ...connected, id: "peer-sealed", baseUrl: "https://hand.example", sealed: "sealed-blob", masked: "tovu_live_…cdef" };

  assert.equal(selectConnectedDestination([sealed, connected])?.id, "peer-connected");
  assert.equal(
    selectConnectedDestination([sealed]),
    null,
    "a peer configured by hand with a pasted key is a destination, not a connection — the HTTP view must not report it as one"
  );
  assert.equal(selectConnectedDestination([]), null);
});
