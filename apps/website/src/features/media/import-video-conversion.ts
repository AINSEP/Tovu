import {
  convertMediaVideo, shouldTranscodeOnImport, uploadMedia, VideoConversionError,
  type ConvertMediaVideoDeps, type MediaRecord, type MediaRepoPort, type UploadMediaDeps, type UploadMediaInput,
} from "@jini-ai/cms/media";
import type { Clock } from "@jini-ai/core/primitives";
import { createDerivedMediaLink } from "./derived-media-link.js";
import type { MediaConversionPorts } from "./tool-registrations.js";

/**
 * @file Owner rule 2026-10-31: a .mov/.m4v up to 50 MB is kept exactly as uploaded; over 50 MB it is
 * converted to a web-safe MP4 and the original is kept. Jini's `shouldTranscodeOnImport` decides
 * "over"; this file only applies that decision after the upload has been stored, so a converter
 * problem can never cost the owner the file they just added.
 *
 * Every port (the ffmpeg adapter, the copy-to-original link, the note sink) is passed in; nothing
 * here starts a process or reads the environment.
 */

/** The only facts about an upload the hook reads; the host's own input type carries more. */
interface UploadFacts { bytes: Uint8Array; contentType: string; createdByPrincipal: string }
type StoreUpload<Input extends UploadFacts> = (input: Input) => Promise<{ media: MediaRecord }>;

export interface ImportVideoConversion {
  /** The upload ports plus the injected converter and the "this copy came from that video" link. */
  deps: ConvertMediaVideoDeps;
  /**
   * Where the plain-words note goes when no copy could be made. The owner-facing sentence is `note`;
   * `cause` is the raw failure, for the operator log only.
   */
  reportNote: (required: { note: string; cause: unknown }) => void;
  /** Overrides Jini's 50 MiB import threshold (tests, or a host that changes the owner rule). */
  thresholdBytes?: number | undefined;
}

const SAVED_BUT_NOT_CONVERTED = "The video was saved as uploaded, but a web-playable copy";

/** Plain words for the owner. A refusal Jini already worded keeps its wording; anything else gets
 * a generic sentence, so a stack trace or a spawn error never reaches the screen. @complexity O(1). */
function describeSkippedConversion({ cause }: { cause: unknown }, _optional: Record<string, never> = {}): string {
  if (cause instanceof VideoConversionError) return `${SAVED_BUT_NOT_CONVERTED} was not made. ${cause.message}`;
  return `${SAVED_BUT_NOT_CONVERTED} could not be made.`;
}

/**
 * Converts the just-stored upload when it is a video over the threshold. Never throws: a missing
 * ffmpeg or a failed conversion is reported through `reportNote` and the original stays as uploaded.
 * Side effects: on success, one converted copy plus its link (Jini rolls back a half-made copy).
 * @complexity O(1) here; the conversion itself is O(video bytes).
 */
async function convertStoredUpload(
  required: { conversion: ImportVideoConversion; input: UploadFacts; stored: { media: MediaRecord } },
  _optional: Record<string, never> = {},
): Promise<void> {
  const { conversion, input, stored } = required;
  // The sniffed type of the stored bytes wins over the declared one, so a mislabeled upload cannot dodge or trigger the rule.
  const contentType = stored.media.source.contentType ?? input.contentType;
  const threshold = conversion.thresholdBytes === undefined ? {} : { thresholdBytes: conversion.thresholdBytes };
  if (!shouldTranscodeOnImport({ sizeBytes: input.bytes.byteLength, contentType }, threshold)) return;
  try {
    await convertMediaVideo({
      deps: conversion.deps,
      input: { workspaceId: stored.media.workspaceId, mediaId: stored.media.id, createdByPrincipal: input.createdByPrincipal },
    });
  } catch (cause) {
    conversion.reportNote({ note: describeSkippedConversion({ cause }), cause });
  }
}

/**
 * Wraps the host's `storeUpload` so a stored video over the import threshold also gets a web-safe
 * MP4 copy. The wrapped function still returns the ORIGINAL record, so the upload response and
 * everything linked to it are unchanged. With no `conversion` (no converter injected) the store
 * function is returned as-is.
 * @returns a store function with the same signature. @complexity O(1) to build.
 */
export function withVideoConversionOnImport<Input extends UploadFacts>(
  required: { storeUpload: StoreUpload<Input>; conversion: ImportVideoConversion | undefined },
  _optional: Record<string, never> = {},
): StoreUpload<Input> {
  const { storeUpload, conversion } = required;
  if (!conversion) return storeUpload;
  return async (input) => {
    const stored = await storeUpload(input);
    await convertStoredUpload({ conversion, input, stored });
    return stored;
  };
}

/** The injected pieces of the owner's video import rule (2026-10-31); absent, an import never converts. */
export interface VideoImportOptions {
  /** The ffmpeg adapter built at the composition root; no transcoder means no conversion. */
  ports: MediaConversionPorts;
  /** Where the plain-words note goes when a conversion could not be made (see `ImportVideoConversion`). */
  reportNote: ImportVideoConversion["reportNote"];
  /** Overrides Jini's 50 MiB import threshold. */
  thresholdBytes?: number | undefined;
}

/**
 * The note sink the production mount passes: the owner-facing sentence and the raw cause both go to the
 * operator log (the cause as a separate argument, never spliced into the sentence), because the upload
 * response has no field for the owner to read. The sentence itself never carries the cause, see
 * `describeSkippedConversion`. `warn` is injected (the mount passes `console.warn`). @complexity O(1).
 */
export function operatorLogVideoNote(
  { warn }: { warn: (line: string, cause: unknown) => void },
  _optional: Record<string, never> = {},
): ImportVideoConversion["reportNote"] {
  return ({ note, cause }) => warn(`[media-import] ${note}`, cause);
}

/** Builds the hook's conversion ports from the same repositories the import itself writes to, or
 *  `undefined` when the host injected no converter. @complexity O(1). */
function buildImportVideoConversion(
  { uploadDeps, mediaRepo, clock, video }: { uploadDeps: UploadMediaDeps; mediaRepo: MediaRepoPort; clock: Clock; video: VideoImportOptions | undefined },
  _optional: Record<string, never> = {},
): ImportVideoConversion | undefined {
  const transcoder = video?.ports.transcoder;
  if (!video || !transcoder) return undefined;
  return {
    deps: { ...uploadDeps, transcoder, linkDerivedMedia: createDerivedMediaLink({ mediaRepo, clock }) },
    reportNote: video.reportNote,
    thresholdBytes: video.thresholdBytes,
  };
}

/**
 * THE one store-then-convert upload every import path uses (admin direct upload, admin URL import, the
 * assistant's URL and local-file imports), so the owner's rule cannot be wired into some paths and
 * forgotten in others. Same cap and ports as a bare `uploadMedia`; with no `video` it behaves as one.
 * @complexity O(1) to build; each call is O(bytes) like `uploadMedia`.
 */
export function createConvertingUploader(
  required: {
    uploadDeps: UploadMediaDeps; caps: { maxUploadBytes: number; maxVideoUploadBytes?: number };
    mediaRepo: MediaRepoPort; clock: Clock;
  },
  optional: { video?: VideoImportOptions | undefined } = {},
): (input: UploadMediaInput) => Promise<{ media: MediaRecord }> {
  const { uploadDeps, caps, mediaRepo, clock } = required;
  return withVideoConversionOnImport({
    storeUpload: (input: UploadMediaInput) => uploadMedia({ deps: uploadDeps, input }, caps),
    conversion: buildImportVideoConversion({ uploadDeps, mediaRepo, clock, video: optional.video }),
  });
}
