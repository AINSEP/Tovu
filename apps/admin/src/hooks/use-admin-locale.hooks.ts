import { useEffect, useState } from "react";

import { defaultAdminLocalePort, DEFAULT_LOCALE } from "./admin-locale-dependencies.hooks";
import type { AdminLocalePort } from "./admin-locale-port.hooks";

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
 * .hooks.ts`'s `runSave` publishes onto `settings-refresh-bus.ts` after a successful save (same
 * tab, no reload needed) and `lib/settings-events.ts` republishes the server's SSE feed onto the
 * same bus (other tabs, other operators). Both land here identically — this hook does not need to
 * know which one fired; `port.subscribeToSettingsRefresh` already filters to only the refreshes
 * that matter (see `admin-locale-port.hooks.ts`/`admin-locale-dependencies.hooks.ts`).
 *
 * `port` is injected — see `admin-locale-port.hooks.ts` — rather than importing
 * `lib/settings-tabs`/`lib/settings-refresh-bus` directly, so a test can describe the load/refresh
 * behaviour against `createFakeAdminLocalePort` instead of stubbing global `fetch` or partially
 * un-mocking the bus module. `useWiredAdminLocale` below is the zero-argument pair every screen
 * actually mounts.
 *
 * `port` DEFAULTS to `defaultAdminLocalePort`, unlike every other `useX(port)` in this codebase
 * (`useThemePages`, `useAnalytics`, etc., which all require it explicitly). Deliberate exception:
 * this hook is called directly, with zero arguments, from ~40 other files across nearly every
 * feature (`Database.tsx`, and the `locale`/`t` resolution inside most `use-<feature>.hooks.ts`
 * files) — converting every one of those call sites was out of scope for this pass (2026-08-14,
 * see the port-conversion handoff), and an un-defaulted `port` would make every single one of them
 * a compile error. The default keeps them compiling with byte-for-byte the same runtime behaviour
 * (the same module-level `defaultAdminLocalePort` singleton `useWiredAdminLocale` passes explicitly
 * below), while still letting a NEW test call `useAdminLocale(createFakeAdminLocalePort())`
 * directly. Once every remaining bare call site is converted to `useWiredAdminLocale()`, this
 * default can be dropped to match the rest of the codebase's convention.
 *
 * @param port - Where to load the locale and hear about relevant refreshes. Defaults to the real
 *   binding (see above). Read only from inside the effect body, never listed in its dependency
 *   array — see `apps/admin/INFO.md`'s Hooks section for why (the natural fake injection
 *   `useAdminLocaleHook={() => useAdminLocale(createFakeAdminLocalePort())}` rebuilds the port
 *   every render, so listing it would refire this effect on every render in a test).
 * @returns The current locale, `DEFAULT_LOCALE` until the initial fetch resolves.
 */
export function useAdminLocale(port: AdminLocalePort = defaultAdminLocalePort): string {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  // `port` is referentially stable in production (`useWiredAdminLocale` always passes the same
  // module-level singleton) — see `use-analytics.hooks.ts`'s identical justification for the same
  // omission.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `port` is referentially stable in production — see comment above; same justification as use-analytics.hooks.ts.
  useEffect(() => {
    let cancelled = false;
    const fetchLocale = () => {
      port
        .loadLanguage()
        .then((next) => {
          if (!cancelled) setLocale(next);
        })
        .catch(() => undefined);
    };
    fetchLocale();
    const unsubscribe = port.subscribeToSettingsRefresh(fetchLocale);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return locale;
}

/**
 * Binds the real `loadLanguage`/`subscribeToSettingsRefresh` — see
 * `admin-locale-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so every screen composes
 * this and a test composes {@link useAdminLocale} with `createFakeAdminLocalePort`.
 *
 * @returns The current locale — see {@link useAdminLocale}.
 */
export function useWiredAdminLocale(): string {
  return useAdminLocale(defaultAdminLocalePort);
}
