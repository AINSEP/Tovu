import { useState } from "react";

import { type AdminContentType } from "../../../lib/api";
import {
  addDraftField,
  describeEditFieldsError,
  draftFieldsFromContentType,
  removeDraftField,
  stripDraftFieldRowIds,
  updateDraftField,
  validateEditFieldsDraft,
  type DraftField,
} from "../rules";
import { useEscapeToCancel } from "./use-escape-to-cancel.hooks";
import { defaultEditFieldsDialogPort } from "./edit-fields-dialog-dependencies.hooks";
import type { EditFieldsDialogPort } from "./edit-fields-dialog-port.hooks";

/**
 * @file `EditFieldsDialog`'s own state and submit action (SPEC-037 REQ-05 — post-creation
 * field-schema editing), so the dialog in `Collections.tsx` is only markup.
 *
 * Extracted verbatim — same state, same validation, same `409`-vs-generic error split (now
 * `describeEditFieldsError` in `rules.ts`). Draft-field list editing shares `rules.ts` helpers
 * with `use-new-content-type-dialog.hooks.ts`, including the row-id counter — see that module's
 * header for why it has to stay one shared instance.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/collections` needs it.
 *
 * `port` is injected — see `edit-fields-dialog-port.hooks.ts` — rather than importing `lib/api`
 * directly, so a test can describe the submit outcome against `createFakeEditFieldsDialogPort`
 * instead of stubbing global `fetch`. `useWiredEditFieldsDialog` below is the pair `Collections.tsx`
 * actually mounts. No `locale`/`useAdminLocale` here — `describeEditFieldsError` never resolves a
 * translated string (unlike `use-new-content-type-dialog.hooks.ts`'s `t(locale, ...)` fallback).
 */

export interface EditFieldsDialogController {
  fields: DraftField[];
  updateField: (rowId: number, patch: Partial<DraftField>) => void;
  removeField: (rowId: number) => void;
  addField: () => void;
  error: string | null;
  saving: boolean;
  submit: (e: React.FormEvent) => void;
}

export function useEditFieldsDialog(
  props: {
    contentType: AdminContentType;
    onSaved: () => void;
    onCancel: () => void;
  },
  port: EditFieldsDialogPort
): EditFieldsDialogController {
  const [fields, setFields] = useState<DraftField[]>(() => draftFieldsFromContentType(props.contentType.fields));
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

    const validationError = validateEditFieldsDraft(fields);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await port.updateContentTypeFields({
        key: props.contentType.key,
        fields: stripDraftFieldRowIds(fields),
        expectedVersion: props.contentType.version,
      });
      props.onSaved();
    } catch (e) {
      setError(describeEditFieldsError(e));
    } finally {
      setSaving(false);
    }
  }

  return { fields, updateField, removeField, addField, error, saving, submit };
}

/**
 * Binds the real `/api/.../content-types/{key}/fields` client — see
 * `edit-fields-dialog-dependencies.hooks.ts`.
 *
 * The zero-argument-port half of the `useX(dependencies)` / `useWiredX()` pair, so `Collections.tsx`
 * composes this and a test composes {@link useEditFieldsDialog} with
 * `createFakeEditFieldsDialogPort`.
 */
export function useWiredEditFieldsDialog(props: {
  contentType: AdminContentType;
  onSaved: () => void;
  onCancel: () => void;
}): EditFieldsDialogController {
  return useEditFieldsDialog(props, defaultEditFieldsDialogPort);
}
