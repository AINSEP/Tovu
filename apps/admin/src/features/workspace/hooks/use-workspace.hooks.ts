import { useEffect, useState } from "react";

import { api, type AdminWorkspace } from "../../../lib/api";
import { describeApiError } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../workspace-i18n";

/**
 * @file Everything the Workspace screen does, so `Workspace.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/workspace` needs it.
 */

export interface WorkspaceController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  workspace: AdminWorkspace | null;
  error: string | null;
  name: string;
  setName: (name: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
  onSave: (e: React.FormEvent) => Promise<void>;
}

/**
 * @complexity Time/space: O(1) per call — one workspace round trip on mount, one per save.
 */
export function useWorkspace(): WorkspaceController {
  const locale = useAdminLocale();
  const [workspace, setWorkspace] = useState<AdminWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reload(): Promise<void> {
    return api
      .getWorkspace()
      .then((r) => {
        setWorkspace(r.workspace);
        setName(r.workspace.name);
        setSlug(r.workspace.slug);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load workspace"))));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { workspace: updated } = await api.updateWorkspace({ name, slug });
      setWorkspace(updated);
      setSaved(true);
    } catch (e) {
      setSaveError(describeApiError(e, t(locale, "failed to save workspace")));
    } finally {
      setSaving(false);
    }
  }

  return { workspace, error, name, setName, slug, setSlug, saving, saveError, saved, onSave };
}
