import type { TemplateSourcePort } from "./template-source-port.hooks";

/**
 * @file The only place `use-template-source.hooks.ts` reaches the real network — see
 * `template-source-port.hooks.ts` for why the split exists and why this wraps global `fetch`
 * directly instead of `lib/api`'s `api` client.
 *
 * Moved here from `features/posts/hooks/post-template-dependencies.hooks.ts` (2026-09-24) — see
 * that file header's sibling in `template-source-port.hooks.ts` for the full history.
 */

/** The live implementation — same status-check/`.text()` shape `TemplateSourceModal.tsx`'s
 *  pre-extraction inline `fetch(...).then(...)` chain used. */
export const defaultTemplateSourcePort: TemplateSourcePort = {
  async fetchTemplateSource(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the theme server responded with ${res.status}`);
    return res.text();
  },
};

/** Seed state for {@link createFakeTemplateSourcePort}. */
export interface FakeTemplateSourcePortOptions {
  html?: string;
  /** When set, `fetchTemplateSource()` rejects with this instead of resolving — for load-failure
   *  tests. */
  fetchTemplateSourceError?: Error;
}

/**
 * An in-memory {@link TemplateSourcePort} for tests — "every port gets a fake" (see
 * `theme-pages-dependencies.hooks.ts`).
 */
export function createFakeTemplateSourcePort(options: FakeTemplateSourcePortOptions = {}): TemplateSourcePort {
  return {
    async fetchTemplateSource() {
      if (options.fetchTemplateSourceError) throw options.fetchTemplateSourceError;
      return options.html ?? "";
    },
  };
}
