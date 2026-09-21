import { useCallback, useRef, useState } from "react";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as composioT } from "../composio-i18n";
import type { ComposioConfigController } from "./use-composio-config.hooks";

/**
 * @file `ComposioKeyField`'s own draft-input state, split out of the component per the
 * `use-<thing>.hooks.ts` convention this feature's other hooks (`use-composio-config.hooks.ts`)
 * already use.
 *
 * No `-port.hooks.ts`/`-dependencies.hooks.ts` pair: this hook does no I/O of its own. The actual
 * save/clear round trip lives behind `composio.save`/`composio.clear`, already an injected
 * dependency `ComposioKeyField` receives as a prop from its caller (`useWiredComposioConfig`) — the
 * same reasoning `WidgetConfigFields.tsx`'s sub-components give for not re-injecting a hook that is
 * itself a caller-supplied argument.
 */

export interface ComposioKeyFieldController {
  /** The in-progress, unsaved key text. */
  draft: string;
  setDraft: (value: string) => void;
  /** Whether a key is currently saved for this workspace. */
  configured: boolean;
  /** Whether a save is in flight — disables the input/buttons while true. */
  busy: boolean;
  /** The input's placeholder — swaps to "Replace saved key" once a key is already configured, so
   *  the empty field doesn't read as "nothing saved" when something is. Derived here (2026-09-04,
   *  complexity-ceiling pass) rather than as a `configured ? ... : ...` ternary in `ComposioKeyField`
   *  itself, the same "derive it beside the boolean it branches on" move `configured`/`busy`
   *  themselves already use below. */
  placeholder: string;
  /** Trims `draft`, saves it via `composio.save`, then clears `draft`. A blank/whitespace-only
   *  draft is a no-op, and a second call while the first is still in flight is also a no-op — see
   *  {@link useComposioKeyField}'s own `savingRef` doc. `composio.save` is `useComposioConfig`'s
   *  `write`, which catches internally and never rejects — so in practice the clear always runs,
   *  error or not, and a secret never lingers in the DOM after a failed save. That guarantee holds
   *  only because `save` doesn't reject: the `await` above is unguarded, so a caller-supplied `save`
   *  that does reject would skip the clear entirely (pre-existing behavior, carried over unchanged
   *  from the pre-extraction component). */
  onSave: () => Promise<void>;
  /** This field's own bound translator (`composio-i18n.ts`) — threaded down rather than resolved a
   *  second time in `ComposioKeyField.tsx`, matching every other `use<Feature>.hooks.ts`/
   *  `<Feature>.tsx` split in this app (`use-access-tokens.hooks.ts`, `use-redirects.hooks.ts`, …).
   *  Security finding #6 (Low, 2026-09-20 terra review): this field had no translator at all. */
  t: Translate;
}

/**
 * Owns the Composio key field's draft text and derives its configured/busy display state from the
 * injected `composio` controller.
 *
 * @param composio - The already-wired Composio config controller (save/clear/config/saveState).
 * @param t - This field's own bound translator — injected rather than resolved here, the same
 *   `useX(deps, t, locale)` shape `use-access-tokens.hooks.ts`/`use-redirects.hooks.ts` already use,
 *   so a test can pass a trivial fake instead of needing a real locale fetch. {@link
 *   useWiredComposioKeyField} is the zero-locale-argument pair that binds the real one.
 * @returns `draft`/`setDraft`, `configured`, `busy`, `onSave`, and `t`.
 * @complexity Time/space: O(1) — one derived boolean pair plus the save round trip `composio.save`
 *   itself already accounts for.
 */
export function useComposioKeyField(composio: ComposioConfigController, t: Translate): ComposioKeyFieldController {
  const [draft, setDraft] = useState("");
  const configured = composio.config?.configured ?? false;
  const busy = composio.saveState === "saving";
  const placeholder = configured ? "Replace saved key" : "comp_...";

  // Synchronous duplicate-submit guard for `onSave` — a `useRef`, not `busy` (which mirrors
  // `composio.saveState`), because a true double-click can fire two calls in the same synchronous
  // tick, before React has re-rendered with `saveState: "saving"`; `busy` still exists to let the
  // view disable the save button, but the guard that actually stops a second `composio.save` call
  // has to be synchronous. Same shape and same reasoning as `use-static-publish.hooks.ts`'s own
  // `publishingRef` (finding 30, 2026-09-05 admin-tooling audit).
  const savingRef = useRef(false);

  async function onSave(): Promise<void> {
    const apiKey = draft.trim();
    if (!apiKey) return;
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await composio.save(apiKey);
      setDraft("");
    } finally {
      savingRef.current = false;
    }
  }

  return { draft, setDraft, configured, busy, placeholder, onSave, t };
}

/**
 * The zero-locale-argument pair every screen actually mounts — binds the real locale (`useAdminLocale()`,
 * called here and ONLY here, matching `use-redirects.hooks.ts`'s identical `useWiredRedirects` split)
 * and delegates to {@link useComposioKeyField}. `ComposioKeyField.tsx`'s `useKeyField` prop defaults
 * to this, not to the bare hook, so its one-argument `useKeyField(composio)` call site needs no change.
 * @complexity O(1) plus `useAdminLocale`'s own cost.
 */
export function useWiredComposioKeyField(composio: ComposioConfigController): ComposioKeyFieldController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => composioT(locale, key), [locale]);
  return useComposioKeyField(composio, t);
}
