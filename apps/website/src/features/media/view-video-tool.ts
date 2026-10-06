import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { VIDEO_MAX_FRAMES, VIDEO_MAX_FRAME_BYTES, VIDEO_MAX_INPUT_BYTES, VIDEO_MAX_OUTPUT_BYTES, VIDEO_MAX_SHEET_BYTES, VIDEO_MAX_SHEETS, type VideoFrameExtractor } from '@jini-ai/cms/media';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolRegistration } from '@jini-ai/core';
import { prepareMessageAttachments } from '@jini-ai/daemon';
import type { ToolContributor } from '#src/assistant/index';
import type { AuthorizeFn } from '../../contracts/core/commands/index.js';
import { sniffContentType, type AssetBlobRepoPort, type BlobStorePort, type MediaRepoPort } from './index.js';
import { CHAT_ATTACHMENT_REF_PATTERN, type ChatAttachmentReadResult } from './read-chat-attachment.js';

/** Video is never sent as a filename pretending to be visible content. Authorized bytes go to an
 * injected extractor, then its JPEGs use the same preparation as message image attachments and the
 * media_view_image MCP envelope. Existing CLI gateway and BYOK mappings already preserve images.
 * Extraction changes no library/attachment state; its temporary codec files are private scratch. */
export const MEDIA_VIEW_VIDEO_TOOL_ID = 'media_view_video';
export type VideoAttachmentReader = (required: { ref: string; ownerId: string }, optional: { maxBytes: number }) => Promise<ChatAttachmentReadResult>;
export interface MediaVideoToolPorts { readonly extractor: VideoFrameExtractor; readonly readAttachment: VideoAttachmentReader }
export interface MediaViewVideoToolDeps extends MediaVideoToolPorts {
  authorize: AuthorizeFn;
  workspaceId: string;
  mediaRepo: MediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  blobStore: BlobStorePort;
}
export const MEDIA_VIEW_VIDEO_INPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  oneOf: [{ required: ['mediaId'] }, { required: ['attachmentRef'] }],
  not: { required: ['at', 'every'] },
  properties: {
    mediaId: { type: 'string', minLength: 1, description: 'One owned media-library id, from content_read.media_asset. Supply this OR attachmentRef.' },
    attachmentRef: { type: 'string', pattern: '^attachment:[A-Za-z0-9-]{8,80}$', description: 'One owned chat attachment ref, attachment:<uuid>. Supply this OR mediaId. Paths are refused.' },
    layout: { type: 'string', enum: ['frames', 'sheet'], default: 'frames', description: 'Separate frames by default. Use sheet for a cheap skim of a long clip: up to four grids of sixteen tiles, with a text map of tile positions to timestamps. Then use start/every with separate frames to zoom in on a section.' },
    frames: { type: 'integer', minimum: 1, maximum: VIDEO_MAX_FRAMES, description: 'Frame count (default 16 without every, clamped to 1–64; samples beyond 16 shrink automatically). Without every, evenly spaced near start and end. With every, request this many samples, clamping beyond the clip to its last seekable time (possibly repeated). Omit with every to take only samples that fit, up to 64. Ignored when at is supplied.' },
    at: { type: 'array', minItems: 1, maxItems: VIDEO_MAX_FRAMES, items: { type: 'number', minimum: 0 }, description: 'Explicit nonnegative finite timestamps in seconds, overriding frames and start. Up to 64, clamped to the clip bounds; returned in the same order. Cannot be combined with every.' },
    every: { type: 'number', exclusiveMinimum: 0, description: 'Positive finite gap in seconds: every: 0.5 to see motion across a short clip. Samples start, start+every, start+2*every, etc. With frames omitted, take as many as fit up to 64. Cannot be combined with at.' },
    start: { type: 'number', minimum: 0, default: 0, description: 'Nonnegative finite starting time in seconds for every (default 0), clamped to the clip. Ignored without every or when at is supplied.' },
  },
} as const;
const catalog = [{
  name: MEDIA_VIEW_VIDEO_TOOL_ID,
  description: 'LOOK AT / SEE / VIEW A VIDEO from your media library or chat attachment. Use before describing a clip, answering what is in it, or finding which video shows something. Pass exactly one mediaId or attachmentRef (attachment:<uuid>); never a filesystem path. Default 16 evenly spaced still frames; up to 64 samples. Separate JPEG frames stay at max 768px long edge up to 16 samples and shrink automatically beyond 16 (64 samples: 384px), keeping estimated image tokens bounded. Use layout: sheet to skim long clips cheaply in up to four grids of sixteen tiles; a text map gives each one-based row/column and timestamp in seconds, with no drawn labels. Then use start/every and layout: frames to zoom in on a section. Same frames/every/start/at sampling args work in both layouts. Separate images max 512KiB each, sheets max 2 MiB each, 8 MiB total JPEG bytes. Returns actual JPEG images plus duration, source width/height, codec/container, sizeBytes, hasAudio and timestamps. Use every: 0.5 to see motion, with start in seconds (default 0) and optional frames to control count; omit frames with every to take only fitting samples, up to 64. Requested times clamp to the last seekable time, so an explicit count can repeat end frames. at chooses up to 64 explicit nonnegative finite seconds and overrides frames/start; every with at is refused. Events between samples and audio content are not analyzed. Read-only and owner-scoped. If host codec tools are missing it returns video preview unavailable on this host.',
  sideEffects: 'none' as AgentToolSideEffect,
  authorization: { permission: 'media.read' }, inputSchema: MEDIA_VIEW_VIDEO_INPUT_SCHEMA,
}];
export const mediaViewVideoDerivedRisk: DerivedRiskByToolId = new Map([[MEDIA_VIEW_VIDEO_TOOL_ID, 'none']]);
const catalogById = indexCatalogById({ catalog });

function refusal(required: { message: string }, _optional: Record<string, never> = {}) {
  return new ToolInputError({ message: `${MEDIA_VIEW_VIDEO_TOOL_ID}: ${required.message}` });
}
function readInput({ input }: { input: unknown }, _optional: Record<string, never> = {}) {
  const record = requireInputRecord({ input });
  if (Object.keys(record).some(key => !['mediaId', 'attachmentRef', 'frames', 'at', 'every', 'start', 'layout'].includes(key))) throw refusal({ message: 'only mediaId, attachmentRef, frames, at, every, start and layout are accepted; filesystem paths are refused.' });
  const refs = ['mediaId', 'attachmentRef'].filter(key => record[key] !== undefined);
  const key = refs.length === 1 ? refs[0]! : '';
  const value = record[key];
  if (!key || typeof value !== 'string' || !value || /[/\\\0]/u.test(value) || (key === 'attachmentRef' && !CHAT_ATTACHMENT_REF_PATTERN.test(value))) {
    throw refusal({ message: 'pass exactly one mediaId or attachmentRef (attachment:<uuid>); filesystem paths are refused.' });
  }
  if (record.layout !== undefined && record.layout !== 'frames' && record.layout !== 'sheet') throw refusal({ message: 'layout must be frames or sheet.' });
  if (record.frames !== undefined && (typeof record.frames !== 'number' || !Number.isFinite(record.frames))) throw refusal({ message: 'frames must be a finite number.' });
  if (typeof record.frames === 'number' && record.frames < 0) throw refusal({ message: 'frames must be nonnegative.' });
  if (record.at !== undefined && (!Array.isArray(record.at) || record.at.length === 0 || record.at.some(time => typeof time !== 'number' || !Number.isFinite(time)))) throw refusal({ message: 'at must be a nonempty array of finite timestamps in seconds.' });
  if (Array.isArray(record.at) && record.at.some(time => time < 0)) throw refusal({ message: 'at timestamps must be nonnegative.' });
  if (record.every !== undefined && (typeof record.every !== 'number' || !Number.isFinite(record.every) || record.every <= 0)) throw refusal({ message: 'every must be a positive finite number of seconds.' });
  if (record.start !== undefined && (typeof record.start !== 'number' || !Number.isFinite(record.start) || record.start < 0)) throw refusal({ message: 'start must be a nonnegative finite number of seconds.' });
  if (record.at !== undefined && record.every !== undefined) throw refusal({ message: 'every cannot be combined with at.' });
  return { key, value, layout: record.layout as 'frames' | 'sheet' | undefined, frames: record.frames as number | undefined, at: record.at as number[] | undefined, every: record.every as number | undefined, start: record.start as number | undefined };
}
async function ownedMediaBytes(
  { deps, mediaId, principalId }: { deps: MediaViewVideoToolDeps; mediaId: string; principalId: string }, _optional: Record<string, never> = {},
) {
  const asset = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: mediaId });
  // Media creator is independent of shared blob owner: identical uploads may deduplicate across
  // principals. Unknown attribution is never an implicit permission to somebody else's bytes.
  if (!asset || asset.workspaceId !== deps.workspaceId || !principalId || asset.createdBy !== principalId) throw refusal({ message: 'media is unavailable or not owned by the caller.' });
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: asset.source.sha256 });
  if (!blob) throw refusal({ message: 'media has no stored video.' });
  const size = await deps.blobStore.sizeOf?.({ storageKey: blob.storageKey }, {});
  if (size === undefined || size === null || !Number.isFinite(size) || size <= 0 || size > VIDEO_MAX_INPUT_BYTES) throw refusal({ message: 'video size is unknown or exceeds the preview size limit (64 MiB).' });
  return deps.blobStore.get({ storageKey: blob.storageKey });
}
export function buildMediaViewVideoRegistrations(
  deps: MediaViewVideoToolDeps, _optional: Record<string, never> = {},
): ToolRegistration[] {
  return buildDomainRegistrations({ domain: 'media-video-view', catalogModule: 'features/media/view-video-tool.ts', catalog: catalogById, derivedRisk: mediaViewVideoDerivedRisk,
    handlers: { [MEDIA_VIEW_VIDEO_TOOL_ID]: async ctx => {
      const input = readInput({ input: ctx.input }, {});
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: 'media.read' }, { entityType: 'media' });
      let bytes: Uint8Array;
      if (input.key === 'mediaId') {
        bytes = await ownedMediaBytes({ deps, mediaId: input.value, principalId: ctx.principal.id }, {});
      } else {
        const source = await deps.readAttachment({ ref: input.value, ownerId: ctx.principal.id }, { maxBytes: VIDEO_MAX_INPUT_BYTES });
        if (!source.ok) throw refusal({ message: 'attachment is unavailable or not owned by the caller.' });
        bytes = source.bytes;
      }
      if (bytes.byteLength > VIDEO_MAX_INPUT_BYTES) throw refusal({ message: 'video exceeds the preview size limit (64 MiB).' });
      if (!sniffContentType({ bytes }).startsWith('video/')) throw refusal({ message: 'the stored file is not an MP4 or WebM video.' });
      const result = await deps.extractor.extract({ bytes }, {
        ...(input.frames !== undefined ? { frames: input.frames } : {}), ...(input.at !== undefined ? { at: input.at } : {}), signal: ctx.signal,
        ...(input.layout !== undefined ? { layout: input.layout } : {}),
        ...(input.every !== undefined ? { every: input.every } : {}), ...(input.start !== undefined ? { start: input.start } : {}),
      });
      if (!result.ok) return { content: [{ type: 'text', text: JSON.stringify({ available: false, reason: result.reason, message: result.message }) }] };
      const sheetMode = input.layout === 'sheet';
      const sheets = result.sheets;
      if (sheetMode) {
        if (result.frames.length !== 0 || !sheets?.length || sheets.length > VIDEO_MAX_SHEETS || sheets.some(sheet =>
          sheet.bytes.byteLength > VIDEO_MAX_SHEET_BYTES || sheet.mimeType !== 'image/jpeg' ||
          !Number.isInteger(sheet.columns) || sheet.columns < 1 || sheet.columns > 4 ||
          !Number.isInteger(sheet.rows) || sheet.rows < 1 || sheet.rows > 4 ||
          !Number.isInteger(sheet.tileEdgePx) || sheet.tileEdgePx < 1 || sheet.tileEdgePx > 768 ||
          !Array.isArray(sheet.tiles) || sheet.tiles.length === 0 || sheet.tiles.length > 16 || sheet.tiles.length > sheet.columns * sheet.rows ||
          sheet.tiles.some((tile, index) => tile.index !== index + 1 || tile.row !== Math.floor(index / sheet.columns) + 1 || tile.column !== index % sheet.columns + 1 || !Number.isFinite(tile.at) || tile.at < 0),
        ) || sheets.reduce((sum, sheet) => sum + sheet.tiles.length, 0) > VIDEO_MAX_FRAMES ||
          sheets.reduce((sum, sheet) => sum + sheet.columns * sheet.rows * sheet.tileEdgePx ** 2, 0) > 20_000 * 750) {
          throw refusal({ message: 'the video extractor exceeded the sheet output limit.' });
        }
      } else if (sheets?.length || result.frames.length === 0 || result.frames.length > VIDEO_MAX_FRAMES || result.frames.some(frame => frame.bytes.byteLength > VIDEO_MAX_FRAME_BYTES)) {
        throw refusal({ message: 'the video extractor exceeded the frame output limit.' });
      }
      const images = sheetMode ? sheets! : result.frames;
      if (images.reduce((sum, image) => sum + image.bytes.byteLength, 0) > VIDEO_MAX_OUTPUT_BYTES) throw refusal({ message: 'the video extractor exceeded the total output limit (8 MiB).' });
      const refs = images.map((_, index) => String(index));
      const prepared = await prepareMessageAttachments({ refs, read: async ({ ref }) => {
        const index = Number(ref);
        const image = images[index]!;
        return { name: sheetMode ? `Video contact sheet ${index + 1}` : `Video frame at ${result.frames[index]!.at}s`, mimeType: image.mimeType, bytes: image.bytes };
      } }, {});
      return { content: [
        { type: 'text', text: JSON.stringify({ video: result.metadata, layout: sheetMode ? 'sheet' : 'frames', frames: result.frames.map(frame => ({ at: frame.at, mimeType: frame.mimeType })),
          ...(sheetMode ? { sheets: sheets!.map((sheet, index) => ({ sheet: index + 1, columns: sheet.columns, rows: sheet.rows, tileEdgePx: sheet.tileEdgePx, mimeType: sheet.mimeType, tiles: sheet.tiles })) } : {}),
          sampling: sheetMode ? 'Tiles are row-major with one-based index/row/column mapped to seconds in each sheet. Events between samples and audio content are not analyzed.' : 'Still frames at requested times; events between samples and audio content are not analyzed.',
        }) },
        ...prepared.images.map(image => ({ type: 'image', mimeType: image.mimeType, data: image.data })),
      ] };
    } },
  });
}
export function contributeMediaViewVideoTools(ports: MediaVideoToolPorts, _optional: Record<string, never> = {}): ToolContributor {
  return { domain: 'media-video-view', risk: mediaViewVideoDerivedRisk, build: deps => buildMediaViewVideoRegistrations({ ...deps, ...ports }, {}) };
}
