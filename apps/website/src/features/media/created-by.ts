import { uploadMedia as packageUploadMedia, type MediaRecord as PackageMediaRecord,
  type MediaRepoPort, type UploadMediaDeps, type UploadMediaInput } from "@jini-ai/cms/media";

/** Compatibility with the published @jini-ai/cms release, which predates createdBy.
 * The canonical type and upload stamp now live in Jini; remove this shim after adopting that
 * release. This host must remain usable while schema/package installation is staged. */
export type MediaRecord = PackageMediaRecord & { createdBy?: string | null | undefined };

/** Release compatibility for Jini's immutable creation field, including unknown legacy rows. */
export function preserveMediaCreator(required: { record: MediaRecord; original: MediaRecord },
  _optional: Record<string, never> = {}): MediaRecord {
  const { createdBy: _ignored, ...metadata } = required.record;
  return { ...metadata, ...(required.original.createdBy !== undefined
    ? { createdBy: required.original.createdBy } : {}) };
}

/** Adapt only creation saves, leaving authorization and the upload pipeline in the package.
 * Per-call binding is essential: parallel agent/user uploads must never share mutable actor state. */
export function mediaRepoWithCreator(required: { mediaRepo: MediaRepoPort; principalId: string },
  _optional: Record<string, never> = {}): MediaRepoPort {
  const { mediaRepo, principalId } = required;
  return {
    findById: input => mediaRepo.findById(input),
    findBySlug: input => mediaRepo.findBySlug(input),
    list: input => mediaRepo.list(input),
    remove: input => mediaRepo.remove(input),
    save: record => mediaRepo.save({ ...record, createdBy: principalId } as MediaRecord),
  };
}

/** Thin release adapter; all validation, dedup, GC locking and renditions remain in Jini. */
export async function uploadMedia(required: { deps: UploadMediaDeps; input: UploadMediaInput },
  optional: NonNullable<Parameters<typeof packageUploadMedia>[1]> = {}): Promise<{ media: MediaRecord }> {
  const { deps, input } = required;
  const result = await packageUploadMedia({ input, deps: { ...deps,
    mediaRepo: mediaRepoWithCreator({ mediaRepo: deps.mediaRepo, principalId: input.createdByPrincipal }),
  } }, optional);
  return { media: { ...result.media, createdBy: input.createdByPrincipal } };
}
