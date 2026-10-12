import { Icon } from "@jini-ai/ui";
import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";
import "../../styles/media-content-editor.css";
import { DockHeaderTip } from "../AssistantDock/DockHeaderTip";
import { useHtmlAttributeRows } from "./HtmlAttributeRows.hooks";

/**
 * @file `HtmlAttributeRows` — key = value rows that edit one `htmlAttributes` string, with a
 * "Dropped when rendered" flag per unsafe row. ONE component for the widget editor's Media tab
 * and the `widgetEmbed` node's Style dialog (owner, 2026-10-11: the dialog had a single text box
 * while the editor had rows). Markup only; state is in `HtmlAttributeRows.hooks.ts`. The host
 * renders the "HTML attributes" label. Given `agentHandle`, the add button is `<base>-attribute-add`.
 */

export interface HtmlAttributeRowsProps {
  value: string;
  onChange: (value: string) => void;
  /** Shared-components dictionary translator; omit for the English source strings. */
  t?: Translate;
  agentHandle?: string;
  /** Injectable seam for the state hook. */
  useRows?: typeof useHtmlAttributeRows;
}

export function HtmlAttributeRows({ value, onChange, t = (key) => key, agentHandle: base, useRows = useHtmlAttributeRows }: HtmlAttributeRowsProps) {
  const vm = useRows({ value, onChange });
  return (
    <div className="html-attribute-rows">
      {vm.rows.map((row, index) => (
        // Index keys: rows have no id and their names are being typed.
        <div key={index} className="html-attribute-rows__row">
          <input className="field-mono html-attribute-rows__name" value={row.name} placeholder="data-kui" spellCheck={false}
            aria-label={`${t("Attribute name")} ${index + 1}`} aria-invalid={vm.dropped[index] ? true : undefined}
            onChange={(event) => vm.setRow(index, { name: event.target.value.trim() })} />
          <span aria-hidden="true">=</span>
          <input className="field-mono html-attribute-rows__value" value={row.value} spellCheck={false}
            aria-label={`${t("Attribute value")} ${index + 1}`} onChange={(event) => vm.setRow(index, { value: event.target.value })} />
          <DockHeaderTip label={t("Remove")}>
            <button type="button" className="btn-ghost media-content-editor__icon"
              aria-label={`${t("Remove")} ${row.name || index + 1}`} onClick={() => vm.removeRow(index)}>
              <Icon name="close" size={14} aria-hidden="true" />
            </button>
          </DockHeaderTip>
          {vm.dropped[index] ? <span className="field-error">{t("Dropped when rendered")}</span> : null}
        </div>
      ))}
      <button type="button" className="btn-ghost media-content-editor__compact" onClick={vm.addRow}
        {...(base ? agentHandle({ handle: `${base}-attribute-add` }, { role: "button", label: "Add an HTML attribute row" }) : {})}>
        <Icon name="plus" size={14} aria-hidden="true" />
        {t("Add attribute")}
      </button>
    </div>
  );
}
