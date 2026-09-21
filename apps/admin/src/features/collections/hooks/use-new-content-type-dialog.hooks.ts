import { useRef, useState, type RefObject } from "react";

import { describeApiError } from "@/lib/api";
import { useFetchMutation } from "@/lib/fetch-query";
import {
  addDraftField,
  emptyField,
  KEYS,
  removeDraftField,
  stripDraftFieldRowIds,
  updateDraftField,
  validateNewContentTypeDraft,
  type DraftField,
} from "../rules";
import { useEscapeToCancel } from "./use-escape-to-cancel.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useFocusTrap } from "@/hooks/use-focus-trap.hooks";
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
 *
 * `lib/fetch-query` migration (2026-08-12): `createContentType` is a `useFetchMutation` that
 * `invalidates: [KEYS.list]` instead of `props.onCreated`'s caller (`Collections.tsx`) reloading by
 * hand.
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
  /** Backdrop/Cancel/Escape all route here instead of `props.onCancel` directly — a no-op while
   * `createContentType` is in flight, so those dismiss paths can't unmount the dialog out from
   * under its own pending write (H4). */
  cancel: () => void;
  /** Attach to the dialog's own `role="dialog"` root so `useFocusTrap` (M3) can find it. */
  dialogRef: RefObject<HTMLFormElement | null>;
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const dialogRef = useRef<HTMLFormElement | null>(null);

  function cancel() {
    if (inFlightRef.current) return;
    props.onCancel();
  }

  useEscapeToCancel(cancel);
  useFocusTrap(dialogRef);

  const createMutation = useFetchMutation({
    run: (input: { key: string; label: string; fields: ReturnType<typeof stripDraftFieldRowIds> }) =>
      port.createContentType(input),
    invalidates: [KEYS.list],
  });

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
    setValidationError(null);

    const draftError = validateNewContentTypeDraft({ key, label, fields });
    if (draftError) {
      setValidationError(draftError);
      return;
    }

    inFlightRef.current = true;
    try {
      await createMutation.mutate({
        key: key.trim(),
        label: label.trim(),
        fields: stripDraftFieldRowIds(fields),
      });
      props.onCreated();
    } catch {
      // already surfaced through createMutation.error -> error below
    } finally {
      inFlightRef.current = false;
    }
  }

  const saving = createMutation.status === "pending";
  const error = validationError ?? (createMutation.error ? describeApiError(createMutation.error, t(locale, "Failed to create content type")) : null);

  return { label, setLabel, key, setKey, fields, updateField, removeField, addField, error, saving, submit, cancel, dialogRef };
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
