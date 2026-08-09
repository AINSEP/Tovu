import { useEffect, useState } from "react";
import { api, describeApiError, type AdminTerm } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";

/**
 * @file Everything `TermDetailPanel`'s own rename form does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same effect (reset on term change), same handler, same error
 * string. `MergeTermSection` (rendered inside this panel) owns its own state via
 * `use-merge-term-section.hooks.ts`; this hook does not reach into it.
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

export function useTermDetailPanel(options: TermDetailPanelOptions): TermDetailPanelController {
  const locale = useAdminLocale();
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
      await api.renameTerm({ termId: term.id, newName: newName.trim() });
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
