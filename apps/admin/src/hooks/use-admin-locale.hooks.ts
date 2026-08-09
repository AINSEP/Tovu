import { useEffect, useState } from "react";
import { loadLanguage, DEFAULT_LOCALE, LANGUAGE_NAMESPACE } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh, type SettingsRefreshScope } from "../lib/settings-refresh-bus";

/** True when a refresh notification names this hook's namespace, or names no namespace at all
 *  (the bus's "unknown, refresh everything" case — see `settings-refresh-bus.ts`). */
function refreshApplies(scope: SettingsRefreshScope): boolean {
  return scope === null || scope.includes(LANGUAGE_NAMESPACE);
}

/**
 * Fetches the operator's stored `core.language.locale`, defaulting to `DEFAULT_LOCALE` ("en")
 * until it resolves — same fetch/state shape as `App.tsx`'s own `navLocale`, extracted here since
 * every translated admin content screen repeats it verbatim. Swallows a failed fetch to the
 * English default rather than throwing, matching `App.tsx`'s own reasoning: tests that mount a
 * screen without stubbing the settings-effective endpoint should degrade to English, not break
 * the screen.
 *
 * Re-fetches on every `core.language` refresh notification, not just at mount — this hook used to
 * be fetch-once, which is why switching the Language setting looked "stuck": `use-settings-slice
 * .hooks.ts`'s `runSave` now publishes onto `settings-refresh-bus.ts` after a successful save
 * (same tab, no reload needed) and `lib/settings-events.ts` republishes the server's SSE feed onto
 * the same bus (other tabs, other operators). Both land here identically — this hook does not
 * need to know which one fired.
 */
export function useAdminLocale(): string {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  useEffect(() => {
    let cancelled = false;
    const fetchLocale = () => {
      loadLanguage()
        .then((next) => {
          if (!cancelled) setLocale(next);
        })
        .catch(() => undefined);
    };
    fetchLocale();
    const unsubscribe = subscribeToSettingsRefresh((scope) => {
      if (refreshApplies(scope)) fetchLocale();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return locale;
}
