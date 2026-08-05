import { useState } from "react";
import { api, describeApiError, type AdminTaxonomyWithTerms } from "../../../lib/api";

/**
 * @file Everything `NewTermForm` does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same validation guard, same effect, same error string.
 *
 * `open`/`setOpen` (web-design pass, 2026-08-05): every taxonomy group used to render its own
 * "New term" form open at all times, so an N-group taxonomy list showed N always-visible boxed
 * forms interleaved with the term rows — no sibling list screen (Media, Comments, Menus,
 * Integrations) keeps a create form permanently open like that. `NewTermForm` now starts collapsed
 * behind a small trigger and only mounts the real form once opened; `submit` closes it again on
 * success (mirrors the reset-on-success it already does for `name`/`parentId`), so a completed add
 * returns the group to its compact resting state instead of leaving an empty form sitting open.
 */

export interface NewTermFormOptions {
  taxonomy: AdminTaxonomyWithTerms;
  onCreated: () => void;
}

export interface NewTermFormController {
  open: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  name: string;
  setName: (name: string) => void;
  parentId: string;
  setParentId: (parentId: string) => void;
  error: string | null;
  saving: boolean;
  submit: (e: React.FormEvent) => Promise<void>;
}

export function useNewTermForm(options: NewTermFormOptions): NewTermFormController {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      options.onCreated();
    } catch (e) {
      setError(describeApiError(e, "Failed to create term"));
    } finally {
      setSaving(false);
    }
  }

  return { open, setOpen, name, setName, parentId, setParentId, error, saving, submit };
}
