import assert from "node:assert/strict";
import test from "node:test";
import { MediaConflictError, type AssetRenditionRecord, type AssetRenditionRepoPort, type MediaRecord } from "@jini-ai/cms/media";
import { guardMediaRenditionRepo } from "../guard-rendition-repo.js";
import type { VersionedMediaRepoPort } from "../versioned-media-repo.js";

/** The rendition-repo guard: reads pass through, and a save persists only while the source is unchanged. */
function recordingRenditions() {
  const calls: string[] = [];
  const repo: AssetRenditionRepoPort = {
    listByAsset: async required => { calls.push(`list ${required.assetId}`); return []; },
    findOne: async required => { calls.push(`find ${required.transformName}@${required.version}`); return null; },
    save: async record => { calls.push(`save ${record.assetId}`); },
    removeByAsset: async required => { calls.push(`remove ${required.assetId}`); },
  };
  return { calls, repo };
}
const media = { workspaceId: "ws", id: "asset-1", source: { sha256: "sha-a" } } as unknown as MediaRecord;
const rendition = (overrides: Partial<AssetRenditionRecord> = {}) => ({ workspaceId: "ws", assetId: "asset-1", ...overrides }) as unknown as AssetRenditionRecord;
function mediaRepo(applied: boolean | undefined, seen: unknown[] = []): VersionedMediaRepoPort {
  return {
    replaceFileIfVersion: async () => assert.fail("not used"),
    ...(applied === undefined ? {} : { saveRenditionIfSource: async (input: unknown) => { seen.push(input); return { applied }; } }),
  } as unknown as VersionedMediaRepoPort;
}

test("without a media record or a replaceable source, the rendition repo is returned unchanged", () => {
  const { repo } = recordingRenditions();
  assert.equal(guardMediaRenditionRepo({ mediaRepo: mediaRepo(true), renditionRepo: repo, media: null }), repo);
  assert.equal(guardMediaRenditionRepo({ mediaRepo: {} as VersionedMediaRepoPort, renditionRepo: repo, media }, {}), repo);
});

test("the guarded repo forwards reads and removals to the underlying repo", async () => {
  const { calls, repo } = recordingRenditions();
  const guarded = guardMediaRenditionRepo({ mediaRepo: mediaRepo(true), renditionRepo: repo, media });
  assert.deepEqual(await guarded.listByAsset({ workspaceId: "ws", assetId: "asset-1" }), []);
  assert.equal(await guarded.findOne({ workspaceId: "ws", assetId: "asset-1", transformName: "thumb", version: 2 }), null);
  await guarded.removeByAsset({ workspaceId: "ws", assetId: "asset-1" });
  assert.deepEqual(calls, ["list asset-1", "find thumb@2", "remove asset-1"]);
});

test("a save persists through the source-compare and refuses a changed source, another asset or a repo without the compare", async () => {
  const seen: unknown[] = [];
  const { calls, repo } = recordingRenditions();
  const record = rendition();
  await guardMediaRenditionRepo({ mediaRepo: mediaRepo(true, seen), renditionRepo: repo, media }).save(record);
  assert.deepEqual(seen, [{ record, sourceSha256: "sha-a" }]);
  const conflict = { name: "MediaConflictError", message: "media file changed while generating its preview" };
  await assert.rejects(guardMediaRenditionRepo({ mediaRepo: mediaRepo(false), renditionRepo: repo, media }).save(record), (error: unknown) => error instanceof MediaConflictError && error.message === conflict.message);
  await assert.rejects(guardMediaRenditionRepo({ mediaRepo: mediaRepo(undefined), renditionRepo: repo, media }).save(record), MediaConflictError);
  for (const other of [rendition({ workspaceId: "ws-2" }), rendition({ assetId: "asset-2" })]) {
    await assert.rejects(guardMediaRenditionRepo({ mediaRepo: mediaRepo(true, seen), renditionRepo: repo, media }).save(other), MediaConflictError);
  }
  assert.equal(seen.length, 1, "a foreign record never reaches the compare");
  assert.deepEqual(calls, [], "the guard never writes through the unguarded save");
});
