import { useState } from "react";
import type { AdminMedia } from "../../lib/api";
import { defaultMediaPickerPort } from "../../components/MediaPickerDialog/media-picker-dependencies.hooks";
import type { MediaPickerPort } from "../../components/MediaPickerDialog/media-picker-port.hooks";
import { buildMediaRef, resolveMediaRefPreviewUrl } from "./rules";

/**
 * @file `MediaRefField`'s picker-open state, selection, and clear/preview wiring — colocated with
 * the component per the `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern (`SitemapModal.tsx`/
 * `SitemapModal.hooks.tsx`, `TabBar.tsx`/`TabBar.hooks.tsx`), so `MediaRefField.tsx` stays
 * props-and-JSX only.
 *
 * `value`/`onChange` are the field's OWN controlled value, not something this hook owns — the
 * three call sites (`Seo.tsx`'s `defaultOgImage`, and `SeoEntryPanel`'s `ogImage`/`twitterImage`)
 * each already have their own state (`useState`, or `fieldValue`/`setField`); this hook only adds
 * the picker dialog's visibility and the two ways a selection/clear can change that value.
 *
 * `port` is injected the same `useX(dependencies)` / `useWiredX()` way every other hook in this
 * app is (see `media-picker-port.hooks.ts`) so a test can describe "selecting this item writes this
 * exact ref" against `createFakeMediaPickerPort` without a real `api.mediaOriginalUrl` call.
 */

export interface MediaRefFieldController {
  /** Whether `MediaPickerDialog` is open. */
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  /** `MediaPickerDialog`'s `onSelect` — writes the exact `{assetId}:public` ref
   *  (`buildMediaRef`, `rules.ts`) into the field and closes the dialog. */
  handleSelect: (item: AdminMedia) => void;
  /** Clears the field to `""` — an OG image must be removable (SPEC intent). */
  clear: () => void;
  /** The field's current value resolved to a thumbnail `<img src>`, or `null` when the value is
   *  empty or unparseable — see `resolveMediaRefPreviewUrl`'s own doc. */
  previewUrl: string | null;
}

export function useMediaRefField(
  value: string,
  onChange: (value: string) => void,
  deps: { port: MediaPickerPort }
): MediaRefFieldController {
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleSelect(item: AdminMedia) {
    onChange(buildMediaRef(item.id));
    setPickerOpen(false);
  }

  return {
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    handleSelect,
    clear: () => onChange(""),
    previewUrl: resolveMediaRefPreviewUrl(value, deps.port.mediaOriginalUrl),
  };
}

/**
 * Binds the real `/api/.../media` client — see `media-picker-dependencies.hooks.ts`. The
 * zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `MediaRefField.tsx` composes this and a test composes {@link useMediaRefField} with
 * `createFakeMediaPickerPort`.
 */
export function useWiredMediaRefField(value: string, onChange: (value: string) => void): MediaRefFieldController {
  return useMediaRefField(value, onChange, { port: defaultMediaPickerPort });
}
