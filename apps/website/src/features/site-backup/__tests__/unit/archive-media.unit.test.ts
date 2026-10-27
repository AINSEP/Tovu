import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bufferArchiveMedia, type ArchiveMediaSource } from "../../archive-media.js";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const webp = Buffer.from("RIFF0000WEBPweb-copy");
const pdf = Buffer.from("%PDF-1.7\nbytes");
const source = (id: string, slug: string, bytes = png): ArchiveMediaSource => ({ id, slug, kind: "media", workspaceId: "ws", originalFilename: null, storageKey: id, sha256: hash(bytes), public: { version: 3, params: { format: "webp" } } });
const store = (blobs: Map<string, Buffer>) => ({ sizeOf: async ({ storageKey }: { storageKey: string }) => blobs.get(storageKey)?.length ?? null, get: async ({ storageKey }: { storageKey: string }) => blobs.get(storageKey)! });
test("one copy per item, id ordering, case-fold clashes and latest public reuse", async () => {
  const ledger = { sizes: [], buffered: [] };
  let transforms = 0;
  const copies = await bufferArchiveMedia({ sources: [source("b", "PHOTO"), { ...source("a", "Photo"), public: { version: 3, params: { format: "webp" }, storageKey: "public", sha256: hash(webp) } }], blobStore: store(new Map([["a", png], ["b", png], ["public", webp]])), imageTransformer: { transform: async () => { transforms++; return { bytes: webp, contentType: "image/webp" }; } }, ledger });
  assert.deepEqual(copies.map(copy => copy.path), ["media/Photo.webp", "media/PHOTO-2.webp"]);
  assert.equal(transforms, 1);
  assert.equal(ledger.buffered.length, 2);
  assert.ok(copies.every(copy => copy.sha256 === hash(webp) && copy.publicVersion === 3));
});
test("documents keep their original bytes and SVG removes scripts", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>');
  const ledger: { sizes: { path: string; bytes: number }[]; buffered: { path: string; content: Buffer }[] } = { sizes: [], buffered: [] };
  const copies = await bufferArchiveMedia({ sources: [{ ...source("d", "manual", pdf), kind: "document", originalFilename: "manual.pdf" }, source("s", "icon", svg)], blobStore: store(new Map([["d", pdf], ["s", svg]])), imageTransformer: { transform: async () => { throw new Error("must not transform"); } }, ledger });
  assert.equal(copies[0]!.path, "media/manual.pdf");
  assert.deepEqual(ledger.buffered[0]!.content, pdf);
  assert.equal(copies[1]!.path, "media/icon.svg");
  assert.doesNotMatch(ledger.buffered[1]!.content.toString(), /script|alert/);
});
test("a corrupt raster refuses by media id without falling back to raw bytes", async () => {
  const ledger = { sizes: [], buffered: [] };
  await assert.rejects(bufferArchiveMedia({ sources: [source("bad-photo", "photo")], blobStore: store(new Map([["bad-photo", png]])), imageTransformer: { transform: async () => { throw new Error("decode failed"); } }, ledger }), /bad-photo/);
  assert.equal(ledger.buffered.length, 0);
});
