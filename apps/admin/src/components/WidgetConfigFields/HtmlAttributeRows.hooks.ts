import { useState } from "react";
import { htmlAttributesToRows, isDroppedAttributeRow, rowsToHtmlAttributes, type HtmlAttributeRow } from "./media-content-rules";

/**
 * @file State for `HtmlAttributeRows.tsx` — key = value rows over ONE stored `htmlAttributes`
 * string (the contract's shape). Shared by the widget editor (`MediaContentEditor`) and the
 * `widgetEmbed` node's Style dialog, so both edit attributes the same way (owner, 2026-10-11).
 */

export interface HtmlAttributeRowsController {
  rows: HtmlAttributeRow[];
  /** Per row: the renderer's allowlist will drop it. */
  dropped: boolean[];
  setRow: (index: number, patch: Partial<HtmlAttributeRow>) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
}

/**
 * The rows are local: a half-typed row (no name yet) serializes to nothing and would vanish on the
 * next render if rows were re-derived from the stored string. They are re-read only when the
 * string changes from outside (a reload, a different widget), never because of our own emit.
 *
 * @param required.value - The stored `htmlAttributes` string (`""` for none).
 * @param required.onChange - Receives the re-serialized string after every row edit.
 * @returns {@link HtmlAttributeRowsController}.
 * @complexity O(r) per render for r rows.
 */
export function useHtmlAttributeRows(required: { value: string; onChange: (value: string) => void }): HtmlAttributeRowsController {
  const { value, onChange } = required;
  const [attributes, setAttributes] = useState(() => ({ source: value, rows: htmlAttributesToRows(value) }));
  const rows = attributes.source === value ? attributes.rows : htmlAttributesToRows(value);
  if (attributes.source !== value) setAttributes({ source: value, rows });

  function commit(next: HtmlAttributeRow[]) {
    const source = rowsToHtmlAttributes(next);
    setAttributes({ source, rows: next });
    onChange(source);
  }

  return {
    rows,
    dropped: rows.map(isDroppedAttributeRow),
    setRow: (index, patch) => commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row))),
    // A blank row serializes to nothing, so adding one emits nothing.
    addRow: () => setAttributes({ source: value, rows: [...rows, { name: "", value: "" }] }),
    removeRow: (index) => commit(rows.filter((_, i) => i !== index)),
  };
}
