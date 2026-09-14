import { useEffect, useState } from "react";

import { t as mediaT } from "../../features/media/media-i18n";
import { describeMediaHtmlAttributeError, parseMediaHtmlAttributes } from "../../features/media/rules";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";

/**
 * @file `MediaEditDialog`'s draft/validation/Escape state, split out of the component so it can be
 * swapped for a fake via the `useDialog` prop on `MediaEditDialogProps` — same split
 * `MediaPickerDialog`/`MediaPickerDialog.hooks.tsx` uses.
 *
 * Per-post media editing (2026-09-11, owner-directed per-post styling, then a same-day UI revision
 * widening it: the `media` node's node-view action is `Edit`, not `Style…` — see
 * `media-embed-extension.tsx`'s own header for the node-attrs half of this — and it edits THREE
 * fields, not two: `alt` joins `cssClass`/`htmlAttributes`. `alt` was previously only ever set at
 * insert time (`MediaPickerDialog`'s `item.alt || item.title`); this is the first way to change it
 * per-instance afterward.
 *
 * `cssClass`/`htmlAttributes` reuse the EXACT same validators `use-edit-media-panel.hooks.ts`
 * already drives its asset-level fields through (`parseMediaHtmlAttributes`/
 * `describeMediaHtmlAttributeError`, `features/media/rules.ts`), per this task's "reuse the
 * existing validation, do not write a new parser" directive. `alt` carries NO allowlist/validation
 * of any kind — free accessibility text, same as the asset-level field's own `alt`.
 *
 * `save()` never gates on `htmlAttributesError` — same "the hint is a UX convenience only, the
 * server/render-time allowlist is the real boundary" contract `use-edit-media-panel.hooks.ts`'s own
 * header documents for the asset-level field (incident `a7cce060`: an earlier version of THAT field
 * blocked saving on this exact hint, silently reverting unrelated edits too). The equivalent
 * boundary here is `render.ts`'s `resolveMediaHtmlAttributes`, which independently re-parses and
 * fails closed at render time regardless of what this dialog let through.
 */

/** The `media` node's current per-instance attrs this dialog edits — `null` means "not set".
 *  `cssClass`/`htmlAttributes` inherit the asset's own same-named value when unset (see `render.ts`'s
 *  `mediaNodeStyleOverride` for that render-time precedence); `alt` has no such asset-level fallback
 *  — it is purely per-node, same as before this dialog existed. */
export interface MediaEditDialogValue {
  alt: string | null;
  cssClass: string | null;
  htmlAttributes: string | null;
}

/** What {@link useMediaEditDialog} (and {@link useWiredMediaEditDialog}) hands back to
 *  `MediaEditDialog.tsx` — the dialog's full render-time contract. */
export interface MediaEditDialogController {
  /** Current draft text — `null` seeds as `""`, never a literal "null" string in the input. */
  alt: string;
  cssClass: string;
  htmlAttributes: string;
  setAlt: (value: string) => void;
  setCssClass: (value: string) => void;
  setHtmlAttributes: (value: string) => void;
  /** The specific, visible allowlist-rejection message for the current `htmlAttributes` draft, or
   *  `null` when it parses clean (including empty/unset) — a live hint only, see this file's own
   *  header for why it must never gate {@link save}. `alt` has no equivalent field: it is never
   *  validated. */
  htmlAttributesError: string | null;
  /** Trims each field and reports blank as `null` (clearing a previously-set value), then calls
   *  the `onSave` this hook was given — unconditionally, regardless of {@link htmlAttributesError}. */
  save: () => void;
  /** Translates the dialog's own copy (`media-i18n.ts`, keyed by the English string) for the same
   *  locale the validation hint uses, so the component never reads the locale itself. */
  t: (key: string) => string;
}

/**
 * Owns `MediaEditDialog`'s draft state on top of the node's current attrs: three controlled text
 * fields, the live `htmlAttributes` validation hint, and the Escape-to-cancel listener.
 *
 * @param initial - The `media` node's current `alt`/`cssClass`/`htmlAttributes` attrs.
 * @param onSave - Called with the new `{alt, cssClass, htmlAttributes}` triple on Save — the
 *   caller (`MediaEmbedNodeView`) forwards this straight into `props.updateAttributes`.
 * @param onCancel - Called on Escape, backdrop click, or the Cancel button.
 * @param deps - Injected dependencies; `deps.locale` drives {@link describeMediaHtmlAttributeError}
 *   and the returned `t`.
 * @returns The dialog's full render-time contract — see {@link MediaEditDialogController}.
 * @complexity Time/space O(n) in the `htmlAttributes` draft's length (one validation parse per
 *   keystroke, same cost {@link parseMediaHtmlAttributes} itself documents).
 */
export function useMediaEditDialog(
  initial: MediaEditDialogValue,
  onSave: (value: MediaEditDialogValue) => void,
  onCancel: () => void,
  deps: { locale: string }
): MediaEditDialogController {
  const [alt, setAlt] = useState(initial.alt ?? "");
  const [cssClass, setCssClass] = useState(initial.cssClass ?? "");
  const [htmlAttributes, setHtmlAttributes] = useState(initial.htmlAttributes ?? "");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  const parsed = parseMediaHtmlAttributes(htmlAttributes);
  const htmlAttributesError = parsed.error ? describeMediaHtmlAttributeError(parsed.error, deps.locale) : null;

  function save() {
    onSave({
      alt: alt.trim() === "" ? null : alt,
      cssClass: cssClass.trim() === "" ? null : cssClass,
      htmlAttributes: htmlAttributes.trim() === "" ? null : htmlAttributes,
    });
  }

  const t = (key: string) => mediaT(deps.locale, key);

  return { alt, cssClass, htmlAttributes, setAlt, setCssClass, setHtmlAttributes, htmlAttributesError, save, t };
}

/**
 * Binds the real `useAdminLocale()` — the zero-argument-dependencies half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `MediaEditDialog.tsx` composes this and a test
 * composes {@link useMediaEditDialog} with a fixed `locale`.
 */
export function useWiredMediaEditDialog(
  initial: MediaEditDialogValue,
  onSave: (value: MediaEditDialogValue) => void,
  onCancel: () => void
): MediaEditDialogController {
  const locale = useAdminLocale();
  return useMediaEditDialog(initial, onSave, onCancel, { locale });
}
