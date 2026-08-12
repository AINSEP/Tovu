import { useState } from "react";

import { api, type AdminMedia } from "../../../lib/api";
import { mediaAltText } from "../rules";

/**
 * @file Everything `MediaPreview` does, so the component in `Media.tsx` is only markup.
 *
 * See `Media.tsx`'s file header for the full rationale of the optimistic image → video →
 * placeholder fallback chain this hook drives — the client has no server-provided content type to
 * read, so `stage` resolves it by trying to render, not by probing first.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/media` needs it.
 *
 * **Not a `useWiredX` candidate** (2026-08-11 wired-hooks-audit review): the only `api` touch here
 * is `api.mediaOriginalUrl(item.id)`, a pure, synchronous URL template
 * (`${BASE}/workspaces/${WORKSPACE_ID}/media/${id}/original` — see `lib/api.ts`; no `fetch`, no
 * `await`, no network round trip). That is the same "no host boundary, no side effect" category the
 * convention doc's own examples name for `describeApiError` — injecting it would let a fake quietly
 * change a deterministic string-building rule every test needs to hold still, for zero testability
 * gain since there is nothing here to stub. `media-port.hooks.ts` (the port shared by
 * `use-media.hooks.ts`/`use-edit-media-panel.hooks.ts`, which both hold REAL I/O) deliberately
 * excludes `mediaOriginalUrl` for the identical reason. This hook has no dependency left to inject
 * once that's excluded.
 */

export type PreviewStage = "image" | "video" | "unsupported";

export interface MediaPreviewController {
  stage: PreviewStage;
  /** The authenticated byte-serving URL this asset previews from — same URL a working preview
   *  uses as its `<img>`/`<video>` `src`, and what the "unsupported" placeholder's download link
   *  points at. */
  src: string;
  altText: string;
  /** Wired to the `<img>`'s `onError` — advances the fallback chain to the video probe. */
  handleImageError: () => void;
  /** Wired to the `<video>`'s `onError` — advances the fallback chain to the placeholder. */
  handleVideoError: () => void;
}

/**
 * @complexity Time/space: O(1) — one state transition per probe failure, no iteration.
 */
export function useMediaPreview(item: AdminMedia): MediaPreviewController {
  const [stage, setStage] = useState<PreviewStage>("image");
  const src = api.mediaOriginalUrl(item.id);
  const altText = mediaAltText(item);

  function handleImageError() {
    setStage("video");
  }
  function handleVideoError() {
    setStage("unsupported");
  }

  return { stage, src, altText, handleImageError, handleVideoError };
}
