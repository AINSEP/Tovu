import { useEffect, useState } from "react";

import { api, describeApiError } from "../../../lib/api";

/**
 * @file The top-level `Comments()` component's own state: loading the operator's effective
 * permissions, which gate whether `QueueSection`/`SettingsSection` render at all.
 *
 * `QueueSection` and `SettingsSection` are private, unexported sub-components of `Comments.tsx`
 * (its own file header explains why: mirrors `Database.tsx`'s multi-section-single-file shape) —
 * neither is tested standalone today, so neither gets its own DI-seam prop; only `Comments` does,
 * matching the `posts`/`users`/`members` precedent of seaming the exported, tested screen. Each
 * still gets its own hook file (`use-comment-queue.hooks.ts`, `use-comment-settings.hooks.ts`)
 * because each owns independent state.
 */

export interface CommentsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  permissions: string[] | null;
  error: string | null;
}

export function useComments(): CommentsController {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setPermissions(r.effectivePermissions ?? []))
      .catch((e) => setError(describeApiError(e, "failed to load permissions")));
  }, []);

  return { permissions, error };
}
