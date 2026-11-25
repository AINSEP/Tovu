import assert from "node:assert/strict";
import test from "node:test";
import { shouldTranscodeOnImport, uploadMedia, type MediaTranscoderPort } from "@jini-ai/cms/media";
import { MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES, uploadLimitFor } from "@tovu/contracts/upload-limits";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo } from "../index.js";
import { withVideoConversionOnImport, type ImportVideoConversion } from "../import-video-conversion.js";

/**
 * Owner rule 2026-10-31: a .mov/.m4v up to 50 MB is kept as it came; over 50 MB it is converted to a
 * web-safe MP4 and the original is kept. These tests inject a tiny threshold so the rule is exercised
 * with 24-byte files; the real 50 MiB figure belongs to Jini's `shouldTranscodeOnImport`.
 */

const WORKSPACE_ID = "ws-import";
const PRINCIPAL_ID = "owner-1";
const NOW = "2026-11-24T00:00:00.000Z";
// A genuine leading `ftyp isom` box, 24 bytes: sniffs as video/mp4 without being a playable file.
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]);
const CONVERTED = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function harness() {
  let counter = 0;
  const deps = {
    clock: { nowMs: () => Date.parse(NOW), nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo: new InMemoryMediaRepo({}),
    blobRepo: new InMemoryAssetBlobRepo({}),
    renditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore(),
  };
  const storeUpload = (input: Parameters<typeof uploadMedia>[0]["input"]) => uploadMedia({ deps, input });
  return { deps, storeUpload };
}
type Harness = ReturnType<typeof harness>;

function fakeTranscoder(result: Awaited<ReturnType<MediaTranscoderPort["transcode"]>> | Error) {
  const calls: Uint8Array[] = [];
  const transcoder: MediaTranscoderPort = {
    async transcode({ input }) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { transcoder, calls };
}

function wired(h: Harness, transcoder: MediaTranscoderPort, optional: { thresholdBytes?: number } = {}) {
  const notes: Array<{ note: string; cause: unknown }> = [];
  const conversion: ImportVideoConversion = {
    deps: {
      ...h.deps,
      transcoder,
      // The same link convention `createDerivedMediaLink` uses, kept inline so this test needs no repo wiring.
      linkDerivedMedia: async ({ workspaceId, originalId, derivedId }) => {
        const [original, derived] = await Promise.all([
          h.deps.mediaRepo.findById({ workspaceId, id: originalId }),
          h.deps.mediaRepo.findById({ workspaceId, id: derivedId }),
        ]);
        await h.deps.mediaRepo.save({ ...derived!, description: `Web-playable copy of "${original!.title}".` });
      },
    },
    reportNote: (entry) => { notes.push(entry); },
    ...optional,
  };
  return { store: withVideoConversionOnImport({ storeUpload: h.storeUpload, conversion }), notes };
}

const videoUpload = (filename = "Clip.mov") => ({
  workspaceId: WORKSPACE_ID, bytes: VIDEO_BYTES, filename, contentType: "video/mp4", createdByPrincipal: PRINCIPAL_ID,
});

test("a video over the import threshold is converted: the original is kept and the copy points back at it", async () => {
  const h = harness();
  const { transcoder, calls } = fakeTranscoder({ ok: true, bytes: CONVERTED });
  const { store, notes } = wired(h, transcoder, { thresholdBytes: 23 });

  const { media } = await store(videoUpload());

  assert.equal(calls.length, 1, "the converter runs exactly once");
  assert.deepEqual(calls[0], VIDEO_BYTES, "it converts the bytes that were uploaded");
  const all = await h.deps.mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(all.length, 2, "the original and one converted copy");
  const original = all.find((item) => item.id === media.id);
  assert.ok(original, "the upload still returns the original, not the copy");
  assert.equal(original.description ?? "", "", "the original is not edited");
  const copy = all.find((item) => item.id !== media.id)!;
  assert.equal(copy.description, 'Web-playable copy of "Clip".');
  assert.deepEqual(notes, []);
});

test("a video exactly at the threshold is kept as it came (the rule is strictly over)", async () => {
  const h = harness();
  const { transcoder, calls } = fakeTranscoder({ ok: true, bytes: CONVERTED });
  const { store } = wired(h, transcoder, { thresholdBytes: VIDEO_BYTES.byteLength });

  await store(videoUpload());

  assert.equal(calls.length, 0);
  assert.equal((await h.deps.mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, 1);
});

test("a big file that is not a video is never sent to the converter", async () => {
  const h = harness();
  const { transcoder, calls } = fakeTranscoder({ ok: true, bytes: CONVERTED });
  const { store } = wired(h, transcoder, { thresholdBytes: 10 });

  await store({ workspaceId: WORKSPACE_ID, bytes: PNG_BYTES, filename: "pixel.png", contentType: "image/png", createdByPrincipal: PRINCIPAL_ID });

  assert.equal(calls.length, 0);
  assert.equal((await h.deps.mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, 1);
});

test("with no ffmpeg the upload still succeeds, keeps only the original, and records a plain-words note", async () => {
  const h = harness();
  const message = "Video conversion needs ffmpeg on this computer.";
  const { transcoder } = fakeTranscoder({ ok: false, reason: "unavailable", message });
  const { store, notes } = wired(h, transcoder, { thresholdBytes: 10 });

  const { media } = await store(videoUpload());

  const all = await h.deps.mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(all.map((item) => item.id), [media.id], "no half-made copy is left behind");
  assert.equal(notes.length, 1);
  assert.match(notes[0]!.note, /saved as uploaded/);
  assert.ok(notes[0]!.note.includes(message), "the note says why, in the converter's own words");
});

test("an unexpected converter crash never fails the upload and the note carries no technical text", async () => {
  const h = harness();
  const crash = new Error("spawn ffmpeg ENOENT");
  const { transcoder } = fakeTranscoder(crash);
  const { store, notes } = wired(h, transcoder, { thresholdBytes: 10 });

  const { media } = await store(videoUpload());

  assert.deepEqual((await h.deps.mediaRepo.list({ workspaceId: WORKSPACE_ID })).map((item) => item.id), [media.id]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.note, "The video was saved as uploaded, but a web-playable copy could not be made.");
  assert.equal(notes[0]!.cause, crash, "the real cause is handed to the operator port, not shown to the owner");
});

test("a failed store is not hidden and never reaches the converter", async () => {
  const h = harness();
  const { transcoder, calls } = fakeTranscoder({ ok: true, bytes: CONVERTED });
  const refusal = new Error("That file is 60 MB; the limit is 50 MB.");
  const conversion: ImportVideoConversion = { deps: { ...h.deps, transcoder, linkDerivedMedia: async () => {} }, reportNote: () => {}, thresholdBytes: 10 };
  const store = withVideoConversionOnImport({ storeUpload: async () => { throw refusal; }, conversion });

  await assert.rejects(store(videoUpload()), refusal);
  assert.equal(calls.length, 0);
});

test("with no conversion configured the store function is returned untouched", () => {
  const h = harness();
  assert.equal(withVideoConversionOnImport({ storeUpload: h.storeUpload, conversion: undefined }), h.storeUpload);
});

test("the video cap sits above Jini's import threshold, so the conversion is reachable; images stay at the old cap", () => {
  // Pinned on purpose (owner 2026-11-24: video cap 500 MB). The conversion only runs for a video over
  // the threshold, so a video limit at or below it would silently make the hook dead code again.
  assert.equal(shouldTranscodeOnImport({ sizeBytes: MAX_UPLOAD_BYTES, contentType: "video/quicktime" }), false);
  assert.equal(shouldTranscodeOnImport({ sizeBytes: MAX_UPLOAD_BYTES + 1, contentType: "video/quicktime" }), true);
  assert.ok(uploadLimitFor({ contentType: "video/quicktime" }) > MAX_UPLOAD_BYTES, "a 60 MB video must pass the limit and reach the conversion");
  assert.equal(shouldTranscodeOnImport({ sizeBytes: VIDEO_UPLOAD_LIMIT_BYTES, contentType: "video/quicktime" }), true);
  assert.equal(uploadLimitFor({ contentType: "image/png" }), MAX_UPLOAD_BYTES);
});
