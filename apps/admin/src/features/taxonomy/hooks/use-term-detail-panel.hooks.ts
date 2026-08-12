import { useEffect, useState } from "react";
import { describeApiError, type AdminTerm } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewName(term.name);
    setMessage(null);
    setError(null);
  }, [term.id, term.name]);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === term.name) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await port.renameTerm({ termId: term.id, newName: newName.trim() });
      setMessage(t(locale, "Renamed."));
      onRenamed();
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to rename term")));
    } finally {
      setSaving(false);
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
