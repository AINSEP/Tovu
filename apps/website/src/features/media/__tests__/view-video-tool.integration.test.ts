import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';
import { createFfmpegVideoFrameExtractor, findVideoBinaries, VIDEO_MAX_FRAME_BYTES, VIDEO_MAX_EDGE_PX, VIDEO_MAX_SHEET_BYTES, VIDEO_MAX_OUTPUT_BYTES } from '@jini-ai/cms/media';
import { InMemoryMediaRepo, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, uploadMedia } from '../index.js';
import { buildMediaViewVideoRegistrations } from '../view-video-tool.js';

// Contract: ADS-memory/.local-artifacts/codex/2026-10-06-release-0111-video64/staged/spec.md. The fixture is read
// only. Spec SHA256: 855beddf17d8f9a6a7f7974a54d3ca396fb8eab2a9e0bb3ed49b59a7bad6939d.
// Its mvhd/tkhd headers declare 8 seconds and 632x418; those are independent test oracles.
test('real tiny MP4 reaches the tool as N decodable bounded JPEGs with source metadata', { timeout: 105_000 }, async t => {
  if (!await findVideoBinaries({}, {})) { t.skip('Video preview unavailable: nice/ffmpeg/ffprobe are missing.'); return; }
  const workspaceId = 'ws-video-integration';
  const principalId = 'video-integration-owner';
  const mediaRepo = new InMemoryMediaRepo({});
  const blobRepo = new InMemoryAssetBlobRepo({});
  const blobStore = new InMemoryBlobStore();
  const fixture = fileURLToPath(new URL('../../../../../../development/e2e/fixtures/video/iris-ai-motion.mp4', import.meta.url));
  const bytes = await readFile(fixture);
  const { media } = await uploadMedia({ deps: {
    clock: { nowMs: () => 0 }, idGen: { newId: () => 'real-video' }, mediaRepo, blobRepo,
    renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore,
  }, input: { workspaceId, bytes, filename: 'iris-ai-motion.mp4', contentType: 'video/mp4', createdByPrincipal: principalId } });
  const tool = buildMediaViewVideoRegistrations({
    workspaceId, mediaRepo, assetBlobRepo: blobRepo, blobStore,
    authorize: async () => ({ allowed: true, reason: 'matched' }), extractor: createFfmpegVideoFrameExtractor({}, {}),
    readAttachment: async () => { throw new Error('this case uses a library id'); },
  }, {})[0]!;
  const output = await tool.handler({ executionId: 'real-video-exec', principal: { id: principalId }, run: { id: 'real-video-run' }, input: { mediaId: media.id, frames: 4 }, signal: new AbortController().signal }) as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };
  const meta = JSON.parse(output.content.find(block => block.type === 'text')!.text!);
  assert.ok(meta.video, JSON.stringify(meta));
  assert.ok(Math.abs(meta.video.duration - 8) < 0.02);
  assert.equal(meta.video.width, 632);
  assert.equal(meta.video.height, 418);
  assert.equal(meta.video.sizeBytes, bytes.byteLength);
  assert.equal(meta.video.hasAudio, false);
  assert.ok(meta.video.codec.length);
  assert.ok(meta.video.container.includes('mp4'));
  const images = output.content.filter(block => block.type === 'image');
  assert.equal(images.length, 4);
  const fingerprints = new Set<string>();
  for (const block of images) {
    assert.equal(block.mimeType, 'image/jpeg');
    const frame = Buffer.from(block.data!, 'base64');
    assert.ok(frame.length > 100 && frame.length <= VIDEO_MAX_FRAME_BYTES);
    const info = await sharp(frame).metadata();
    assert.equal(info.format, 'jpeg');
    assert.ok(info.width! > 0 && info.height! > 0 && Math.max(info.width!, info.height!) <= VIDEO_MAX_EDGE_PX);
    await sharp(frame).raw().toBuffer(); // Decode pixels, not merely the header.
    fingerprints.add(block.data!);
  }
  assert.ok(fingerprints.size > 1, 'a motion fixture must not return the same poster for every requested timestamp');
  assert.equal(meta.frames.length, 4);
  assert.ok(meta.frames[0].at < 0.2 && meta.frames[3].at > 7.8);
  // Cross-repo contract: 64 separate samples and sheets must both contain real decodable pixels.
  for (const layout of ['frames', 'sheet'] as const) {
    const preview = await tool.handler({ executionId: `real-video-${layout}`, principal: { id: principalId }, run: { id: 'real-video-run' }, input: { mediaId: media.id, frames: 64, layout }, signal: new AbortController().signal }) as typeof output;
    const text = JSON.parse(preview.content.find(block => block.type === 'text')!.text!);
    assert.ok(text.video, JSON.stringify(text));
    assert.equal(text.layout, layout);
    const rendered = preview.content.filter(block => block.type === 'image');
    assert.equal(rendered.length, layout === 'sheet' ? 4 : 64);
    let total = 0;
    for (const [index, block] of rendered.entries()) {
      const image = Buffer.from(block.data!, 'base64');
      total += image.length;
      assert.ok(image.length <= (layout === 'sheet' ? VIDEO_MAX_SHEET_BYTES : VIDEO_MAX_FRAME_BYTES));
      const info = await sharp(image).metadata();
      assert.equal(info.format, 'jpeg');
      if (layout === 'frames') assert.ok(Math.max(info.width!, info.height!) <= 384);
      else {
        const sheet = text.sheets[index];
        assert.equal(info.width, sheet.columns * sheet.tileEdgePx);
        assert.equal(info.height, sheet.rows * sheet.tileEdgePx);
        assert.equal(sheet.tileEdgePx, 384);
        assert.equal(sheet.tiles.length, 16);
      }
      await sharp(image).raw().toBuffer();
    }
    assert.ok(total <= VIDEO_MAX_OUTPUT_BYTES);
    const times = layout === 'sheet' ? text.sheets.flatMap((sheet: { tiles: Array<{ at: number }> }) => sheet.tiles.map(tile => tile.at)) : text.frames.map((frame: { at: number }) => frame.at);
    assert.equal(times.length, 64);
    assert.ok(times[0] < 0.2 && times[63] > 7.8);
  }
});
