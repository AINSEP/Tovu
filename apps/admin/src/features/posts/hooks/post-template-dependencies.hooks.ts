import type { PostTemplatePort } from "./post-template-port.hooks";

/**
 * @file The only place `use-post-template-source.hooks.ts` reaches the real network — see
 * `post-template-port.hooks.ts` for why the split exists and why this wraps global `fetch`
 * directly instead of `lib/api`'s `api` client.
 */

/** The live implementation — same status-check/`.text()` shape `PostTemplateModal.tsx`'s
 *  pre-extraction inline `fetch(...).then(...)` chain used. */
export const defaultPostTemplatePort: PostTemplatePort = {
  async fetchTemplateSource(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the theme server responded with ${res.status}`);
    return res.text();
  },
};

/** Seed state for {@link createFakePostTemplatePort}. */
export interface FakePostTemplatePortOptions {
  html?: string;
  /** When set, `fetchTemplateSource()` rejects with this instead of resolving — for load-failure
   *  tests. */
  fetchTemplateSourceError?: Error;
}

/**
 * An in-memory {@link PostTemplatePort} for tests — "every port gets a fake" (see
 * `theme-pages-dependencies.hooks.ts`).
 */
export function createFakePostTemplatePort(options: FakePostTemplatePortOptions = {}): PostTemplatePort {
  return {
    async fetchTemplateSource() {
      if (options.fetchTemplateSourceError) throw options.fetchTemplateSourceError;
      return options.html ?? "";
    },
  };
}
