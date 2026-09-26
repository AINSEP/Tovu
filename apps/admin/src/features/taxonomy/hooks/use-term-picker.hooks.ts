import { useState } from "react";
import { describeApiError, type AdminTaxonomyWithTerms } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
import { KEYS, termPickerSubject } from "../rules";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultTermPickerPort } from "./term-picker-dependencies.hooks";
import type { TermPickerPort } from "./term-picker-port.hooks";

/**
 * @file `TermPicker`'s own state and async action — the Categories & Tags box the post, page and
 * collection-entry editors all mount (`TermPicker.tsx`). One content ref (`contentType` +
 * `contentId`: `post`/`page` + the post id, or a collection key + the entry id) is all it needs; it
 * reads the taxonomy list and the content's own terms itself, so an editor passes nothing else.
 *
 * `port`/`locale` are injected — see `term-picker-port.hooks.ts` — so a test describes the outcome
 * against `createFakeTermPickerPort` instead of stubbing global `fetch`. `useWiredTermPicker` below is
 * the pair `TermPicker.tsx` actually mounts.
 *
 * The taxonomy list shares the Categories & Tags screen's own cache key (`KEYS.list`), so a term
 * added there shows here without a reload. The boxes start ticked for the terms the content holds
 * (`assignedTerms`, `KEYS.assignedTerms`). Ticking/unticking edits a local draft; Save sends the
 * difference — `assignTerms` for the added ids, `unassignTerms` for the removed ones — then re-reads.
 * The draft is kept after a save, so a box ticked while the save was in flight stays ticked (M1) and
 * simply shows as a new unsaved change.
 */

export interface TermPickerController {
  taxonomies: AdminTaxonomyWithTerms[];
  /** No taxonomy exists at all — the box has nothing to offer and is not shown. */
  hidden: boolean;
  /** What the box's agent labels call the tagged content. */
  subject: "post" | "page" | "entry";
  selected: Set<string>;
  toggle: (termId: string) => void;
  /** The first read of the taxonomies or of the content's terms has not landed yet. */
  loading: boolean;
  /** The ticked set differs from what the content holds. */
  dirty: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  save: () => Promise<void>;
  /** This feature's dictionary, bound to the admin locale. */
  t: Translate;
}

export interface TermPickerDependencies {
  port: TermPickerPort;
  locale: string;
}

/** Which post, page or collection entry the picker tags. */
export interface TermPickerTarget {
  contentType: string;
  contentId: string;
}

const NO_TERMS: readonly string[] = [];
const NO_TAXONOMIES: AdminTaxonomyWithTerms[] = [];

/** The ids in `from` that are not in `other`. */
function missingFrom(from: Iterable<string>, other: ReadonlySet<string>): string[] {
  return [...from].filter((id) => !other.has(id));
}

export function useTermPicker(props: TermPickerTarget, deps: TermPickerDependencies): TermPickerController {
  const { port, locale } = deps;
  const target = { contentType: props.contentType, contentId: props.contentId };
  const key = KEYS.assignedTerms(props.contentType, props.contentId);
  // Same fetch (and so the same cached `{ items }` shape) as `use-taxonomy.hooks.ts`'s list read —
  // two readers of one key must store one shape.
  const taxonomiesQuery = useFetchQuery({ key: KEYS.list, fetch: () => port.listTaxonomies() });
  const assignedQuery = useFetchQuery({ key, fetch: async () => (await port.assignedTerms(target)).termIds });
  const taxonomies = taxonomiesQuery.data?.items ?? NO_TAXONOMIES;
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

  const loadError = assignedQuery.error ?? taxonomiesQuery.error;
  const error = saveMutation.error
    ? describeApiError(saveMutation.error, t(locale, "Failed to save categories & tags"))
    : loadError
      ? describeApiError(loadError, t(locale, "Failed to load categories & tags"))
      : null;

  return {
    taxonomies,
    hidden: taxonomiesQuery.status === "success" && taxonomies.length === 0,
    subject: termPickerSubject(props.contentType),
    selected,
    toggle,
    loading: taxonomiesQuery.status === "loading" || assignedQuery.status === "loading",
    dirty,
    saving: saveMutation.status === "pending",
    message,
    error,
    save,
    t: (key) => t(locale, key),
  };
}

/**
 * Binds the real `/api/.../taxonomy` list and `{assigned,assign,unassign}-terms` client and the
 * resolved `useAdminLocale()` value — see `term-picker-dependencies.hooks.ts`. The zero-argument-deps
 * half of the `useX(dependencies)` / `useWiredX()` pair, so `TermPicker.tsx` composes this and a
 * test composes {@link useTermPicker} with `createFakeTermPickerPort`.
 */
export function useWiredTermPicker(props: TermPickerTarget): TermPickerController {
  const locale = useAdminLocale();
  return useTermPicker(props, { port: defaultTermPickerPort, locale });
}
