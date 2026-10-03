import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import {
  createPublishContentPeer,
  deletePublishContentPeer,
  listPublishContentPeers,
  PublishContentPeerDuplicateLabelError,
  resolvePeerCredential,
  updatePublishContentPeer,
} from "#src/features/publish-content/peers";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishContentPeerRepo } from "#src/platform/db/sqlite/publish-content-peer-repo.sqlite";
import { workspaces } from "#src/platform/db/schema.sqlite";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * The real SQLite adapter against a fresh file-backed content.db built from the real Drizzle
 * migrations. Not a copy of a site's `content.db`: that file is untracked (absent in a clean clone)
 * and holds whatever peers its owner has added, which broke exact-list assertions here.
 *
 * What only a real database can prove, and what the in-memory adapter therefore cannot:
 * - the `(workspace_id, label)` UNIQUE index really rejects a duplicate, and the driver error that
 *   produces is really the one `peers.ts`'s `isUniqueLabelViolation` recognises;
 * - the four nullable `sealed_*` columns round-trip as ONE opaque group, including the "no
 *   credential yet" shape;
 * - the ciphertext really is at rest in the file, so the sealing is not an in-memory illusion.
 */

const WORKSPACE_ID = "workspace-local";
const API_KEY = "tovu_live_0123456789abcdef";

/** Builds a fresh file-backed content.db in a throwaway temp dir from the real migrations, holding
 *  only the workspace row the peers' FK needs. A file (not `:memory:`) so a second connection can
 *  prove the bytes landed on disk. */
function createFreshContentDbInTempDir(): { readonly dir: string; readonly dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-peer-repo-test-"));
  const dbPath = path.join(dir, "content.db");
  openContentDb(dbPath)
    .insert(workspaces)
    .values({ id: WORKSPACE_ID, name: WORKSPACE_ID, slug: WORKSPACE_ID, createdAt: "2026-09-18T00:00:00.000Z" })
    .run();
  return { dir, dbPath };
}

function makeDeps(dbPath: string, idPrefix: string) {
  let n = 0;
  const keyring = new InMemoryKeyring();
  return {
    repo: new SqlitePublishContentPeerRepo(openContentDb(dbPath)),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowMs: () => Date.parse("2026-09-18T00:00:00.000Z") },
    idGen: { newId: () => `${idPrefix}-${++n}` },
  };
}

test("a peer round-trips through the real publish_content_peers table, sealed at rest", async () => {
  const { dir, dbPath } = createFreshContentDbInTempDir();
  try {
    const deps = makeDeps(dbPath, "peer");
    const created = await createPublishContentPeer(deps, {
      workspaceId: WORKSPACE_ID,
      label: "production",
      baseUrl: "https://tovu.example.com/",
      remoteWorkspaceId: "remote-ws-9",
      apiKey: API_KEY,
    });
    assert.deepEqual(created, {
      id: "peer-1",
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      masked: "••••cdef",
      hasCredential: true,
    });

    // Re-open the file through a SECOND connection: this is what proves the bytes actually landed,
    // rather than living in the first connection's memory.
    const reread = makeDeps(dbPath, "unused");
    const listed = await listPublishContentPeers({ repo: reread.repo }, { workspaceId: WORKSPACE_ID });
    assert.deepEqual(listed, [created]);

    const stored = await reread.repo.findById({ workspaceId: WORKSPACE_ID, id: "peer-1" });
    assert.ok(stored?.sealed, "the sealed group must survive the round trip whole");
    assert.equal(stored.sealed.ciphertext.includes(API_KEY), false, "the key must be at rest as ciphertext, not plaintext");

    const resolved = await resolvePeerCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE_ID, id: "peer-1" });
    assert.equal(resolved.apiKey, API_KEY);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the real (workspace_id, label) UNIQUE index produces the driver error the store translates", async () => {
  const { dir, dbPath } = createFreshContentDbInTempDir();
  try {
    const deps = makeDeps(dbPath, "peer");
    const input = {
      workspaceId: WORKSPACE_ID,
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      apiKey: API_KEY,
    };
    await createPublishContentPeer(deps, input);
    await assert.rejects(
      () => createPublishContentPeer(deps, { ...input, baseUrl: "https://other.example.com" }),
      (err: unknown) => err instanceof PublishContentPeerDuplicateLabelError
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a row whose sealed group is absent reads back as hasCredential:false, not as a torn record", async () => {
  const { dir, dbPath } = createFreshContentDbInTempDir();
  try {
    const deps = makeDeps(dbPath, "peer");
    await createPublishContentPeer(deps, {
      workspaceId: WORKSPACE_ID,
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      apiKey: API_KEY,
    });
    const stored = await deps.repo.findById({ workspaceId: WORKSPACE_ID, id: "peer-1" });
    assert.ok(stored);
    await deps.repo.update({ ...stored, sealed: null, masked: null });

    const [summary] = await listPublishContentPeers({ repo: deps.repo }, { workspaceId: WORKSPACE_ID });
    assert.equal(summary.hasCredential, false);
    assert.equal(summary.masked, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("update and delete hit the real table by (workspace_id, id)", async () => {
  const { dir, dbPath } = createFreshContentDbInTempDir();
  try {
    const deps = makeDeps(dbPath, "peer");
    await createPublishContentPeer(deps, {
      workspaceId: WORKSPACE_ID,
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      apiKey: API_KEY,
    });

    const renamed = await updatePublishContentPeer(deps, { workspaceId: WORKSPACE_ID, id: "peer-1", label: "prod-eu" });
    assert.equal(renamed.label, "prod-eu");
    assert.equal((await listPublishContentPeers({ repo: deps.repo }, { workspaceId: WORKSPACE_ID }))[0].label, "prod-eu");

    await deletePublishContentPeer({ repo: deps.repo }, { workspaceId: WORKSPACE_ID, id: "peer-1" });
    assert.deepEqual(await listPublishContentPeers({ repo: deps.repo }, { workspaceId: WORKSPACE_ID }), []);
    // Idempotent: deleting again is a success, matching the DELETE route contract.
    await deletePublishContentPeer({ repo: deps.repo }, { workspaceId: WORKSPACE_ID, id: "peer-1" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
