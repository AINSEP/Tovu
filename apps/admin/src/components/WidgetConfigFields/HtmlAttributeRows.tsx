import { Icon } from "@jini-ai/ui";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { HtmlAttributeRows as JiniHtmlAttributeRows } from "@jini-ai/cms/react/widgets/WidgetConfigFields/HtmlAttributeRows";

import "../../styles/media-content-editor.css";
import { DockHeaderTip } from "@jini-ai/admin/shell/components/AssistantDock/DockHeaderTip";
import { useHtmlAttributeRows } from "@jini-ai/admin/shell/components/WidgetConfigFields/HtmlAttributeRows.hooks";
import { htmlAttributesToRows, isDroppedAttributeRow as isDroppedRow, rowsToHtmlAttributes, type HtmlAttributeRow } from "@jini-ai/admin/shell/components/WidgetConfigFields/media-content-rules";
import { embedPolicy } from "../../integrations/jini-admin/embed-policy-ports";
import { type Translate } from '@jini-ai/core/text';

/** The host binds the content domain's embed policy into the shell's dropped-row rule. */
const isDroppedAttributeRow = (row: HtmlAttributeRow) => isDroppedRow({ row, policy: embedPolicy });

/**
 * @file The host mount of `@jini-ai/cms`'s `HtmlAttributeRows`: binds Tovu's embed policy (the
 * dropped-row rule), the shell's parser/serializer and state hook, the kit icon and tip, and the
 * stylesheet. Sanitization and the allowed-attribute policy stay host-owned.
 */

export interface HtmlAttributeRowsProps {
  value: string;
  onChange: (value: string) => void;
  /** Shared-components dictionary translator; omit for the English source strings. */
  t?: Translate;
  agentHandle?: string;
  /** Injectable seam for the state hook (tests pass a fake controller). */
  useRows?: typeof useHtmlAttributeRows;
}

export function HtmlAttributeRows({ t, useRows = useHtmlAttributeRows, ...props }: HtmlAttributeRowsProps) {
  return <JiniHtmlAttributeRows {...props} {...(t ? { t: (key: string) => t(key) } : {})} useRows={useRows}
    htmlAttributesToRows={htmlAttributesToRows} rowsToHtmlAttributes={rowsToHtmlAttributes} isDroppedAttributeRow={isDroppedAttributeRow}
    Icon={Icon} Tip={DockHeaderTip} agentHandleAttributes={agentHandle} />;
}
