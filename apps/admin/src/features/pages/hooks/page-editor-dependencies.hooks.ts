import { api, type AdminPost } from "../../../lib/api";
import type { PageEditorPort } from "./page-editor-port.hooks";

/**
 * @file The only place under `features/pages/hooks` that reaches `lib/api` for these five routes —
 * see `page-editor-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. `getPresentation` narrows `api.getPresentation()`'s wider response down to
 *  the one field this port promises. */
export const defaultPageEditorPort: PageEditorPort = {
  getPage: (routeSlug) => api.getPage(routeSlug),
  getPresentation: async () => {
    const { activeThemeTemplates } = await api.getPresentation();
    return { activeThemeTemplates };
  },
  updatePageHtml: (id, html) => api.updatePageHtml(id, html),
  updatePost: (target, patch) => api.updatePost(target, patch),
  deletePage: (id) => api.deletePage(id),
};

/** Seed state for {@link createFakePageEditorPort}. */
export interface FakePageEditorPortOptions {
  page: AdminPost;
  activeThemeTemplates?: string[];
}

/**
 * An in-memory {@link PageEditorPort} for tests — the fake that lets a test describe "this page is
 * html-format" or "the write fails" directly, instead of hand-building fetch `Response`s. Shipped
 * alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 *
 * Keyed by `page.id`, not `routeSlug` — `getPage` accepts whatever slug the test passes in and
 * returns the seeded page regardless, matching the real route's id-or-slug lookup without needing a
 * second seed value.
 */
export function createFakePageEditorPort(options: FakePageEditorPortOptions): PageEditorPort & {
  /** The page as currently held by the fake, after any writes made through the port. */
  readonly current: AdminPost;
  /** Every `updatePost` patch this fake received, in call order. */
  readonly updatePostCalls: Array<Partial<AdminPost>>;
  /** Every `updatePageHtml` body this fake received, in call order. */
  readonly updatePageHtmlCalls: string[];
  /** Whether `deletePage` has been called at least once. A getter, not a plain field — a plain
   *  field copied out at construction time would never reflect a call made after the port was
   *  returned, the same trap `current`'s getter avoids for `page`. */
  readonly deleteCalled: boolean;
} {
  let page = { ...options.page };
  const updatePostCalls: Array<Partial<AdminPost>> = [];
  const updatePageHtmlCalls: string[] = [];
  let deleteCalled = false;

  return {
    get current() {
      return page;
    },
    updatePostCalls,
    updatePageHtmlCalls,
    get deleteCalled() {
      return deleteCalled;
    },

    async getPage() {
      return { post: page };
    },

    async getPresentation() {
      return { activeThemeTemplates: options.activeThemeTemplates ?? [] };
    },

    async updatePageHtml(id, html) {
      if (id !== page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      updatePageHtmlCalls.push(html);
      page = { ...page, bodyHtml: html };
      return { post: page };
    },

    async updatePost({ id }, patch) {
      if (id !== page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      updatePostCalls.push(patch);
      page = { ...page, ...patch };
      return { post: page };
    },

    async deletePage(id) {
      if (id !== page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      deleteCalled = true;
      return { post: page };
    },
  };
}
