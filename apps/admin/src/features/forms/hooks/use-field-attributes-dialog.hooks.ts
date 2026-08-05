import { useState } from "react";

import type { AdminFormField } from "../../../lib/api";
import { addAttrRow, attrRowsFromField, buildFieldAttributesPatch, removeAttrRow, updateAttrRow, type AttrRow } from "../rules";
import { useEscapeToCancel } from "./use-escape-to-cancel.hooks";

/**
 * @file `FieldAttributesDialog`'s own state and submit action (per-field CSS classes + HTML
 * attributes), so the dialog in `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same validation, same error strings. Draft-row editing and the
 * validate/shape step now live in `rules.ts` (`updateAttrRow`/`removeAttrRow`/`addAttrRow`,
 * `buildFieldAttributesPatch`).
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
 */

export interface FieldAttributesDialogController {
  className: string;
  setClassName: (value: string) => void;
  rows: AttrRow[];
  updateRow: (rowId: number, patch: Partial<AttrRow>) => void;
  removeRow: (rowId: number) => void;
  addRow: () => void;
  error: string | null;
  submit: (e: React.FormEvent) => void;
}

export function useFieldAttributesDialog(props: {
  field: AdminFormField;
  onSave: (patch: Partial<AdminFormField>) => void;
  onCancel: () => void;
}): FieldAttributesDialogController {
  const [className, setClassName] = useState(props.field.className ?? "");
  const [rows, setRows] = useState<AttrRow[]>(() => attrRowsFromField(props.field));
  const [error, setError] = useState<string | null>(null);

  useEscapeToCancel(props.onCancel);

  function updateRow(rowId: number, patch: Partial<AttrRow>) {
    setRows((current) => updateAttrRow(current, rowId, patch));
  }
  function removeRow(rowId: number) {
    setRows((current) => removeAttrRow(current, rowId));
  }
  function addRow() {
    setRows((current) => addAttrRow(current));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const result = buildFieldAttributesPatch({ className, rows });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onSave(result.patch);
  }

  return { className, setClassName, rows, updateRow, removeRow, addRow, error, submit };
}
