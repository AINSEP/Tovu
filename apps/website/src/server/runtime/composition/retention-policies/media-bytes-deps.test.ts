import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { BlobStorePort, VersionedMediaRepoPort } from "@jini-ai/cms/media";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createBlobGcJournal } from "#src/platform/db/repos/blob-gc-journal";
import { createMediaBytesPolicy } from "./media-bytes.js";
import { mediaBytesDeps } from "./media-bytes-deps.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25);
const WS = "00000000-0000-4000-8000-000000000001";
const SHA = "a".repeat(64);
const KEY = `media/${WS}/${SHA}`;
const MEDIA_ID = "11111111-1111-4111-8111-111111111111";
const iso = (ms: number) => new Date(ms).toISOString();

type Kernel = KyselyKernel<unknown>;
type Extra = Partial<Pick<Parameters<typeof mediaBytesDeps>[0], "shareTransfers" | "recoveryArtifacts">>;

/** The production deps on a real migrated kernel; only the media repo and blob sizes are stubbed. */
async function reportOn(kernel: Kernel, extra: Extra = {}) {
  await createBlobGcJournal({ kernel }, {}).save({ id: KEY, workspaceId: WS, sha256: SHA, storageKey: KEY, kind: "original", reason: "manual", journaledAt: iso(NOW - 60 * DAY) });
  const deps = mediaBytesDeps({
    workspaceId: WS, kernel, signal: new AbortController().signal, clock: { nowMs: () => NOW },
    mediaRepo: { list: async () => [] } as unknown as VersionedMediaRepoPort,
    blobStore: { sizeOf: async () => 5 } as unknown as BlobStorePort,
    shareTransfers: undefined, recoveryArtifacts: async () => [], ...extra,
  }, {});
  const report = await createMediaBytesPolicy(deps, {}).report();
  return { eligible: report.eligible.manual.map(item => item.storageKey), kept: report.kept.map(item => item.why) };
}

const TABLES = ["blob_gc_journal", "asset_blobs", "asset_renditions", "outbox_events", "media", "form_submissions", "form_definitions", "publish_content_runs"];
for (const adapter of eachDialect({ tables: TABLES, make: kernel => kernel as Kernel })) {
  const fresh = (t: { after(fn: () => void): void }) => {
    const kernel = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => kernel.close());
    return kernel;
  };

  test(`[${adapter.name}] all probes clear on a site that holds nothing else: the file is eligible`, async t => {
    assert.deepEqual(await reportOn(fresh(t)), { eligible: [KEY], kept: [] });
  });

  test(`[${adapter.name}] rendition reference kept`, async t => {
    const kernel = fresh(t);
    // Exact-key ownership across workspaces: a shared rendition object in another workspace still holds it.
    await kernel.execute(sql`INSERT INTO asset_renditions (id, workspace_id, asset_id, transform_name, version, storage_key, created_at) VALUES ('r1', 'other-ws', 'asset-1', 'thumb', 1, ${KEY}, ${iso(NOW)})`);
    assert.deepEqual(await reportOn(kernel), { eligible: [], kept: ["rendition"] });
  });

  test(`[${adapter.name}] form attachment reference kept`, async t => {
    const kernel = fresh(t);
    await kernel.execute(sql`INSERT INTO outbox_events (id, workspace_id, event_json, status, attempts, next_attempt_at, created_at) VALUES (${`forms:file:cleanup:${WS}:${MEDIA_ID}`}, ${WS}, ${JSON.stringify({ name: "form.attachment.cleanup", payload: { workspaceId: WS, sha256: SHA } })}, 'pending', 0, ${iso(NOW)}, ${iso(NOW)})`);
    assert.deepEqual(await reportOn(kernel), { eligible: [], kept: ["forms"] }, "a pending form file clean-up still owns these bytes");
    await kernel.execute(sql`UPDATE outbox_events SET status = 'delivered'`);
    assert.deepEqual(await reportOn(kernel), { eligible: [KEY], kept: [] }, "a delivered clean-up no longer holds them");
    await kernel.execute(sql`INSERT INTO media (id, workspace_id, title, alt, caption, credit, source_sha256, status, created_at, updated_at, version) VALUES (${MEDIA_ID}, ${WS}, 'cv', '', '', '', ${SHA}, 'trashed', ${iso(NOW)}, ${iso(NOW)}, 1)`);
    assert.deepEqual(await reportOn(kernel), { eligible: [KEY], kept: [] }, "a media row alone is the media probes' business, not a form's");
    await kernel.execute(sql`INSERT INTO form_definitions (id, workspace_id, name, slug, fields_json, notify_json, created_at, updated_at) VALUES ('f1', ${WS}, 'Jobs', 'jobs', '[]', '{}', ${iso(NOW)}, ${iso(NOW)})`);
    await kernel.execute(sql`INSERT INTO form_submissions (id, workspace_id, form_definition_id, data_json, source_ip, submitted_at, deleted_at) VALUES ('s1', ${WS}, 'f1', ${JSON.stringify({ cv: { mediaId: MEDIA_ID } })}, '', ${iso(NOW)}, ${iso(NOW)})`);
    assert.deepEqual(await reportOn(kernel), { eligible: [], kept: ["forms"] }, "a trashed submission can be restored with its attachment");
  });

  test(`[${adapter.name}] in-flight transfer keeps bytes`, async t => {
    const kernel = fresh(t);
    await kernel.execute(sql`INSERT INTO publish_content_runs (id, workspace_id, direction, peer_principal_id, phase, actor_id, started_at) VALUES ('run-1', ${WS}, 'import', 'peer', 'applying', 'owner', ${iso(NOW)})`);
    assert.deepEqual(await reportOn(kernel), { eligible: [], kept: ["transfer"] });
    await kernel.execute(sql`UPDATE publish_content_runs SET phase = 'completed'`);
    assert.deepEqual(await reportOn(kernel), { eligible: [KEY], kept: [] });
    assert.deepEqual(await reportOn(kernel, { shareTransfers: { hasWork: () => true } }), { eligible: [], kept: ["transfer"] }, "a share export is copying files");
    assert.deepEqual(await reportOn(kernel, { shareTransfers: {} }), { eligible: [], kept: ["unknown"] }, "a share backend that cannot say is never read as idle");
  });

  test(`[${adapter.name}] retained recovery artifact keeps bytes`, async t => {
    const kernel = fresh(t);
    // A copy taken before the file lost its owner would bring that owner back on restore.
    assert.deepEqual(await reportOn(kernel, { recoveryArtifacts: async () => [{ createdAt: iso(NOW - 90 * DAY) }] }), { eligible: [], kept: ["grace"] });
    assert.deepEqual(await reportOn(kernel, { recoveryArtifacts: async () => [{ createdAt: NOW - 59 * DAY }] }), { eligible: [KEY], kept: [] }, "a copy taken after the file was ownerless does not hold it");
    assert.deepEqual(await reportOn(kernel, { recoveryArtifacts: async () => [{ createdAt: "not a date" }] }), { eligible: [], kept: ["unknown"] });
    assert.deepEqual(await reportOn(kernel, { recoveryArtifacts: async () => { throw new Error("journal unreadable"); } }), { eligible: [], kept: ["unknown"] });
  });

  test(`[${adapter.name}] all probes bound in production deps`, async t => {
    const deps = mediaBytesDeps({
      workspaceId: WS, kernel: fresh(t), signal: new AbortController().signal, clock: { nowMs: () => NOW },
      mediaRepo: { list: async () => [] } as unknown as VersionedMediaRepoPort, blobStore: {} as BlobStorePort,
      shareTransfers: undefined, recoveryArtifacts: async () => [],
    }, {});
    const bound = Object.entries(deps.probes).filter(([, probe]) => typeof probe === "function").map(([name]) => name).sort();
    assert.deepEqual(bound, ["forms", "live", "recovery", "rendition", "transfer", "trashed"]);
  });
}
