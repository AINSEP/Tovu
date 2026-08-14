import { loadLanguage, DEFAULT_LOCALE, LANGUAGE_NAMESPACE } from "../lib/settings-tabs";
import { subscribeToSettingsRefresh, type SettingsRefreshScope } from "../lib/settings-refresh-bus";
import type { AdminLocalePort } from "./admin-locale-port.hooks";

/**
 * @file The only place `use-admin-locale.hooks.ts`'s port reaches `lib/settings-tabs`/
 * `lib/settings-refresh-bus` — see `admin-locale-port.hooks.ts` for why the split exists.
 */

/** True when a refresh notification names the language namespace, or names no namespace at all
 *  (the bus's "unknown, refresh everything" case — see `settings-refresh-bus.ts`). Lives here, not
 *  in `use-admin-locale.hooks.ts`, because deciding "is this refresh about ME" is exactly the kind
 *  of real-binding-only rule `AdminLocalePort`'s narrowed `subscribeToSettingsRefresh(listener: ()
 *  => void)` signature exists to hide from the hook.
 *
 * @complexity O(n) in the refresh's own namespace list (typically 0-1 entries) — not caller-facing.
 */
function refreshApplies(scope: SettingsRefreshScope): boolean {
  return scope === null || scope.includes(LANGUAGE_NAMESPACE);
}

/** Re-exported so `use-admin-locale.hooks.ts` can seed its initial state without importing
 *  `lib/settings-tabs` directly — this file is the only one that does. */
export { DEFAULT_LOCALE };

/** The live implementation, as a module-level singleton — matches `theme-pages-dependencies
 *  .hooks.ts`'s `defaultThemePagesPort`. */
export const defaultAdminLocalePort: AdminLocalePort = {
  loadLanguage: () => loadLanguage(),
  subscribeToSettingsRefresh: (listener) =>
    subscribeToSettingsRefresh((scope) => {
      if (refreshApplies(scope)) listener();
    }),
};

/** Seed state for {@link createFakeAdminLocalePort}. */
export interface FakeAdminLocalePortOptions {
  /** What `loadLanguage()` resolves to until {@link FakeAdminLocalePort.publishLocaleChange} changes
   *  it. Defaults to `DEFAULT_LOCALE`. */
  initialLocale?: string;
  /** When set, every `loadLanguage()` call rejects with this instead of resolving — for the "swallow
   *  a failed fetch" behaviour `use-admin-locale.hooks.ts`'s own file header documents. */
  loadLanguageError?: Error;
}

/** {@link createFakeAdminLocalePort}'s return type — the port plus one extra method a test uses to
 *  drive a refresh, matching `assistant-chats-dependencies.hooks.ts`'s "fake gets extra methods a
 *  real port doesn't have" precedent. */
export interface FakeAdminLocalePort extends AdminLocalePort {
  /** Changes what the NEXT `loadLanguage()` call resolves to, then notifies every subscriber — as if
   *  a real, already-namespace-filtered `core.language` refresh had fired (a same-tab save or
   *  another tab's SSE echo — see `use-admin-locale.hooks.ts`'s file header). Lets a test assert the
   *  re-fetch-on-refresh behaviour end to end without touching the real bus or replicating its
   *  namespace-filtering rule. */
  publishLocaleChange(next: string): void;
}

/**
 * An in-memory {@link AdminLocalePort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeAdminLocalePort(options: FakeAdminLocalePortOptions = {}): FakeAdminLocalePort {
  let current = options.initialLocale ?? DEFAULT_LOCALE;
  const listeners = new Set<() => void>();

  return {
    async loadLanguage() {
      if (options.loadLanguageError) throw options.loadLanguageError;
      return current;
    },
    subscribeToSettingsRefresh(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publishLocaleChange(next) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}
