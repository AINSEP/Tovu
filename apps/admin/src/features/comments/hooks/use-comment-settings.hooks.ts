import { useEffect, useState } from "react";

import type { CommentsSettings } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { KEYS, buildSettingsPatch, validateSettingsPatch, visibleCommentSettingsError } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../comments-i18n";
import { defaultCommentSettingsPort } from "./comment-settings-dependencies.hooks";
import type { CommentSettingsPort } from "./comment-settings-port.hooks";

/**
 * @file `SettingsSection`'s load/edit/save lifecycle for the Comments workspace settings form.
 * Extracted verbatim from `Comments.tsx`; see that file's own header for why `SettingsSection`
 * stays a private sub-component with no DI seam of its own.
 *
 * Takes `canConfigure` as an argument, same as the original component prop — the read is `enabled:
 * canConfigure` (AC-10: the GET route itself is `comments.configure`-gated, so a principal without
 * that grant can't even read settings).
 *
 * `port`/`locale` are injected — see `comment-settings-port.hooks.ts` — rather than reaching
 * `lib/api`/`useAdminLocale()` directly, so a test can describe load/save outcomes against
 * `createFakeCommentSettingsPort` instead of stubbing global `fetch`. `useWiredCommentSettings`
 * below is the pair `Comments.tsx`'s `SettingsSection` actually mounts.
 *
 * `lib/fetch-query` migration (2026-08-12): the read is `useFetchQuery({ key: KEYS.settings,
 * enabled: canConfigure, ... })`; `save` is one `useFetchMutation` that `invalidates: [KEYS.
 * settings]`. `settings` itself stays local `useState`, seeded from `list.data` on load and set
 * directly from `save`'s own response on success — mirrors `use-collection-entry-editor.hooks.ts`'s
 * `save()` (see that file's header): a caller reading `settings` right after `await save(...)`
 * resolves must see the new value immediately, and `invalidateQueries` is deliberately NOT awaited
 * inside `useFetchMutation` (`adapter.tanstack.tsx`'s own comment), so the invalidated query's
 * background refetch is not guaranteed to have landed by then. No per-identity seed guard is needed
 * here (unlike `use-form-editor.hooks.ts`'s `seededFormIdRef`) — this hook has exactly one identity
 * for its whole lifetime, and the form itself is uncontrolled (`defaultChecked`/`defaultValue`,
 * read via `FormData` on submit), so a later re-seed from a background refetch cannot clobber an
 * in-progress edit the way a controlled draft could.
 */

export interface CommentSettingsController {
  /** `null` until the initial load settles, or permanently when `canConfigure` is `false`. */
  settings: CommentsSettings | null;
  error: string | null;
  saving: boolean;
  notice: string | null;
  save: (form: FormData) => Promise<void>;
}

export interface CommentSettingsDependencies {
  port: CommentSettingsPort;
  locale: string;
}

export function useCommentSettings(canConfigure: boolean, deps: CommentSettingsDependencies): CommentSettingsController {
  const { port, locale } = deps;
  // AC-10: the GET route itself is `comments.configure`-gated (get-settings.ts), so a principal
  // without that grant can't even read settings today — `enabled: canConfigure` skips the doomed
  // fetch (see `lib/fetch-query/types.ts`'s `FetchQueryOptions.enabled` doc) rather than surfacing a
  // 403 error banner for a screen this principal was never going to be able to use.
  const list = useFetchQuery({ key: KEYS.settings, fetch: () => port.getCommentsSettings(), enabled: canConfigure });
  const [settings, setSettings] = useState<CommentsSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Seeds local `settings` from every successful load — see this file's own header for why this
  // stays local state rather than reading `list.data` directly.
  useEffect(() => {
    if (list.data) setSettings(list.data.data);
  }, [list.data]);

  const saveMutation = useFetchMutation({
    run: (patch: Partial<CommentsSettings>) => port.putCommentsSettings(patch),
    invalidates: [KEYS.settings],
  });

  async function save(form: FormData) {
    if (!settings) return;
    setNotice(null);
    setValidationError(null);

    const patch = buildSettingsPatch({ form, current: settings });

    // REQ-09: client-side validate spamAutoRejectScore before the network call — mirrors the
    // backend's own `validateCommentsSettingsPatch` bound (`src/comments/settings.ts`).
    const validation = validateSettingsPatch(patch);
    if (validation) {
      setValidationError(validation);
      return;
    }

    try {
      const { data: updated } = await saveMutation.mutate(patch);
      setSettings(updated);
      setNotice(t(locale, "Saved."));
    } catch {
      // already surfaced through saveMutation.error -> error below
    }
  }

  const error = visibleCommentSettingsError({
    validationError,
    saveError: saveMutation.error,
    saveFallback: t(locale, "failed to save Comments settings"),
    listError: list.error,
    listFallback: t(locale, "failed to load Comments settings"),
    hasSettings: settings !== null,
  });

  return { settings, error, saving: saveMutation.status === "pending", notice, save };
}

/**
 * Binds the real `/api/.../comments/settings` client and the resolved `useAdminLocale()` value —
 * see `comment-settings-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Comments.tsx`'s `SettingsSection` composes this
 * and a test composes {@link useCommentSettings} with `createFakeCommentSettingsPort`.
 */
export function useWiredCommentSettings(canConfigure: boolean): CommentSettingsController {
  const locale = useAdminLocale();
  return useCommentSettings(canConfigure, { port: defaultCommentSettingsPort, locale });
}
