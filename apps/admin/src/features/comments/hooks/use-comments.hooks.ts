import { useEffect, useState } from "react";

import { describeApiError } from "../../../lib/api";
import { defaultCommentsPort } from "./comments-dependencies.hooks";
import type { CommentsPort } from "./comments-port.hooks";

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
 *
 * `port` is injected — see `comments-port.hooks.ts` — rather than importing `lib/api` directly, so
 * a test can describe the permissions load against `createFakeCommentsPort` instead of stubbing
 * global `fetch`. `useWiredComments` below is the zero-argument pair `Comments.tsx` actually mounts.
 */

export interface CommentsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  permissions: string[] | null;
  error: string | null;
}

export function useComments(port: CommentsPort): CommentsController {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    port
      .me()
      .then((r) => setPermissions(r.effectivePermissions ?? []))
      .catch((e) => setError(describeApiError(e, "failed to load permissions")));
  }, [port]);

  return { permissions, error };
}

/**
 * Binds the real `/api/.../auth/me` client — see `comments-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Comments.tsx`
 * composes this and a test composes {@link useComments} with `createFakeCommentsPort`.
 */
export function useWiredComments(): CommentsController {
  return useComments(defaultCommentsPort);
}
