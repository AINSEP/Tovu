import { useState } from "react";

/**
 * @file `SeoEntrySection`'s one piece of state — which entry the picker currently has selected.
 *
 * Extracted verbatim, trivial as it is: the DI-for-testing convention this pass uses applies
 * uniformly to every touched component (see `Posts.tsx`'s own doc on why), not only to sections
 * with async state.
 */

export interface SeoEntrySectionController {
  entryId: string;
  setEntryId: (entryId: string) => void;
}

export function useSeoEntrySection(): SeoEntrySectionController {
  const [entryId, setEntryId] = useState("");
  return { entryId, setEntryId };
}
