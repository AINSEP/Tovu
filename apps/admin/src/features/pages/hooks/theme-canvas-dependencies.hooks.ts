import type { ThemeCanvasPort, ThemeTokens } from "./theme-canvas-port.hooks";

/**
 * @file The only place `use-theme-canvas-styling.hooks.ts` reaches the real network — see
 * `theme-canvas-port.hooks.ts` for why the split exists and why this wraps global `fetch` directly
 * instead of `lib/api`'s `api` client.
 */

/** The live implementation — same status-check shape `post-template-dependencies.hooks.ts` uses for
 *  the sibling `/theme-assets/...` fetch, with `.json()`/`.text()` chosen per what each method
 *  actually returns (a theme template's own markup has no reason to be valid JSON). */
export const defaultThemeCanvasPort: ThemeCanvasPort = {
  async fetchThemeTokens(url: string): Promise<ThemeTokens> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the theme server responded with ${res.status}`);
    return (await res.json()) as ThemeTokens;
  },
  async fetchTemplateMarkup(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the theme server responded with ${res.status}`);
    return res.text();
  },
};

/** Seed state for {@link createFakeThemeCanvasPort}. Keyed by URL so one fake can answer the theme's
 *  required `tokens.json` and its optional `tokens.light.json` differently — including "the light one
 *  404s", which is a supported real-world case, not an error. `templatesByUrl` is the same idea for
 *  template markup fetches. */
export interface FakeThemeCanvasPortOptions {
  tokensByUrl?: Record<string, ThemeTokens>;
  templatesByUrl?: Record<string, string>;
}

/**
 * An in-memory {@link ThemeCanvasPort} for tests — "every port gets a fake" (see
 * `theme-pages-dependencies.hooks.ts`). Any URL absent from `tokensByUrl`/`templatesByUrl` rejects,
 * matching what the real port does for a file the theme does not ship.
 */
export function createFakeThemeCanvasPort(options: FakeThemeCanvasPortOptions = {}): ThemeCanvasPort {
  return {
    async fetchThemeTokens(url: string) {
      const tokens = options.tokensByUrl?.[url];
      if (!tokens) throw new Error(`fake theme canvas port: nothing seeded at ${url}`);
      return tokens;
    },
    async fetchTemplateMarkup(url: string) {
      const markup = options.templatesByUrl?.[url];
      if (markup === undefined) throw new Error(`fake theme canvas port: nothing seeded at ${url}`);
      return markup;
    },
  };
}
