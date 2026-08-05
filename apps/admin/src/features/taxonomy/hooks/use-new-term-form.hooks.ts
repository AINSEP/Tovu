import { useState } from "react";
import { api, describeApiError, type AdminTaxonomyWithTerms } from "../../../lib/api";

/**
 * @file Everything `NewTermForm` does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same validation guard, same effect, same error string.
 */

export interface NewTermFormOptions {
  taxonomy: AdminTaxonomyWithTerms;
  onCreated: () => void;
}

export interface NewTermFormController {
  name: string;
  setName: (name: string) => void;
  parentId: string;
  setParentId: (parentId: string) => void;
  error: string | null;
  saving: boolean;
  submit: (e: React.FormEvent) => Promise<void>;
}

export function useNewTermForm(options: NewTermFormOptions): NewTermFormController {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createTerm(
        { taxonomyId: options.taxonomy.taxonomy.id, name: name.trim() },
        { parentId: options.taxonomy.taxonomy.hierarchical && parentId ? parentId : null }
      );
      setName("");
      setParentId("");
      options.onCreated();
    } catch (e) {
      setError(describeApiError(e, "Failed to create term"));
    } finally {
      setSaving(false);
    }
  }

  return { name, setName, parentId, setParentId, error, saving, submit };
}
