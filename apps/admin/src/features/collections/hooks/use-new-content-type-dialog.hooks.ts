import { useState } from "react";

import { describeApiError } from "../../../lib/api";
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
import { defaultNewContentTypeDialogPort } from "./new-content-type-dialog-dependencies.hooks";
import type { NewContentTypeDialogPort } from "./new-content-type-dialog-port.hooks";

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
 *
 * `port`/`locale` are injected — see `new-content-type-dialog-port.hooks.ts` — rather than reaching
 * `lib/api`/`useAdminLocale()` directly, so a test can describe the submit outcome against
 * `createFakeNewContentTypeDialogPort` instead of stubbing global `fetch`.
 * `useWiredNewContentTypeDialog` below is the pair `Collections.tsx` actually mounts.
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

export interface NewContentTypeDialogDependencies {
  port: NewContentTypeDialogPort;
  locale: string;
}

export function useNewContentTypeDialog(
  props: {
    onCreated: () => void;
    onCancel: () => void;
  },
  deps: NewContentTypeDialogDependencies
): NewContentTypeDialogController {
  const { port, locale } = deps;
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
      await port.createContentType({
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

/**
 * Binds the real `/api/.../content-types` client and the resolved `useAdminLocale()` value — see
 * `new-content-type-dialog-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Collections.tsx` composes this and a test composes
 * {@link useNewContentTypeDialog} with `createFakeNewContentTypeDialogPort`.
 */
export function useWiredNewContentTypeDialog(props: {
  onCreated: () => void;
  onCancel: () => void;
}): NewContentTypeDialogController {
  const locale = useAdminLocale();
  return useNewContentTypeDialog(props, { port: defaultNewContentTypeDialogPort, locale });
}
