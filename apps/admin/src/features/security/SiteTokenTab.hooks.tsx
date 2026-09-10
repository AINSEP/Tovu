import { useState } from "react";

/**
 * @file `SiteTokenTab.tsx`'s reveal panel's own copy-to-clipboard state — split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern (`AccessTokensTab.hooks.tsx`'s header). Mirrors
 * `use-dockerfile-source.hooks.ts`'s `copy`/`copied` shape (`setTimeout(..., 1500)` reset), scoped
 * to just this one value rather than that hook's whole load/save/copy controller.
 */

export interface RevealedKeyCopyState {
  copied: boolean;
  /** Swallows a denied clipboard permission (insecure context, blocked permission) the same way
   *  `use-dockerfile-source.hooks.ts`'s `copy` does — the key is still selectable/visible text on
   *  screen either way, so a failed copy never blocks the operator from saving it by hand. */
  copy: () => Promise<void>;
}

export function useRevealedKeyCopy(hex: string): RevealedKeyCopyState {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — see this file's header.
    }
  }

  return { copied, copy };
}
