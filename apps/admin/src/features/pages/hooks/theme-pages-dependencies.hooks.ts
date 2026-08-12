import { api } from "../../../lib/api";
import type { ThemePagesPort } from "./theme-pages-port.hooks";

/**
 * @file The only place `use-theme-pages.hooks.ts` reaches `lib/api` — see `theme-pages-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultThemePagesPort: ThemePagesPort = {
  getPresentation: () => api.getPresentation(),
};

/** Seed state for {@link createFakeThemePagesPort}. */
export interface FakeThemePagesPortOptions {
  activeThemeStaticPageIds?: string[];
  /** When set, `getPresentation()` rejects with this instead of resolving — for load-failure
   *  tests. */
  getPresentationError?: Error;
}

/**
 * An in-memory {@link ThemePagesPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeThemePagesPort(options: FakeThemePagesPortOptions = {}): ThemePagesPort {
  return {
    async getPresentation() {
      if (options.getPresentationError) throw options.getPresentationError;
      return { activeThemeStaticPageIds: options.activeThemeStaticPageIds ?? [] };
    },
  };
}
