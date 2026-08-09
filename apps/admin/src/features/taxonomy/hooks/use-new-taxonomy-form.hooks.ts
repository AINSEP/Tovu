import { useState } from "react";
import { api, describeApiError } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";

/**
 * @file Everything `NewTaxonomyForm` does (REQ-02), so it can stay markup only.
 *
 * Extracted verbatim — same state, same validation guard, same effect, same error string. Mirrors
 * `use-new-term-form.hooks.ts`'s local-state/submit/error shape, same as the original components
 * mirrored each other.
 */

export interface NewTaxonomyFormOptions {
  onCreated: () => void;
}

export interface NewTaxonomyFormController {
  name: string;
  setName: (name: string) => void;
  hierarchical: boolean;
  setHierarchical: (hierarchical: boolean) => void;
  error: string | null;
  saving: boolean;
  submit: (e: React.FormEvent) => Promise<void>;
}

export function useNewTaxonomyForm(options: NewTaxonomyFormOptions): NewTaxonomyFormController {
  const locale = useAdminLocale();
  const [name, setName] = useState("");
  const [hierarchical, setHierarchical] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t(locale, "Name is required."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createTaxonomy({ name: name.trim(), hierarchical });
      setName("");
      setHierarchical(false);
      options.onCreated();
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to create taxonomy")));
    } finally {
      setSaving(false);
    }
  }

  return { name, setName, hierarchical, setHierarchical, error, saving, submit };
}
