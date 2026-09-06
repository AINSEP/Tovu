import { useEffect, useRef, useState } from "react";
import { describeApiError, type AdminTerm } from "@/lib/api";
import { useFetchMutation } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
import { KEYS } from "../rules";
import { defaultTaxonomyPort } from "./taxonomy-dependencies.hooks";
import type { TaxonomyPort } from "./taxonomy-port.hooks";

/**
 * @file Everything `TermDetailPanel`'s own rename form does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same effect (reset on term change), same handler, same error
 * string. `MergeTermSection` (rendered inside this panel) owns its own state via
 * `use-merge-term-section.hooks.ts`; this hook does not reach into it.
 *
 * `port` is injected — see `taxonomy-port.hooks.ts` (shared with `use-taxonomy.hooks.ts`, since
 * both read/write the same taxonomy/term resource) — rather than importing `lib/api` directly, so
 * a test can describe the rename outcome against `createFakeTaxonomyPort` instead of stubbing
 * global `fetch`. `useWiredTermDetailPanel` below is the zero-argument pair `Taxonomy.tsx` actually
 * mounts.
 *
 * `lib/fetch-query` migration (2026-08-12): `rename` is a `useFetchMutation` that `invalidates:
 * [KEYS.list]` — the rename mutates a name inside `useTaxonomy`'s cached list, and every previous
 * caller of `onRenamed` used it purely to trigger that same list's `load()`. `error` reads the
 * mutation's own `.error`, reset (alongside the local `message`) on the same term-change effect the
 * pre-migration `error`/`message` state already had.
 */

export interface TermDetailPanelOptions {
  term: AdminTerm;
  onRenamed: () => void;
}

export interface TermDetailPanelController {
  newName: string;
  setNewName: (newName: string) => void;
  saving: boolean;
  message: string | null;
  error: string | null;
  rename: (e: React.FormEvent) => Promise<void>;
}

export function useTermDetailPanel(
  options: TermDetailPanelOptions,
  port: TaxonomyPort,
  locale: string
): TermDetailPanelController {
  const { term, onRenamed } = options;
  const [newName, setNewName] = useState(term.name);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renameMutation = useFetchMutation({
    run: (name: string) => port.renameTerm({ termId: term.id, newName: name }),
    invalidates: [KEYS.list],
  });

  // Stale-response guard (2026-09-05, same class of bug `use-widget-instance-editor.hooks.ts`'s
  // `activeEntityRef` already fixes for its own save()-after-navigate case): `Taxonomy.tsx` mounts
  // `TermDetailPanel` with no `key={term.id}` — switching the selected term re-renders this SAME
  // hook instance with a new `term` prop rather than remounting a fresh one, so a `rename()` in
  // flight for the term the operator just navigated AWAY FROM has no effect-cleanup moment of its
  // own to learn that happened. `activeTermIdRef` always holds the latest term id this hook was
  // RENDERED with (updated every render, not just on effect re-run); `rename()`'s completion
  // handlers below skip committing `message`/`error`/`saving` onto whatever term is on screen now
  // once the operator has switched. `saving`/`error` are local state rather than read straight off
  // `renameMutation.status`/`.error` for the same reason: that mutation object is NOT re-created per
  // term, so a stale settlement could otherwise flip it again after the term-change effect below has
  // already reset it.
  const activeTermIdRef = useRef(term.id);
  activeTermIdRef.current = term.id;

  // `renameMutation` intentionally excluded — same deps as the pre-migration effect
  // ([term.id, term.name]); including the mutation object would re-run this on every status change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `renameMutation` intentionally excluded — including it would re-run this on every status change.
  useEffect(() => {
    setNewName(term.name);
    setMessage(null);
    setError(null);
    setSaving(false);
    renameMutation.reset();
  }, [term.id, term.name]);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === term.name) return;
    const renamingForTermId = term.id;
    setMessage(null);
    setError(null);
    setSaving(true);
    try {
      await renameMutation.mutate(newName.trim());
      if (activeTermIdRef.current !== renamingForTermId) return; // superseded by a term switch
      setMessage(t(locale, "Renamed."));
      onRenamed();
    } catch (err) {
      if (activeTermIdRef.current !== renamingForTermId) return;
      setError(describeApiError(err, t(locale, "Failed to rename term")));
    } finally {
      if (activeTermIdRef.current === renamingForTermId) setSaving(false);
    }
  }

  return { newName, setNewName, saving, message, error, rename };
}

/**
 * Binds the real `/api/.../taxonomy/terms` client — see `taxonomy-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useTermDetailPanel} with `createFakeTaxonomyPort`.
 */
export function useWiredTermDetailPanel(options: TermDetailPanelOptions): TermDetailPanelController {
  const locale = useAdminLocale();
  return useTermDetailPanel(options, defaultTaxonomyPort, locale);
}
