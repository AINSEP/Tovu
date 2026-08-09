import { useEffect, useState } from "react";

import { api, describeApiError, type CommentsSettings } from "../../../lib/api";
import { buildSettingsPatch, validateSettingsPatch } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../comments-i18n";

/**
 * @file `SettingsSection`'s load/edit/save lifecycle for the Comments workspace settings form.
 * Extracted verbatim from `Comments.tsx`; see that file's own header for why `SettingsSection`
 * stays a private sub-component with no DI seam of its own.
 *
 * Takes `canConfigure` as an argument, same as the original component prop — the effect skips its
 * fetch entirely when `false` (AC-10: the GET route itself is `comments.configure`-gated, so a
 * principal without that grant can't even read settings).
 */

export interface CommentSettingsController {
  /** `null` until the initial load settles, or permanently when `canConfigure` is `false`. */
  settings: CommentsSettings | null;
  error: string | null;
  saving: boolean;
  notice: string | null;
  save: (form: FormData) => Promise<void>;
}

export function useCommentSettings(canConfigure: boolean): CommentSettingsController {
  const locale = useAdminLocale();
  const [settings, setSettings] = useState<CommentsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // AC-10: the GET route itself is `comments.configure`-gated (get-settings.ts), so a
    // principal without that grant can't even read settings today — skip the doomed fetch and
    // hide the section entirely rather than surfacing a 403 error banner for a screen this
    // principal was never going to be able to use.
    if (!canConfigure) return;
    api
      .getCommentsSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load Comments settings"))));
  }, [canConfigure]);

  async function save(form: FormData) {
    if (!settings) return;
    setError(null);
    setNotice(null);

    const patch = buildSettingsPatch({ form, current: settings });

    // REQ-09: client-side validate spamAutoRejectScore before the network call — mirrors the
    // backend's own `validateCommentsSettingsPatch` bound (`src/comments/settings.ts`).
    const validationError = validateSettingsPatch(patch);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const r = await api.putCommentsSettings(patch);
      setSettings(r.data);
      setNotice(t(locale, "Saved."));
    } catch (e) {
      setError(describeApiError(e, t(locale, "failed to save Comments settings")));
    } finally {
      setSaving(false);
    }
  }

  return { settings, error, saving, notice, save };
}
