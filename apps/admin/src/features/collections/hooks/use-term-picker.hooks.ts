import { useState } from "react";
import { describeApiError } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../collections-i18n";
import { KEYS } from "../rules";
import { defaultTermPickerPort } from "./term-picker-dependencies.hooks";
import type { TermPickerPort } from "./term-picker-port.hooks";

/**
 * @file `TermPicker`'s own state and async action, extracted so it is reachable from `renderHook`
 * without rendering `CollectionEntryEditor`'s surrounding editor shell. `TermPicker` is a nested
 * sub-component, but it owns a genuinely separate stateful unit (its own selection set, its own
 * save-in-flight/message/error) — not a piece of the parent editor's state — so it gets its own hook
 * rather than folding into `use-collection-entry-editor.hooks.ts`.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/collections` needs it;
 * promote to `src/hooks/` only when a second feature actually does.
 *
 * `port`/`locale` are injected — see `term-picker-port.hooks.ts` — so a test describes the outcome
 * against `createFakeTermPickerPort` instead of stubbing global `fetch`. `useWiredTermPicker` below is
 * the pair `CollectionEntryEditor.tsx` actually mounts.
 *
 * The boxes start ticked for the terms the entry holds (`assignedTerms`, keyed `KEYS.entryTerms`).
 * Ticking/unticking edits a local draft; Save sends the difference — `assignTerms` for the added
 * ids, `unassignTerms` for the removed ones — then re-reads. The draft is kept after a save, so a box
 * ticked while the save was in flight stays ticked (M1) and simply shows as a new unsaved change.
 */

export interface TermPickerController {
  selected: Set<string>;
  toggle: (termId: string) => void;
  /** The first read of the entry's terms has not landed yet. */
  loading: boolean;
  /** The ticked set differs from what the entry holds. */
  dirty: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  save: () => Promise<void>;
}

export interface TermPickerDependencies {
  port: TermPickerPort;
  locale: string;
}

const NO_TERMS: readonly string[] = [];

/** The ids in `from` that are not in `other`. */
function missingFrom(from: Iterable<string>, other: ReadonlySet<string>): string[] {
  return [...from].filter((id) => !other.has(id));
}

export function useTermPicker(
  props: { contentType: string; contentId: string },
  deps: TermPickerDependencies
): TermPickerController {
  const { port, locale } = deps;
  const target = { contentType: props.contentType, contentId: props.contentId };
  const key = KEYS.entryTerms(props.contentType, props.contentId);
  const assignedQuery = useFetchQuery({ key, fetch: async () => (await port.assignedTerms(target)).termIds });
  const assigned = new Set(assignedQuery.data ?? NO_TERMS);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selected = draft ?? assigned;

  const saveMutation = useFetchMutation({
    run: async (input: { add: string[]; remove: string[] }) => {
      if (input.add.length > 0) await port.assignTerms({ ...target, termIds: input.add });
      if (input.remove.length > 0) await port.unassignTerms({ ...target, termIds: input.remove });
    },
    invalidates: [key],
  });

  function toggle(termId: string) {
    setMessage(null);
    setDraft((current) => {
      const next = new Set(current ?? assigned);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  const add = missingFrom(selected, assigned);
  const remove = missingFrom(assigned, selected);
  const dirty = add.length > 0 || remove.length > 0;

  async function save() {
    if (!dirty) return;
    setMessage(null);
    try {
      await saveMutation.mutate({ add, remove });
      setMessage(t(locale, "Categories & tags saved."));
    } catch {
      // already surfaced through saveMutation.error -> error below
    }
  }

  const error = saveMutation.error
    ? describeApiError(saveMutation.error, t(locale, "Failed to save categories & tags"))
    : assignedQuery.error
      ? describeApiError(assignedQuery.error, t(locale, "Failed to load this entry's categories & tags"))
      : null;

  return {
    selected,
    toggle,
    loading: assignedQuery.status === "loading",
    dirty,
    saving: saveMutation.status === "pending",
    message,
    error,
    save,
  };
}

/**
 * Binds the real `/api/.../taxonomy/{assigned,assign,unassign}-terms` client and the resolved
 * `useAdminLocale()` value — see `term-picker-dependencies.hooks.ts`. The zero-argument-deps half of
 * the `useX(dependencies)` / `useWiredX()` pair, so `CollectionEntryEditor.tsx` composes this and a
 * test composes {@link useTermPicker} with `createFakeTermPickerPort`.
 */
export function useWiredTermPicker(props: { contentType: string; contentId: string }): TermPickerController {
  const locale = useAdminLocale();
  return useTermPicker(props, { port: defaultTermPickerPort, locale });
}
