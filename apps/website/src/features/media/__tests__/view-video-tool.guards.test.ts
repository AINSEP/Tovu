import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { ToolInputError, type ToolExecutionContext } from '@jini-ai/core';
import { VIDEO_MAX_INPUT_BYTES, type VideoContactSheet, type VideoFrameExtractor, type VideoFrameResult } from '@jini-ai/cms/media';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createRandomUuidGenerator, createSystemClock } from '@jini-ai/core/primitives';
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, uploadMedia } from '../index.js';
import { buildMediaViewVideoRegistrations, contributeMediaViewVideoTools, MEDIA_VIEW_VIDEO_TOOL_ID, type MediaViewVideoToolDeps } from '../view-video-tool.js';

/**
 * @file Branch pins for `media_view_video`: every input refusal, every owned-media gate, the
 * source size/type gates, and every individual frame/sheet output-limit predicate, each asserted
 * by its exact model-facing message — one behaviour per test.
 */

const owner = 'video-owner';
const workspaceId = 'ws-video';
const attachmentRef = 'attachment:11111111-2222-4333-8444-555555555555';
const mp4 = new Uint8Array([0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 2, 0, ...Buffer.from('isomiso2')]);
const metadata = { duration: 2, width: 64, height: 32, codec: 'h264', container: 'mov,mp4', sizeBytes: mp4.length, hasAudio: false };
const jpeg = await sharp({ create: { width: 32, height: 16, channels: 3, background: 'red' } }).jpeg().toBuffer();
type Envelope = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };

function harness(input: { attachment?: Uint8Array; result?: VideoFrameResult } = {}) {
  const mediaRepo = new InMemoryMediaRepo({});
  const assetBlobRepo = new InMemoryAssetBlobRepo({});
  const blobStore = new InMemoryBlobStore();
  const extractor: VideoFrameExtractor = { extract: async () => input.result ?? { ok: true, metadata, frames: [{ at: 0.5, bytes: jpeg, mimeType: 'image/jpeg' }] } };
  const deps: MediaViewVideoToolDeps = { workspaceId, mediaRepo, assetBlobRepo, blobStore, extractor,
    authorize: async () => ({ allowed: true, reason: 'matched' }),
    readAttachment: async ({ ownerId }) => ownerId === owner ? { ok: true, bytes: input.attachment ?? mp4 } : { ok: false, refusal: 'not-owner' } };
  const call = (toolInput: unknown, principalId = owner) => buildMediaViewVideoRegistrations(deps, {})[0]!.handler({ executionId: 'e', principal: { id: principalId },
    run: { id: 'r' }, input: toolInput, signal: new AbortController().signal } satisfies ToolExecutionContext);
  const seed = async (createdByPrincipal = owner) => (await uploadMedia({ deps: { clock: { nowMs: () => 0 }, idGen: { newId: () => 'video-1' }, mediaRepo,
    blobRepo: assetBlobRepo, renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore },
  input: { workspaceId, bytes: mp4, filename: 'clip.mp4', contentType: 'video/mp4', createdByPrincipal } })).media;
  return { deps, call, seed, mediaRepo, assetBlobRepo, blobStore };
}

function refused(message: string) {
  return (error: unknown) => error instanceof ToolInputError && error.message === `${MEDIA_VIEW_VIDEO_TOOL_ID}: ${message}`;
}

// --- input ---------------------------------------------------------------------------------------

test('an unknown input key is refused naming the accepted keys', async () => {
  await assert.rejects(harness().call({ attachmentRef, path: '/etc/passwd' }),
    refused('only mediaId, attachmentRef, frames, at, every, start and layout are accepted; filesystem paths are refused.'));
});

const SOURCE_MESSAGE = 'pass exactly one mediaId or attachmentRef (attachment:<uuid>); filesystem paths are refused.';
for (const [name, toolInput] of [
  ['no source', {}],
  ['both sources', { mediaId: 'm', attachmentRef }],
  ['a non-string mediaId', { mediaId: 5 }],
  ['an empty mediaId', { mediaId: '' }],
  ['a mediaId with a slash', { mediaId: 'a/b' }],
  ['a mediaId with a backslash', { mediaId: 'a\\b' }],
  ['a mediaId with a NUL', { mediaId: 'a\0b' }],
  ['an attachmentRef outside the ref pattern', { attachmentRef: 'attachment:short' }],
] as const) {
  test(`${name} is refused as an invalid source`, async () => {
    await assert.rejects(harness().call(toolInput), refused(SOURCE_MESSAGE));
  });
}

test('frames 0 is accepted as nonnegative and forwarded', async () => {
  const h = harness();
  let frames: number | undefined;
  h.deps.extractor.extract = async (_required, options) => { frames = options.frames; return { ok: false, reason: 'unavailable', message: 'x' }; };
  await h.call({ attachmentRef, frames: 0 });
  assert.equal(frames, 0);
});

// --- owned media -----------------------------------------------------------------------------------

const UNOWNED = 'media is unavailable or not owned by the caller.';

test('an unknown media id is refused as unavailable', async () => {
  await assert.rejects(harness().call({ mediaId: 'missing' }), refused(UNOWNED));
});

test('a media row from another workspace is refused even when the repo returns it', async () => {
  const h = harness();
  const asset = await h.seed();
  h.mediaRepo.findById = async () => ({ ...asset, workspaceId: 'other-workspace' });
  await assert.rejects(h.call({ mediaId: asset.id }), refused(UNOWNED));
});

test('a caller with an empty principal id never matches media with an empty creator', async () => {
  const h = harness();
  const asset = await h.seed('');
  await assert.rejects(h.call({ mediaId: asset.id }, ''), refused(UNOWNED));
});

test('media created by another principal is refused', async () => {
  const h = harness();
  const asset = await h.seed('another-owner');
  await assert.rejects(h.call({ mediaId: asset.id }), refused(UNOWNED));
});

test('owned media with no stored blob row is refused', async () => {
  const h = harness();
  const asset = await h.seed();
  h.assetBlobRepo.findByHash = async () => null;
  await assert.rejects(h.call({ mediaId: asset.id }), refused('media has no stored video.'));
});

const SIZE_MESSAGE = 'video size is unknown or exceeds the preview size limit (64 MiB).';
for (const [name, sizeOf] of [
  ['a store that cannot report sizes', undefined],
  ['a null size', async () => null],
  ['a NaN size', async () => NaN],
  ['a zero size', async () => 0],
  ['a negative size', async () => -1],
  ['a size one byte over the limit', async () => VIDEO_MAX_INPUT_BYTES + 1],
] as const) {
  test(`owned media with ${name} is refused before download`, async () => {
    const h = harness();
    const asset = await h.seed();
    h.blobStore.sizeOf = sizeOf as InMemoryBlobStore['sizeOf'];
    h.blobStore.get = async () => { throw new Error('bytes must not be downloaded'); };
    await assert.rejects(h.call({ mediaId: asset.id }), refused(SIZE_MESSAGE));
  });
}

test('owned media exactly at the size limit is downloaded and previewed', async () => {
  const h = harness();
  const asset = await h.seed();
  h.blobStore.sizeOf = async () => VIDEO_MAX_INPUT_BYTES;
  const result = await h.call({ mediaId: asset.id }) as Envelope;
  assert.equal(result.content.filter(block => block.type === 'image').length, 1);
});

// --- source gates --------------------------------------------------------------------------------

test('an attachment the caller does not own is refused', async () => {
  await assert.rejects(harness().call({ attachmentRef }, 'another-owner'), refused('attachment is unavailable or not owned by the caller.'));
});

test('source bytes over the preview limit are refused', async () => {
  await assert.rejects(harness({ attachment: new Uint8Array(VIDEO_MAX_INPUT_BYTES + 1) }).call({ attachmentRef }),
    refused('video exceeds the preview size limit (64 MiB).'));
});

test('source bytes that are not a video are refused', async () => {
  await assert.rejects(harness({ attachment: jpeg }).call({ attachmentRef }), refused('the stored file is not an MP4 or WebM video.'));
});

// --- frame output --------------------------------------------------------------------------------

test('a frames result with no frames is refused', async () => {
  await assert.rejects(harness({ result: { ok: true, metadata, frames: [] } }).call({ attachmentRef }),
    refused('the video extractor exceeded the frame output limit.'));
});

test('frame names carry their timestamp and the text block reports frames layout', async () => {
  const result = await harness().call({ attachmentRef }) as Envelope;
  const text = JSON.parse(result.content[0]!.text!);
  assert.deepEqual([text.layout, text.frames, Object.hasOwn(text, 'sheets'), text.sampling],
    ['frames', [{ at: 0.5, mimeType: 'image/jpeg' }], false, 'Still frames at requested times; events between samples and audio content are not analyzed.']);
});

// --- sheet output --------------------------------------------------------------------------------

function sheet(overrides: Partial<VideoContactSheet> = {}): VideoContactSheet {
  return { columns: 2, rows: 2, tileEdgePx: 384, mimeType: 'image/jpeg', bytes: jpeg,
    tiles: [{ index: 1, row: 1, column: 1, at: 0 }, { index: 2, row: 1, column: 2, at: 1 }, { index: 3, row: 2, column: 1, at: 2 }], ...overrides };
}

type ExtractedFrames = Extract<VideoFrameResult, { ok: true }>["frames"];

function sheetCall(sheets: VideoContactSheet[] | undefined, frames: ExtractedFrames = []) {
  return harness({ result: { ok: true, metadata, frames, ...(sheets === undefined ? {} : { sheets }) } }).call({ attachmentRef, layout: 'sheet' });
}

const SHEET_MESSAGE = 'the video extractor exceeded the sheet output limit.';

test('a valid sheet result is accepted', async () => {
  const result = await sheetCall([sheet()]) as Envelope;
  assert.equal(result.content.filter(block => block.type === 'image').length, 1);
});

test('a sheet result that also carries frames is refused', async () => {
  await assert.rejects(sheetCall([sheet()], [{ at: 0, bytes: jpeg, mimeType: 'image/jpeg' }]), refused(SHEET_MESSAGE));
});

for (const [name, overrides] of [
  ['a non-JPEG sheet', { mimeType: 'image/png' }],
  ['a fractional column count', { columns: 1.5 }],
  ['zero columns', { columns: 0 }],
  ['five columns', { columns: 5 }],
  ['a fractional row count', { rows: 1.5 }],
  ['zero rows', { rows: 0 }],
  ['five rows', { rows: 5 }],
  ['a fractional tile edge', { tileEdgePx: 1.5 }],
  ['a zero tile edge', { tileEdgePx: 0 }],
  ['a tile edge over 768px', { tileEdgePx: 769 }],
  ['a non-array tile map', { tiles: 'tiles' }],
  ['an empty tile map', { tiles: [] }],
  ['more tiles than grid cells', { columns: 1, rows: 1 }],
  ['a tile with the wrong index', { tiles: [{ index: 2, row: 1, column: 1, at: 0 }] }],
  ['a tile in the wrong row', { tiles: [{ index: 1, row: 2, column: 1, at: 0 }] }],
  ['a tile at a non-finite time', { tiles: [{ index: 1, row: 1, column: 1, at: Infinity }] }],
  ['a tile at a negative time', { tiles: [{ index: 1, row: 1, column: 1, at: -1 }] }],
] as const) {
  test(`a sheet with ${name} is refused`, async () => {
    await assert.rejects(sheetCall([sheet(overrides as Partial<VideoContactSheet>)]), refused(SHEET_MESSAGE));
  });
}

/** 60 grid cells at `edge` px: 4x4, 4x4, 4x4 and 4x3. At 500px that is exactly 15,000,000 px. */
function budgetSheets(edge: number): VideoContactSheet[] {
  return [4, 4, 4, 3].map(rows => sheet({ columns: 4, rows, tileEdgePx: edge, tiles: [{ index: 1, row: 1, column: 1, at: 0 }] }));
}

test('sheets exactly at the combined tile pixel budget are accepted', async () => {
  const result = await sheetCall(budgetSheets(500)) as Envelope;
  assert.equal(result.content.filter(block => block.type === 'image').length, 4);
});

test('sheets one pixel edge over the combined tile pixel budget are refused', async () => {
  await assert.rejects(sheetCall(budgetSheets(501)), refused(SHEET_MESSAGE));
});

// --- contributor ---------------------------------------------------------------------------------

test('the contributor binds its ports into the registrations it builds', async () => {
  const h = harness();
  const { extractor, readAttachment, ...rest } = h.deps;
  const contributor = contributeMediaViewVideoTools({ extractor, readAttachment });
  assert.equal(contributor.domain, 'media-video-view');
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const [registration] = contributor.build(rest as Parameters<typeof contributor.build>[0], { surfaceExchanges });
  const result = await registration!.handler({ executionId: 'e', principal: { id: owner }, run: { id: 'r' }, input: { attachmentRef },
    signal: new AbortController().signal }) as Envelope;
  assert.equal(result.content.filter(block => block.type === 'image').length, 1);
});
