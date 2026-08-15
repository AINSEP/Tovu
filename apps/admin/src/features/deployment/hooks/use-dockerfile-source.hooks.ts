import { useState } from "react";

import { describeApiError, type AdminDockerfileSource } from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as defaultT, dockerfileLoadErrorMessage } from "../deployment-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import { defaultDockerfileSourcePort } from "./dockerfile-source-dependencies.hooks";
import type { DockerfileSourcePort } from "./dockerfile-source-port.hooks";

/**
 * @file Everything the Dockerfile tab does — data plus the copy-to-clipboard interaction — so
 * `DockerfileTab.tsx` is only markup. Copy lives here rather than as component-local state (unlike
 * `ThemeExplore.tsx`'s device-width/fullscreen carve-out, which is pure view chrome with nothing to
 * inject): copying reads the fetched `snapshot.contents`, the same "acts on data this hook already
 * owns" shape `use-edit-media-panel.hooks.ts`'s `copyHash`/`copyUrl` follow. Download is NOT here —
 * it has no state of its own to expose (no "downloaded" flag makes sense the way "copied" does), so
 * it stays a plain local handler in `DockerfileTab.tsx` that reads `snapshot.contents` directly.
 *
 * Same read-only single-query shape as `use-deployment-overview.hooks.ts` otherwise; see that
 * file's header for the fuller rationale on the port/dependencies split.
 */
export interface DockerfileSourceController {
  /** `undefined` until the first successful load — `DockerfileTab.tsx` renders the loading state. */
  snapshot: AdminDockerfileSource | undefined;
  /** Already-formatted, translated message — `null` while loading or once loaded successfully. */
  error: string | null;
  /** True for a short window right after a successful {@link copy} — drives the button's
   *  "Copied!" label. Mirrors `copyHash`'s `setTimeout(..., 1500)` reset in
   *  `use-edit-media-panel.hooks.ts`. */
  copied: boolean;
  /** Writes `snapshot.contents` to the clipboard, if there's anything to write. Swallows a denied
   *  clipboard permission the same way `copyHash`/`copyUrl` do — the source is still visible and
   *  selectable in the viewer itself, so a failed copy degrades to "select manually". */
  copy: () => Promise<void>;
  /** Bound translator — see this file's header. */
  t: Translate;
}

export function useDockerfileSource(
  port: DockerfileSourcePort,
  t: Translate,
  locale: string
): DockerfileSourceController {
  const query = useFetchQuery({
    key: ["deployment", "dockerfile"],
    fetch: () => port.getDockerfileSource(),
  });
  const [copied, setCopied] = useState(false);

  const error = query.error
    ? dockerfileLoadErrorMessage(locale, describeApiError(query.error, "unknown error"))
    : null;

  async function copy() {
    const contents = query.data?.contents;
    if (!contents) return;
    try {
      await navigator.clipboard.writeText(contents);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — see this file's header.
    }
  }

  return { snapshot: query.data, error, copied, copy, t };
}

/**
 * Binds the real `/api/.../system/dockerfile` client, and a `t` bound to the real resolved locale.
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair — see
 * `use-deployment-overview.hooks.ts`'s `useWiredDeploymentOverview` for the identical shape.
 */
export function useWiredDockerfileSource(): DockerfileSourceController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useDockerfileSource(defaultDockerfileSourcePort, t, locale);
}
