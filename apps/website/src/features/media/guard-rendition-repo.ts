import { MediaConflictError, type AssetRenditionRepoPort, type MediaRecord } from '@jini-ai/cms/media';
import type { VersionedMediaRepoPort } from './versioned-media-repo.js';

/** Temporary host adapter until the shared rendition service carries its source precondition.
 * Generation awaits real pixel/blob work. The source may be replaced during those awaits;
 * only an atomic source comparison at persistence prevents a late, obsolete preview. */
export function guardMediaRenditionRepo({ mediaRepo, renditionRepo, media }: {
  mediaRepo: VersionedMediaRepoPort; renditionRepo: AssetRenditionRepoPort; media: MediaRecord | null;
}, _optional: Record<string, never> = {}): AssetRenditionRepoPort {
  // A repository that cannot replace sources keeps its existing immutable-source behavior.
  if (!media || !mediaRepo.replaceFileIfVersion) return renditionRepo;
  return {
    findOne(required) { return renditionRepo.findOne(required); },
    listByAsset(required) { return renditionRepo.listByAsset(required); },
    removeByAsset(required) { return renditionRepo.removeByAsset(required); },
    async save(record) {
      if (record.workspaceId !== media.workspaceId || record.assetId !== media.id ||
        !mediaRepo.saveRenditionIfSource ||
        !(await mediaRepo.saveRenditionIfSource({ record, sourceSha256: media.source.sha256 })).applied) {
        throw new MediaConflictError({ message: 'media file changed while generating its preview' });
      }
    },
  };
}
