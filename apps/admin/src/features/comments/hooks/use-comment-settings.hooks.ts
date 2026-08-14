import { useEffect, useRef, useState } from "react";

import type { CommentsSettings } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { KEYS, buildSettingsPatch, validateSettingsPatch, visibleCommentSettingsError } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../comments-i18n";
import { defaultCommentSettingsPort } from "./comment-settings-dependencies.hooks";
import type { CommentSettingsPort } from "./comment-settings-port.hooks";

/**
 * @file `SettingsSection`'s load/edit/save lifecycle for the Comments workspace settings form.
 * Extracted verbatim from `Comments.tsx`. `SettingsSection` stays a private, unexported
 * sub-component of `Comments.tsx` (see that file's own header for why), but it DOES carry its own
 * DI-seam prop (`useCommentSettingsHook`, 2026-08-14) — see `use-comments.hooks.ts`'s header for
 * why the earlier "no seam for private sub-components" rule was reversed.
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
 * background refetch is not guaranteed to have landed by then.
 *
 * `seededRef` below is a mandatory ONE-SHOT seed guard (round-2 fix for TM-TOVU-2026-08-12-A: a
 * concurrent two-operator lost update, confirmed against source and against a JSDOM probe). An
 * earlier revision of this comment argued no guard was needed because the form is uncontrolled
 * (`defaultChecked`/`defaultValue`, read via `FormData` on submit) — reasoning that a re-seed
 * "cannot clobber an in-progress edit the way a controlled draft could". That is true of the
 * visible DOM and irrelevant to the actual hazard: `settings` is not just render state, it is
 * `buildSettingsPatch`'s diff BASELINE (`save`, below, calls `buildSettingsPatch({ form, current:
 * settings })`). Changing `defaultValue`/`defaultChecked` on an ALREADY-MOUNTED uncontrolled input
 * does NOT change the input's current value — so when a background refetch re-seeds `settings`
 * (routine here: `saveMutation`'s own `invalidates: [KEYS.settings]` triggers exactly this on
 * every save, including saves made by OTHER operators against the same resource), the baseline
 * moves while the DOM does not. A later save then diffs the operator's still-unchanged, still-
 * visible field against a baseline that quietly moved out from under it, includes that stale value
 * in the patch, and silently reverts whatever another operator just committed — no error, no
 * warning. `seededRef` seeds `settings` once from the first successful load and never advances it
 * again on its own; `save`'s own `setSettings(updated)` below is unaffected by this guard — that
 * is this operator's own just-committed write coming back from the server, which correctly
 * advances the baseline to match what they just sent. The accepted trade (owner-approved,
 * 2026-08-12): this operator's view goes stale until they reload rather than silently reverting a
 * concurrent write; controlled draft state and server-side compare-and-swap were both considered
 * and deliberately deferred.
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
  // One-shot seed guard — see this file's own header for why re-seeding on every load (not just
  // the first) is the actual lost-update bug, not a redundant precaution.
  const seededRef = useRef(false);

  // Seeds local `settings` from the FIRST successful load only — see this file's own header for
  // why a later re-seed (from a background refetch invalidated by anyone's save, not just this
  // operator's own) must not move this baseline again on its own.
  useEffect(() => {
    if (list.data && !seededRef.current) {
      seededRef.current = true;
      setSettings(list.data.data);
    }
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
