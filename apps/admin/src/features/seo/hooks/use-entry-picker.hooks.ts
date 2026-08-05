import { useEffect, useState } from "react";
import { api, describeApiError, type AdminPost } from "../../../lib/api";

/**
 * @file Everything `EntryPicker` (the SEO screen's post+page dropdown, REQ-06) does, so it can stay
 * markup only.
 *
 * Extracted verbatim — same state, same effect, same error string.
 */

export interface EntryPickerController {
  entries: AdminPost[] | null;
  error: string | null;
}

export function useEntryPicker(): EntryPickerController {
  const [entries, setEntries] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listPosts(), api.listPages()])
      .then(([posts, pages]) =>
        setEntries([...posts.posts.map((p) => p.post), ...pages.posts.map((p) => p.post)])
      )
      .catch((e) => setError(describeApiError(e, "failed to load entries")));
  }, []);

  return { entries, error };
}
