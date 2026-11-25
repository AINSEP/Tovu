import { agentHandle } from "@jini-ai/core/agent-handles";
import { EmbedInsertControl as JiniEmbedInsertControl } from "@jini-ai/cms/react/widgets/EmbedInsertControl/EmbedInsertControl";
import { t as translateForEmbedInsertControl } from "@jini-ai/admin/shell/components/shared-components-i18n";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { MediaPickerDialog } from "../MediaPickerDialog/media-picker-host";
import { WidgetPickerDialog, WidgetSelectionDialog } from "../WidgetPickerDialog/WidgetPickerDialog";
import { useEmbedInsertControl, type EmbedEditor } from "./EmbedInsertControl.hooks";

/**
 * @file The host mount of `@jini-ai/cms`'s `EmbedInsertControl` — the post editor toolbar's single
 * "Embed" trigger (Media, Form, Menu, Gallery, Widget…). Binds the real state hook, the admin
 * locale, the shared-components dictionary, agent-handle attributes, and Tovu's mounted media
 * picker and widget dialogs. See the Jini component for the menu/agent-handle scheme.
 */

export interface EmbedInsertControlProps {
  editor: EmbedEditor | null;
  /** Injectable seam for the menu/dialog visibility state and the pinned Form/Menu/Gallery
   *  add-control instances. Defaults to the bound {@link useEmbedInsertControl}. */
  useEmbed?: typeof useEmbedInsertControl;
  /** This control's own base handle. Omit to leave every element (and every dialog it opens) untagged. */
  agentHandle?: string;
  useAdminLocaleHook?: typeof useAdminLocale;
}

export function EmbedInsertControl({ useEmbed = useEmbedInsertControl, useAdminLocaleHook = useAdminLocale, agentHandle: base, editor }: EmbedInsertControlProps) {
  return <JiniEmbedInsertControl editor={editor} useEmbed={({ editor: current }) => useEmbed({ editor: current })}
    useAdminLocaleHook={useAdminLocaleHook} translate={translateForEmbedInsertControl} agentHandleAttributes={agentHandle}
    MediaPickerDialog={MediaPickerDialog} WidgetPickerDialog={WidgetPickerDialog} WidgetSelectionDialog={WidgetSelectionDialog}
    {...(base === undefined ? {} : { agentHandle: base })} />;
}
