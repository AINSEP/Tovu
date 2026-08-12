import { useState } from "react";
import { describeApiError } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
import { defaultNewTaxonomyFormPort } from "./new-taxonomy-form-dependencies.hooks";
import type { NewTaxonomyFormPort } from "./new-taxonomy-form-port.hooks";

/**
 * @file Everything `NewTaxonomyForm` does (REQ-02), so it can stay markup only.
 *
 * Extracted verbatim — same state, same validation guard, same effect, same error string. Mirrors
 * `use-new-term-form.hooks.ts`'s local-state/submit/error shape, same as the original components
 * mirrored each other.
 *
 * `port` is injected — see `new-taxonomy-form-port.hooks.ts` — rather than importing `lib/api`
 * directly, so a test can describe the create outcome against `createFakeNewTaxonomyFormPort`
 * instead of stubbing global `fetch`. `useWiredNewTaxonomyForm` below is the zero-argument pair
 * `Taxonomy.tsx` actually mounts.
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

export function useNewTaxonomyForm(
  options: NewTaxonomyFormOptions,
  port: NewTaxonomyFormPort,
  locale: string
): NewTaxonomyFormController {
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
      await port.createTaxonomy({ name: name.trim(), hierarchical });
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

/**
 * Binds the real `/api/.../taxonomy` client — see `new-taxonomy-form-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useNewTaxonomyForm} with
 * `createFakeNewTaxonomyFormPort`.
 */
export function useWiredNewTaxonomyForm(options: NewTaxonomyFormOptions): NewTaxonomyFormController {
  const locale = useAdminLocale();
  return useNewTaxonomyForm(options, defaultNewTaxonomyFormPort, locale);
}
