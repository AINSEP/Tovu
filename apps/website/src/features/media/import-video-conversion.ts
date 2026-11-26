import { createConvertingUploader as create, type VideoImportOptions as Options } from "@jini-ai/cms/media/site/import-video-conversion";
import { createDerivedMediaLink } from "@jini-ai/cms/media/site/derived-media-link";
import type { Clock } from "@jini-ai/core/primitives";
import type { MediaRepoPort } from "@jini-ai/cms/media";

export type VideoImportOptions = Omit<Options, "linkDerivedMedia">;

export function createConvertingUploader(required: Parameters<typeof create>[0] & { mediaRepo: MediaRepoPort; clock: Clock }, optional: { video?: VideoImportOptions | undefined } = {}) {
  return create(required, { video: optional.video === undefined ? undefined : { ...optional.video,
    linkDerivedMedia: createDerivedMediaLink({ mediaRepo: required.mediaRepo, clock: required.clock,
      description: ({ title }) => `Web-playable copy of "${title}".`, refusal: "The converted video could not be linked to its original, so it was not kept." }),
  } });
}
