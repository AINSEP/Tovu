import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * The real SQLite adapter against a COPY of this repo's real `sites/tovu-com/content.db` — the same
 * discipline (and the same copy helper shape) as `features/publish-content/__tests__/
 * permissions.boot.integration.test.ts`. The original is only ever READ, via `copyFileSync`.
 *
 * What only a real database can prove, and what the in-memory adapter therefore cannot:
 * - the `(workspace_id, label)` UNIQUE index really rejects a duplicate, and the driver error that
 *   produces is really the one `peers.ts`'s `isUniqueLabelViolation` recognises;
 * - the four nullable `sealed_*` columns round-trip as ONE opaque group, including the "no
 *   credential yet" shape;
 * - the ciphertext really is at rest in the file, so the sealing is not an in-memory illusion.
 */

const REAL_CONTENT_DB_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../sites/tovu-com/content.db"
);

const WORKSPACE_ID = "workspace-local";
const API_KEY = "tovu_live_0123456789abcdef";

/** Copies the real content.db (plus WAL/SHM sidecars, so the copy reflects the same committed state)
 *  into a throwaway temp dir. Never opens the original. */
function copyRealContentDbToTempDir(): { readonly dir: string; readonly dbPath: string } {
  assert.ok(fs.existsSync(REAL_CONTENT_DB_PATH), `expected the real content.db at ${REAL_CONTENT_DB_PATH}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-peer-repo-test-"));
  const dbPath = path.join(dir, "content.db");
  fs.copyFileSync(REAL_CONTENT_DB_PATH, dbPath);
  for (const sidecar of ["-wal", "-shm"]) {
    const source = `${REAL_CONTENT_DB_PATH}${sidecar}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, `${dbPath}${sidecar}`);
  }
  return { dir, dbPath };
}

function makeDeps(dbPath: string, idPrefix: string) {
  let n = 0;
  const keyring = new InMemoryKeyring();
  return {
    repo: new SqlitePublishContentPeerRepo(openContentDb(dbPath)),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => "2026-09-18T00:00:00.000Z" },
    idGen: { newId: () => `${idPrefix}-${++n}` },
  };
}

test("a peer round-trips through the real publish_content_peers table, sealed at rest", async () => {
  const { dir, dbPath } = copyRealContentDbToTempDir();
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
  const { dir, dbPath } = copyRealContentDbToTempDir();
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
  const { dir, dbPath } = copyRealContentDbToTempDir();
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
  const { dir, dbPath } = copyRealContentDbToTempDir();
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
