/**
 * @file `SharpImageTransformer` test (`image-transformer.sharp.ts`).
 *
 * `sharp` was installed after this adapter was first written (see the file
 * header's "To make this adapter fully live: run `npm install sharp`" note).
 * That flips this test from proving only the honest-failure path to proving
 * the real success path too: a genuine resize + format conversion, verified
 * by re-decoding the output with `sharp` itself. The failure-path test still
 * exists, but now covers real invalid image bytes (a case that stays
 * meaningful regardless of whether `sharp` is installed) rather than the
 * package being unavailable.
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { ImageTransformUnavailableError, SharpImageTransformer } from "../image-transformer.sharp";

test("SharpImageTransformer.transform actually resizes and re-encodes real image bytes", async () => {
  const transformer = new SharpImageTransformer();
  const sourcePng = await sharp({
    create: { width: 20, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

  const result = await transformer.transform({
    bytes: new Uint8Array(sourcePng),
    params: { width: 5, height: 5, format: "jpeg" },
  });

  assert.strictEqual(result.contentType, "image/jpeg");
  const outMeta = await sharp(Buffer.from(result.bytes)).metadata();
  assert.strictEqual(outMeta.format, "jpeg");
  assert.strictEqual(outMeta.width, 5);
  assert.strictEqual(outMeta.height, 5);
  // Re-encoded output must differ from the untouched source bytes (never a passthrough).
  assert.notDeepStrictEqual(Buffer.from(result.bytes), sourcePng);
});

test("SharpImageTransformer.transform rejects genuinely invalid image bytes (not a silent fallback)", async () => {
  const transformer = new SharpImageTransformer();
  await assert.rejects(() =>
    transformer.transform({
      bytes: new TextEncoder().encode("not-real-image-bytes"),
      params: { width: 100, height: 100, format: "jpeg" },
    })
  );
});

test("ImageTransformUnavailableError stays exported and instantiable for environments without 'sharp'", () => {
  const err = new ImageTransformUnavailableError("the 'sharp' npm package is not installed");
  assert.ok(err instanceof Error);
  assert.match(err.message, /sharp/i);
});
