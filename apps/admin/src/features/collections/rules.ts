import type { RowMenuItem } from "@jini-ai/admin/react";

import { ApiError, describeApiError, type AdminContentType, type ContentTypeFieldDef } from "../../lib/api";

/**
 * @file Pure logic for the `collections` feature (top-level Collections screen only — see
 * `CollectionEntries.tsx`/`CollectionEntryEditor.tsx` for the entry-level screens' own extraction)
 * — everything that computes a value rather than rendering one. Follows the convention
 * `features/posts/rules.ts` establishes: no React, no hooks, importable and directly testable.
 *
 * One deliberate exception to "pure": {@link emptyField} and {@link draftFieldsFromContentType}
 * both advance a shared, module-level `nextRowId` counter. It has to be ONE shared counter rather
 * than one per hook file — `NewContentTypeDialog` and `EditFieldsDialog` are mutually exclusive in
 * the UI, but the pre-extraction code already shared a single counter across both (open New,
 * cancel, then open Edit continues the same sequence rather than resetting), and splitting it into
 * two independent counters per hook file would be an observable behaviour change, not a neutral
 * refactor. Keeping it here, imported by both hook files, is what preserves the single instance —
 * ES modules are singletons, so both hooks see the same counter.
 */

const KEY_GRAMMAR = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED_KEYS = new Set(["post", "page"]);

/**
 * @complexity Time/space: O(1) — one regex test, one `Set` lookup.
 */
export function validateKey(key: string): string | null {
  if (!KEY_GRAMMAR.test(key)) {
    return "Key must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 chars).";
  }
  if (RESERVED_KEYS.has(key)) {
    return `"${key}" is a reserved key (built-in content already uses it).`;
  }
  return null;
}

/**
 * @complexity Time/space: O(1) — one regex test.
 */
export function validateFieldName(name: string): string | null {
  if (!KEY_GRAMMAR.test(name)) {
    return "Field name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Draft field list — shared shape/helpers behind both New/Edit dialogs' field editors
// ---------------------------------------------------------------------------

export interface DraftField extends ContentTypeFieldDef {
  /** Local-only row key so React can key rows before they have a stable identity. */
  _rowId: number;
}

let nextRowId = 1;

export function emptyField(): DraftField {
  return { _rowId: nextRowId++, name: "", kind: "text", required: false, queryable: false };
}

/** Seeds `EditFieldsDialog`'s draft list from a saved content type's fields, assigning each a
 *  fresh local row id off the same shared counter {@link emptyField} uses. */
export function draftFieldsFromContentType(fields: ContentTypeFieldDef[]): DraftField[] {
  return fields.map((f) => ({ ...f, _rowId: nextRowId++ }));
}

/** @complexity Time/space: O(n) in `fields.length`. */
export function updateDraftField(fields: DraftField[], rowId: number, patch: Partial<DraftField>): DraftField[] {
  return fields.map((f) => (f._rowId === rowId ? { ...f, ...patch } : f));
}

/** @complexity Time/space: O(n) in `fields.length`. */
export function removeDraftField(fields: DraftField[], rowId: number): DraftField[] {
  return fields.filter((f) => f._rowId !== rowId);
}

/** @complexity Time/space: O(n) in `fields.length`. */
export function addDraftField(fields: DraftField[]): DraftField[] {
  return [...fields, emptyField()];
}

/** Drops the local-only `_rowId` before a draft list is sent as an `api.*` payload.
 *  @complexity Time/space: O(n) in `fields.length`. */
export function stripDraftFieldRowIds(fields: DraftField[]): ContentTypeFieldDef[] {
  return fields.map(({ _rowId: _unused, ...f }) => f);
}

/**
 * The first field-name validation failure in a draft list, formatted the way both dialogs' submit
 * handlers show it — or `null` if every field's name is valid.
 *
 * @complexity Time/space: O(n) in `fields.length`, short-circuiting on the first failure.
 */
export function firstDraftFieldError(fields: DraftField[]): string | null {
  for (const f of fields) {
    const fieldError = validateFieldName(f.name.trim());
    if (fieldError) return `Field "${f.name || "(unnamed)"}": ${fieldError}`;
  }
  return null;
}

/**
 * Full validation pipeline for `NewContentTypeDialog`'s submit: key, then label, then every
 * field's name, in that order — the order the operator sees the errors matters (key/label are
 * checked before ever looking at the field rows).
 *
 * @complexity Time/space: O(n) in `fields.length`.
 */
export function validateNewContentTypeDraft(draft: { key: string; label: string; fields: DraftField[] }): string | null {
  const keyError = validateKey(draft.key.trim());
  if (keyError) return keyError;
  if (!draft.label.trim()) return "Label is required.";
  return firstDraftFieldError(draft.fields);
}

/**
 * Full validation pipeline for `EditFieldsDialog`'s submit: at least one field must remain (a
 * content type cannot be edited down to zero fields), then every remaining field's name.
 *
 * @complexity Time/space: O(n) in `fields.length`.
 */
export function validateEditFieldsDraft(fields: DraftField[]): string | null {
  if (fields.length === 0) return "At least one field is required.";
  return firstDraftFieldError(fields);
}

// ---------------------------------------------------------------------------
// Edit fields dialog (REQ-05) — error formatting
// ---------------------------------------------------------------------------

/** `409 VERSION_CONFLICT` copy — reuses the same "refresh and try again" shape SPEC-036's
 * comment-moderation 409 handling established for stale-`expectedVersion` writes, rather than
 * inventing a new wording for this screen. */
export const STALE_VERSION_MESSAGE = "This content type changed since you loaded it, refresh and try again.";

/**
 * Translates a failed `api.updateContentTypeFields` call to operator-facing copy: a `409`
 * (another edit landed since this dialog loaded its `expectedVersion`) gets the dedicated
 * "refresh and try again" message rather than the generic request-failed fallback.
 *
 * @complexity Time/space: O(1) — one `instanceof` check.
 */
export function describeEditFieldsError(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return STALE_VERSION_MESSAGE;
  return describeApiError(e, "Failed to update fields");
}

// ---------------------------------------------------------------------------
// Lifecycle confirm dialog (Deprecate / Reactivate / Tombstone)
// ---------------------------------------------------------------------------

export type LifecycleConfirmOp = "deprecate" | "tombstone";

export const LIFECYCLE_COPY: Record<LifecycleConfirmOp, { title: string; body: string }> = {
  deprecate: {
    title: "Deprecate content type",
    body: "Existing entries stay readable; no new entries can be created.",
  },
  tombstone: {
    title: "Tombstone content type",
    body: "Entries stop being served publicly. This is not reversible from this screen.",
  },
};

/**
 * Tombstone is heavier/less-reversible than an ordinary reset, so — unlike
 * `ResetNamespaceDialog`'s "autoFocus the confirm button" default — focus starts on Cancel
 * (design-spec.md §1.8's deliberate deviation).
 *
 * @complexity Time/space: O(1).
 */
export function autoFocusCancelForLifecycleOp(op: LifecycleConfirmOp): boolean {
  return op === "tombstone";
}

// ---------------------------------------------------------------------------
// Collections — content-type list row menu
// ---------------------------------------------------------------------------

/** The callbacks a content-type row menu needs. Passed in rather than imported so this module
 *  stays free of state, mirroring `posts/rules.ts`'s `PostRowMenuHandlers`. */
export interface ContentTypeRowMenuHandlers {
  onEditFields: (contentType: AdminContentType) => void;
  onDeprecate: (contentType: AdminContentType) => void;
  onReactivate: (contentType: AdminContentType) => void;
  onTombstone: (contentType: AdminContentType) => void;
}

/**
 * At-rest row actions — every row-level trigger here was already a plain, unclassed button (the
 * warning-vs-danger distinction lives entirely in `LifecycleConfirmDialog`, left untouched below),
 * so this builder drops nothing. Tombstone is marked `destructive` here even though its row
 * trigger never carried `.btn-danger` — its own dialog copy already says "not reversible from this
 * screen", the exact case `RowMenuItem.destructive` exists for; Deprecate stays plain, since it is
 * reversible (Reactivate undoes it).
 *
 * The branch this makes testable: which of Deprecate/Reactivate/Tombstone appear is entirely
 * driven by `contentType.status`, and was previously reachable only by rendering the table and
 * opening a popover.
 *
 * @complexity Time/space: O(1) — at most three entries, no iteration.
 */
export function contentTypeMenuItems(contentType: AdminContentType, handlers: ContentTypeRowMenuHandlers): RowMenuItem[] {
  const items: RowMenuItem[] = [
    { key: "edit-fields", label: "Edit fields", onSelect: () => handlers.onEditFields(contentType) },
  ];
  if (contentType.status === "active") {
    items.push({ key: "deprecate", label: "Deprecate", onSelect: () => handlers.onDeprecate(contentType) });
  }
  if (contentType.status === "deprecated") {
    items.push({ key: "reactivate", label: "Reactivate", onSelect: () => handlers.onReactivate(contentType) });
  }
  if (contentType.status !== "tombstone") {
    items.push({
      key: "tombstone",
      label: "Tombstone",
      destructive: true,
      onSelect: () => handlers.onTombstone(contentType),
    });
  }
  return items;
}
