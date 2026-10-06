import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { ToolInputError, isReadOnlyTool, createToolRegistry, type ToolExecutionContext } from '@jini-ai/core';
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from '@jini-ai/daemon';
import { delegatedToolExecuteRoute } from '@jini-ai/daemon/http';
import { ForbiddenError } from '@jini-ai/cms/core';
import { VIDEO_MAX_FRAME_BYTES, VIDEO_MAX_OUTPUT_BYTES, VIDEO_MAX_SHEET_BYTES, VIDEO_MAX_SHEETS, type VideoFrameExtractor, type VideoFrameOptions } from '@jini-ai/cms/media';
import { InMemoryMediaRepo, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, uploadMedia } from '../index.js';
import { buildMediaViewVideoRegistrations, MEDIA_VIEW_VIDEO_INPUT_SCHEMA, MEDIA_VIEW_VIDEO_TOOL_ID, type MediaViewVideoToolDeps } from '../view-video-tool.js';
import { startStubProviderServer } from '../../../server/__tests__/helpers/stub-provider-server.js';
import { runByokProviderTurn } from '../../../assistant/byok-provider-turn.js';
import { TOOL_SEARCH_KEYWORDS } from '../../../assistant/tool-search-keywords.js';

// Contract: ADS-memory/.local-artifacts/codex/2026-10-06-release-0111-video64/staged/spec.md.
// Spec SHA256: 855beddf17d8f9a6a7f7974a54d3ca396fb8eab2a9e0bb3ed49b59a7bad6939d.
const owner = 'video-owner';
const workspaceId = 'ws-video';
const attachmentRef = 'attachment:11111111-2222-4333-8444-555555555555';
const mp4 = new Uint8Array([0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 2, 0, ...Buffer.from('isomiso2')]);
const metadata = { duration: 2, width: 64, height: 32, codec: 'h264', container: 'mov,mp4', sizeBytes: mp4.length, hasAudio: false };
async function harness() {
  const mediaRepo = new InMemoryMediaRepo({});
  const assetBlobRepo = new InMemoryAssetBlobRepo({});
  const blobStore = new InMemoryBlobStore();
  const jpeg = await sharp({ create: { width: 32, height: 16, channels: 3, background: 'red' } }).jpeg().toBuffer();
  let extractions = 0;
  let reads = 0;
  const extractor: VideoFrameExtractor = { extract: async ({ bytes }, options) => {
    extractions++;
    assert.deepEqual(bytes, mp4);
    assert.equal(options.signal?.aborted, false);
    return { ok: true, metadata, frames: [{ at: 0.1, bytes: jpeg, mimeType: 'image/jpeg' }, { at: 1.9, bytes: jpeg, mimeType: 'image/jpeg' }] };
  } };
  const deps: MediaViewVideoToolDeps = {
    workspaceId, mediaRepo, assetBlobRepo, blobStore, extractor,
    authorize: async () => ({ allowed: true, reason: 'matched' }),
    readAttachment: async (input) => { reads++; return input.ownerId === owner && input.ref === attachmentRef ? { ok: true, bytes: mp4 } : { ok: false, refusal: 'not-owner' }; },
  };
  const registrations = buildMediaViewVideoRegistrations(deps, {});
  const tool = registrations[0]!;
  const call = (input: unknown, principalId = owner) => tool.handler({ executionId: 'video-exec', principal: { id: principalId }, run: { id: 'video-run' }, input, signal: new AbortController().signal } satisfies ToolExecutionContext);
  const seed = async (principal = owner) => (await uploadMedia({ deps: {
    clock: { nowMs: () => 0 }, idGen: { newId: () => 'video-1' }, mediaRepo, blobRepo: assetBlobRepo,
    renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore,
  }, input: { workspaceId, bytes: mp4, filename: 'clip.mp4', contentType: 'video/mp4', createdByPrincipal: principal } })).media;
  return { deps, tool, call, seed, jpeg, registrations, get extractions() { return extractions; }, get reads() { return reads; } };
}
type Envelope = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };

test('video schema and description advertise gap, start, sixty-four frames and total image budget', async () => {
  const h = await harness();
  const schema = MEDIA_VIEW_VIDEO_INPUT_SCHEMA;
  assert.deepEqual(h.tool.descriptor.inputSchema, schema);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.frames.maximum, 64);
  assert.equal(schema.properties.at.maxItems, 64);
  assert.equal(schema.properties.every.type, 'number');
  assert.equal(schema.properties.every.exclusiveMinimum, 0);
  assert.equal(schema.properties.start.minimum, 0);
  assert.equal(schema.properties.start.default, 0);
  assert.deepEqual(schema.properties.layout.enum, ['frames', 'sheet']);
  assert.equal(schema.properties.layout.default, 'frames');
  assert.deepEqual(schema.not, { required: ['at', 'every'] });
  // No schema default may turn omitted frames with every into a request for only sixteen.
  assert.equal('default' in schema.properties.frames, false);
  assert.match(schema.properties.frames.description, /default 16 without every/);
  assert.match(schema.properties.every.description, /every: 0\.5/);
  assert.match(h.tool.descriptor.description!, /64/);
  assert.match(h.tool.descriptor.description!, /8 MiB total/);
  assert.match(h.tool.descriptor.description!, /Default 16/);
  assert.match(h.tool.descriptor.description!, /shrink automatically beyond 16/);
  assert.match(h.tool.descriptor.description!, /layout: sheet/);
  assert.match(h.tool.descriptor.description!, /start\/every.*zoom in/);
  for (const word of ['motion', 'interval', 'gap', 'every', 'seconds', 'count', 'sheet', 'skim', 'zoom']) assert.ok(TOOL_SEARCH_KEYWORDS[MEDIA_VIEW_VIDEO_TOOL_ID]!.split(' ').includes(word));
});

test('forwards count, explicit timestamps, gap and start without supplying a missing count', async () => {
  const h = await harness();
  const seen: VideoFrameOptions[] = [];
  h.deps.extractor.extract = async (_required, options) => {
    seen.push(options);
    return { ok: false, reason: 'unavailable', message: 'test extractor' };
  };
  const positions = Array.from({ length: 64 }, (_, index) => index / 2);
  const requests = [{}, { frames: 64 }, { frames: 99 }, { every: 0.5 }, { every: 0.5, start: 1, frames: 6 }, { frames: 1, start: 9, at: positions }, { at: [...positions, 99] }, { start: 0 }, { layout: 'sheet', every: 60, frames: 64, start: 10 }, { layout: 'frames', at: [2, 1, 2] }];
  for (const options of requests) await h.call({ attachmentRef, ...options });
  assert.deepEqual(seen.map(({ signal, ...options }) => { assert.equal(signal?.aborted, false); return options; }), requests);
  assert.equal(Object.hasOwn(seen[0]!, 'frames'), false); // Jini owns the sixteen-frame default.
  assert.equal(Object.hasOwn(seen[0]!, 'layout'), false); // Omission retains separate frames.
  assert.equal(Object.hasOwn(seen[3]!, 'frames'), false);
});

test('refuses invalid sampling values with exact messages before authorization or source I/O', async () => {
  const h = await harness();
  h.deps.authorize = async () => { assert.fail('invalid input must be rejected before authorization'); };
  const invalid: Array<{ options: Record<string, unknown>; message: string }> = [];
  for (const layout of [null, '', 'grid', 1, true, {}]) invalid.push({ options: { layout }, message: 'layout must be frames or sheet.' });
  for (const value of [NaN, Infinity, -Infinity, '4', null]) {
    invalid.push({ options: { frames: value }, message: 'frames must be a finite number.' });
    invalid.push({ options: { at: [value] }, message: 'at must be a nonempty array of finite timestamps in seconds.' });
  }
  invalid.push({ options: { frames: -1 }, message: 'frames must be nonnegative.' });
  invalid.push({ options: { at: [0, -0.1] }, message: 'at timestamps must be nonnegative.' });
  for (const value of [[], '1', null]) invalid.push({ options: { at: value }, message: 'at must be a nonempty array of finite timestamps in seconds.' });
  for (const value of [0, -1, NaN, Infinity, -Infinity, '0.5', null]) invalid.push({ options: { every: value }, message: 'every must be a positive finite number of seconds.' });
  for (const value of [-1, NaN, Infinity, -Infinity, '0', null]) invalid.push({ options: { start: value }, message: 'start must be a nonnegative finite number of seconds.' });
  invalid.push({ options: { every: 0.5, at: [0] }, message: 'every cannot be combined with at.' });
  invalid.push({ options: { frames: NaN, at: [0] }, message: 'frames must be a finite number.' });
  invalid.push({ options: { start: -1, at: [0] }, message: 'start must be a nonnegative finite number of seconds.' });
  for (const { options, message } of invalid) {
    await assert.rejects(h.call({ attachmentRef, ...options }), error => {
      assert.ok(error instanceof ToolInputError);
      assert.equal(error.message, `${MEDIA_VIEW_VIDEO_TOOL_ID}: ${message}`);
      return true;
    });
  }
  assert.equal(h.reads, 0);
  assert.equal(h.extractions, 0);
});

test('accepts sixty-four returned frames and refuses sixty-five or an oversized individual JPEG', async () => {
  const h = await harness();
  let count = 64;
  let bytes = h.jpeg;
  h.deps.extractor.extract = async () => ({ ok: true, metadata, frames: Array.from({ length: count }, (_, at) => ({ at, bytes, mimeType: 'image/jpeg' as const })) });
  const result = await h.call({ attachmentRef, frames: 64 }) as Envelope;
  assert.equal(result.content.filter(block => block.type === 'image').length, 64);
  count = 65;
  await assert.rejects(h.call({ attachmentRef }), { message: `${MEDIA_VIEW_VIDEO_TOOL_ID}: the video extractor exceeded the frame output limit.` });
  count = 1;
  bytes = Buffer.alloc(VIDEO_MAX_FRAME_BYTES + 1);
  await assert.rejects(h.call({ attachmentRef }), { message: `${MEDIA_VIEW_VIDEO_TOOL_ID}: the video extractor exceeded the frame output limit.` });
});

test('accepts exactly eight MiB of JPEGs but refuses aggregate overflow from a custom extractor', async () => {
  const h = await harness();
  assert.equal(VIDEO_MAX_OUTPUT_BYTES, 8 * 1024 * 1024);
  const bytes = Buffer.alloc(VIDEO_MAX_FRAME_BYTES);
  const frames = Array.from({ length: 16 }, (_, at) => ({ at, bytes, mimeType: 'image/jpeg' as const }));
  h.deps.extractor.extract = async () => ({ ok: true, metadata, frames });
  const result = await h.call({ attachmentRef }) as Envelope;
  assert.equal(result.content.filter(block => block.type === 'image').length, 16);
  assert.equal(result.content.filter(block => block.type === 'image').reduce((sum, block) => sum + Buffer.from(block.data!, 'base64').byteLength, 0), VIDEO_MAX_OUTPUT_BYTES);
  frames.push({ at: 9, bytes: Buffer.alloc(1), mimeType: 'image/jpeg' });
  await assert.rejects(h.call({ attachmentRef }), { message: `${MEDIA_VIEW_VIDEO_TOOL_ID}: the video extractor exceeded the total output limit (8 MiB).` });
});

test('owned media and chat refs return identical actual JPEG images and metadata', async () => {
  const h = await harness();
  const asset = await h.seed();
  const library = await h.call({ mediaId: asset.id, frames: 2 }) as Envelope;
  const attachment = await h.call({ attachmentRef, at: [0.1, 1.9] }) as Envelope;
  for (const output of [library, attachment]) {
    assert.equal(output.content.filter(b => b.type === 'image').length, 2);
    const data = output.content.filter(b => b.type === 'image').map(b => b.data!);
    assert.deepEqual(data, [h.jpeg.toString('base64'), h.jpeg.toString('base64')]);
    assert.equal((await sharp(Buffer.from(data[0]!, 'base64')).metadata()).format, 'jpeg');
    assert.deepEqual(JSON.parse(output.content[0]!.text!).video, metadata);
    assert.deepEqual(JSON.parse(output.content[0]!.text!).frames.map((f: { at: number }) => f.at), [0.1, 1.9]);
  }
});

test('foreign and unattributed media fail before blob access; shared blob owner never grants access', async () => {
  const h = await harness();
  const asset = await h.seed('another-owner');
  h.deps.blobStore.get = async () => { assert.fail('foreign bytes must never be read'); };
  await assert.rejects(h.call({ mediaId: asset.id }), ToolInputError);
  const record = await h.deps.mediaRepo.findById({ workspaceId, id: asset.id });
  await h.deps.mediaRepo.save({ ...record!, createdBy: null });
  await assert.rejects(h.call({ mediaId: asset.id }), ToolInputError);
  assert.equal(h.extractions, 0);
});

test('foreign attachment, denied permission and arbitrary paths are refused before extraction', async () => {
  const h = await harness();
  await assert.rejects(h.call({ attachmentRef }, 'another-owner'), ToolInputError);
  assert.equal(h.extractions, 0);
  const reads = h.reads;
  for (const input of [{ path: '/etc/passwd' }, { attachmentRef: '/etc/passwd' }, { mediaId: '/etc/passwd' }, { mediaId: 'a', attachmentRef }, {}, { attachmentRef, at: [] }, { attachmentRef, at: [NaN] }, { attachmentRef, frames: '4' }]) {
    await assert.rejects(h.call(input), ToolInputError);
  }
  assert.equal(h.reads, reads);
  h.deps.authorize = async () => ({ allowed: false, reason: 'insufficient_permission' });
  const denied = buildMediaViewVideoRegistrations(h.deps, {})[0]!;
  await assert.rejects(denied.handler({ executionId: 'x', principal: { id: owner }, run: { id: 'r' }, input: { attachmentRef }, signal: new AbortController().signal }), ForbiddenError);
  assert.equal(h.reads, reads);
});

test('checks source size before blob download and surfaces unavailable host as a text result', async () => {
  const h = await harness();
  const asset = await h.seed();
  h.deps.blobStore.sizeOf = async () => 64 * 1024 * 1024 + 1;
  const originalGet = h.deps.blobStore.get;
  h.deps.blobStore.get = async () => { assert.fail('oversize blob must not be read'); };
  await assert.rejects(h.call({ mediaId: asset.id }), /size limit/);
  h.deps.blobStore.sizeOf = async () => mp4.length;
  h.deps.blobStore.get = originalGet;
  h.deps.extractor.extract = async () => ({ ok: false, reason: 'unavailable', message: 'video preview unavailable on this host' });
  const result = await h.call({ mediaId: asset.id }) as Envelope;
  assert.deepEqual(result.content, [{ type: 'text', text: JSON.stringify({ available: false, reason: 'unavailable', message: 'video preview unavailable on this host' }) }]);
});

test('read-only delegated gateway preserves frames and the real BYOK OpenAI payload contains image blocks', async t => {
  const h = await harness();
  const registry = createToolRegistry({});
  h.registrations.forEach(registration => registry.register(registration));
  assert.equal(isReadOnlyTool({ descriptor: h.tool.descriptor }), true);
  assert.equal(h.tool.descriptor.id, MEDIA_VIEW_VIDEO_TOOL_ID);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: 'video-delivery' });
  const execute = async () => {
    const routed = await delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: 'video-call', toolId: MEDIA_VIEW_VIDEO_TOOL_ID, input: { attachmentRef }, requireReadOnly: true }, deps: { lifecycle, toolRegistry: registry, toolExecutor: createToolExecutor({ registry }), resolvePrincipal: () => ({ id: owner }) } as never });
    assert.equal(routed.ok, true);
    if (!routed.ok) throw new Error('tool route refused');
    return (routed.value as { result: { output: Envelope } }).result.output;
  };
  let payload: Record<string, unknown> | undefined;
  const baseUrl = await startStubProviderServer(t, (count, body) => {
    if (count === 1) return { status: 200, body: 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"video-call","type":"function","function":{"name":"media_view_video","arguments":"{\\"attachmentRef\\":\\"' + attachmentRef + '\\"}"}}]},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n' };
    payload = body;
    return { status: 200, body: 'data: {"choices":[{"delta":{"content":"red clip"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' };
  });
  await runByokProviderTurn({ protocol: 'openai', apiKey: 'test', baseUrl, model: 'test', system: 'test', messages: [{ role: 'user', content: 'What is in this clip?' }], tools: [h.tool.descriptor], executeTool: async () => {
    const result = await execute();
    return { content: result.content as Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string }> };
  }, onEvent: () => {} });
  assert.ok(payload, 'must send a continuation request after executing the tool');
  const messages = payload.messages as Array<{ role: string; content: unknown }>;
  const images = messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === 'image_url');
  assert.deepEqual(images.map(part => part.image_url.url), Array(2).fill(`data:image/jpeg;base64,${h.jpeg.toString('base64')}`));
});


test('sheet mode returns images with a one-based tile map in sampling order', async () => {
  const h = await harness();
  const sheets = [{ columns: 2, rows: 2, tileEdgePx: 768, mimeType: 'image/jpeg' as const, bytes: h.jpeg, tiles: [
    { index: 1, row: 1, column: 1, at: 1.9 }, { index: 2, row: 1, column: 2, at: 0 },
    { index: 3, row: 2, column: 1, at: 1.9 },
  ] }];
  h.deps.extractor.extract = async (_required, options) => {
    assert.deepEqual(options.at, [1.9, 0, 1.9]);
    assert.equal(options.layout, 'sheet');
    return { ok: true, metadata, frames: [], sheets };
  };
  const result = await h.call({ attachmentRef, layout: 'sheet', at: [1.9, 0, 1.9] }) as Envelope;
  assert.deepEqual(result.content.filter(block => block.type === 'image').map(block => block.data), [h.jpeg.toString('base64')]);
  const text = JSON.parse(result.content[0]!.text!);
  assert.equal(text.layout, 'sheet');
  assert.deepEqual(text.sheets, [{ sheet: 1, columns: 2, rows: 2, tileEdgePx: 768, mimeType: 'image/jpeg', tiles: sheets[0]!.tiles }]);
  assert.match(text.sampling, /row-major/);
});

test('sheet mode enforces sheet, tile and byte budgets before preparing image attachments', async () => {
  const h = await harness();
  assert.equal(VIDEO_MAX_SHEETS, 4);
  assert.equal(VIDEO_MAX_SHEET_BYTES, 2 * 1024 * 1024);
  const full = () => ({ columns: 4, rows: 4, tileEdgePx: 384, mimeType: 'image/jpeg' as const, bytes: Buffer.alloc(VIDEO_MAX_SHEET_BYTES), tiles: Array.from({ length: 16 }, (_, i) => ({ index: i + 1, row: Math.floor(i / 4) + 1, column: i % 4 + 1, at: i / 10 })) });
  let sheets = Array.from({ length: 4 }, full);
  h.deps.extractor.extract = async () => ({ ok: true, metadata, frames: [], sheets });
  const exact = await h.call({ attachmentRef, layout: 'sheet', frames: 64 }) as Envelope;
  assert.equal(exact.content.filter(block => block.type === 'image').length, 4);
  assert.equal(exact.content.filter(block => block.type === 'image').reduce((sum, block) => sum + Buffer.from(block.data!, 'base64').byteLength, 0), VIDEO_MAX_OUTPUT_BYTES);
  const outputError = { message: `${MEDIA_VIEW_VIDEO_TOOL_ID}: the video extractor exceeded the sheet output limit.` };
  sheets.push(full());
  await assert.rejects(h.call({ attachmentRef, layout: 'sheet' }), outputError);
  sheets = [full()];
  sheets[0]!.bytes = Buffer.alloc(VIDEO_MAX_SHEET_BYTES + 1);
  await assert.rejects(h.call({ attachmentRef, layout: 'sheet' }), outputError);
  sheets = [full()];
  sheets[0]!.tiles.push({ index: 17, row: 5, column: 1, at: 0 });
  await assert.rejects(h.call({ attachmentRef, layout: 'sheet' }), outputError);
  sheets = [full()];
  sheets[0]!.tiles[0]!.column = 2; // Metadata must actually map each row-major position.
  await assert.rejects(h.call({ attachmentRef, layout: 'sheet' }), outputError);
  sheets = [];
  await assert.rejects(h.call({ attachmentRef, layout: 'sheet' }), outputError);
});

test('refuses extractor results whose layout differs from the requested mode', async () => {
  const h = await harness();
  await assert.rejects(h.call({ attachmentRef, layout: 'sheet' }), /sheet output limit/);
  h.deps.extractor.extract = async () => ({ ok: true, metadata, frames: [], sheets: [{ columns: 1, rows: 1, tileEdgePx: 768, tiles: [{ index: 1, row: 1, column: 1, at: 0 }], bytes: h.jpeg, mimeType: 'image/jpeg' }] });
  await assert.rejects(h.call({ attachmentRef }), /frame output limit/);
});
