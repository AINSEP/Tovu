import { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";

import { createMediaAccessEvidence, type MediaAccessEvidence } from "#src/features/media/access-evidence";

/**
 * The memory twin of the entry repo, bound the way composition binds it (`memory-deps/slices/repos.ts`): a write that settles
 * empties the media access-evidence caches linked to THIS repository. Tests that do not care about the hook build the repo here
 * so the binding stays in one place.
 */
export function trashAwareEntryRepo({ mediaAccessEvidence = createMediaAccessEvidence() }: { mediaAccessEvidence?: MediaAccessEvidence } = {}): TrashAwareInMemoryEntryRepo {
  return new TrashAwareInMemoryEntryRepo({ onWriteSettled: ({ repo }) => mediaAccessEvidence.invalidate({ owner: repo }) });
}
