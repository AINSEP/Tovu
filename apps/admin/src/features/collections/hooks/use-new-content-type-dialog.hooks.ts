import { useState } from "react";

import { api, describeApiError } from "../../../lib/api";
import {
  addDraftField,
  emptyField,
  removeDraftField,
  stripDraftFieldRowIds,
  updateDraftField,
  validateNewContentTypeDraft,
  type DraftField,
} from "../rules";
import { useEscapeToCancel } from "./use-escape-to-cancel.hooks";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../collections-i18n";

/**
 * @file `NewContentTypeDialog`'s own state and submit action (design-spec.md §1.3), so the dialog
 * in `Collections.tsx` is only markup.
 *
 * Extracted verbatim — same state, same validation order, same error strings. Draft-field list
 * editing (`updateField`/`removeField`/`addField`) and the row-id counter it depends on now live in
 * `rules.ts`, shared with `use-edit-fields-dialog.hooks.ts` — see that file's header for why the
 * counter has to stay a single shared instance rather than one per hook.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/collections` needs it.
 */

export interface NewContentTypeDialogController {
  label: string;
  setLabel: (value: string) => void;
  key: string;
  setKey: (value: string) => void;
  fields: DraftField[];
  updateField: (rowId: number, patch: Partial<DraftField>) => void;
  removeField: (rowId: number) => void;
  addField: () => void;
  error: string | null;
  saving: boolean;
  submit: (e: React.FormEvent) => void;
}

export function useNewContentTypeDialog(props: {
  onCreated: () => void;
  onCancel: () => void;
}): NewContentTypeDialogController {
  const locale = useAdminLocale();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [fields, setFields] = useState<DraftField[]>([emptyField()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEscapeToCancel(props.onCancel);

  function updateField(rowId: number, patch: Partial<DraftField>) {
    setFields((current) => updateDraftField(current, rowId, patch));
  }

  function removeField(rowId: number) {
    setFields((current) => removeDraftField(current, rowId));
  }

  function addField() {
    setFields((current) => addDraftField(current));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateNewContentTypeDraft({ key, label, fields });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await api.createContentType({
        key: key.trim(),
        label: label.trim(),
        fields: stripDraftFieldRowIds(fields),
      });
      props.onCreated();
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to create content type")));
    } finally {
      setSaving(false);
    }
  }

  return { label, setLabel, key, setKey, fields, updateField, removeField, addField, error, saving, submit };
}
