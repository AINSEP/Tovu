import { t as translateForEmbedInsertControl } from "@jini-ai/admin/shell/components/shared-components-i18n";
import type { WidgetPickerPort } from "@jini-ai/admin/shell/components/WidgetPickerDialog/widget-picker-port.hooks";
import {
  createEmbedInsertControlTranslator as jiniCreateEmbedInsertControlTranslator,
  useEmbedInsertControl as useJiniEmbedInsertControl,
  type EmbedEditor,
} from "@jini-ai/cms/react/widgets/EmbedInsertControl/EmbedInsertControl.hooks";
import { useWidgetAddControl } from "../WidgetPickerDialog/WidgetPickerDialog.hooks";
import { uniqueId } from "@jini-ai/admin/shell/lib/unique-id";

/**
 * @file The host binding of `@jini-ai/cms`'s `useEmbedInsertControl`: Tovu's widget add-control
 * hook and placement-id minting, and the shared-components dictionary for its copy.
 */

export type { EmbedEditor };

/** Same placement-id minting `widget-embed-extension.tsx` uses: a bare UUID, or a `placement-`
 *  prefixed fallback id where the browser has no `crypto.randomUUID`. */
function newPlacementId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `placement-${uniqueId()}`;
}

/** The bound state hook; `widgetPort` and `mintPlacementId` stay injectable for tests. */
export function useEmbedInsertControl({ editor }: { editor: EmbedEditor | null }, { widgetPort, mintPlacementId = newPlacementId }: { widgetPort?: WidgetPickerPort; mintPlacementId?: () => string } = {}) {
  return useJiniEmbedInsertControl({ editor, useWidgetAddControlHook: useWidgetAddControl, mintPlacementId }, widgetPort ? { widgetPort } : {});
}

/** Bind this screen's copy to the current locale. */
export function createEmbedInsertControlTranslator({ locale }: { locale: string }, _options = {}) {
  return jiniCreateEmbedInsertControlTranslator({ locale, translate: translateForEmbedInsertControl });
}
