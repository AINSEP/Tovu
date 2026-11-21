import { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";

import { invalidateMediaAccessEvidence } from "#src/platform/media-access-evidence";

/**
 * The memory twin of the entry repo, bound the way composition binds it (`memory-deps/slices/repos.ts`): a write that settles
 * empties the media access-evidence caches linked to THIS repository. Tests that do not care about the hook build the repo here
 * so the binding stays in one place.
 */
export function trashAwareEntryRepo(_optional = {}): TrashAwareInMemoryEntryRepo {
  return new TrashAwareInMemoryEntryRepo({ onWriteSettled: ({ repo }) => invalidateMediaAccessEvidence({ owner: repo }) });
}
