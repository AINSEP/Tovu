import { api, type AdminPost } from "@/lib/api";
import type { StandingDraftAutosaveInput, StandingDraftAutosaveSnapshot } from "@/hooks/use-standing-draft-autosave.hooks";
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
    const { activeThemeTemplates, settings, availableThemes } = await api.getPresentation();
    const activeTheme = availableThemes.find((theme) => theme.id === settings.activeThemeId);
    return {
      activeThemeTemplates,
      activeThemeId: settings.activeThemeId,
      activeThemeApiVersion: activeTheme?.apiVersion,
    };
  },
  updatePageHtml: (id, html) => api.updatePageHtml(id, html),
  updatePost: (target, patch) => api.updatePost(target, patch),
  deletePage: (id) => api.deletePage(id),
  templatePreviewUrl: (id, templateChoice) => api.templatePreviewUrl(id, templateChoice),
  putAutosave: (id, draft) => api.putAutosave(id, draft),
  getAutosave: (id) => api.getAutosave(id),
  discardAutosave: (id) => api.discardAutosave(id),
};

/** Seed state for {@link createFakePageEditorPort}. */
export interface FakePageEditorPortOptions {
  page: AdminPost;
  activeThemeTemplates?: string[];
  activeThemeId?: string;
  activeThemeApiVersion?: 2;
  /** Seeds a standing draft as though a previous session had already parked one — the recovery-
   *  banner test seam. Absent/`undefined` means "nothing to recover", the common case. */
  autosave?: StandingDraftAutosaveSnapshot;
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
  /** Every `putAutosave` draft this fake received, in call order. */
  readonly putAutosaveCalls: StandingDraftAutosaveInput[];
  /** Whether `discardAutosave` has been called at least once. */
  readonly discardAutosaveCalled: boolean;
} {
  let page = { ...options.page };
  const updatePostCalls: Array<Partial<AdminPost>> = [];
  const updatePageHtmlCalls: string[] = [];
  let deleteCalled = false;
  let autosave: StandingDraftAutosaveSnapshot | null = options.autosave ?? null;
  const putAutosaveCalls: StandingDraftAutosaveInput[] = [];
  let discardAutosaveCalled = false;

  return {
    get current() {
      return page;
    },
    updatePostCalls,
    updatePageHtmlCalls,
    get deleteCalled() {
      return deleteCalled;
    },
    putAutosaveCalls,
    get discardAutosaveCalled() {
      return discardAutosaveCalled;
    },

    async getPage() {
      return { post: page };
    },

    async getPresentation() {
      return {
        activeThemeTemplates: options.activeThemeTemplates ?? [],
        // A distinct default, not `"basic"` — a test asserting a canvas URL built from THIS fake
        // fails if the editor ever goes back to reading the real active theme directly.
        activeThemeId: options.activeThemeId ?? "fake-theme",
        activeThemeApiVersion: options.activeThemeApiVersion,
      };
    },

    // Mirrors the real route's `ensureHtmlFormat` + `write` pair (`routes/admin/pages/update-html.ts`):
    // the FIRST call on a still-`doc`-format row converts it to `html` AND drops `body_json`. Modelled
    // here rather than only storing `bodyHtml`, so a test that saves twice sees the same row shape the
    // server would hand back on the second load — without it this fake would report a converted page
    // as still `doc`-format forever, which is exactly the state `pageAcceptsHtmlBody` branches on.
    async updatePageHtml(id, html) {
      if (id !== page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      updatePageHtmlCalls.push(html);
      page = { ...page, bodyFormat: "html", bodyJson: {}, bodyHtml: html };
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

    // A distinct `fake://` scheme, not `api.templatePreviewUrl`'s real `siteUrl(...)`-wrapped
    // `/api/admin/...` shape — so a test asserting the rendered iframe's `src` came from THIS fake
    // fails if `PageEditor.tsx`'s preview ever goes back to calling the real `api` directly.
    templatePreviewUrl(id, templateChoice) {
      return `fake://template-preview/${id}?templateChoice=${templateChoice ?? ""}`;
    },

    async putAutosave(id, draft) {
      if (id !== page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      putAutosaveCalls.push(draft);
      autosave = { ...draft, savedAt: "2026-09-06T00:00:00.000Z", savedByPrincipalId: "user-local" };
      return { applied: true };
    },

    async getAutosave() {
      return { autosave };
    },

    async discardAutosave() {
      discardAutosaveCalled = true;
      autosave = null;
      return { ok: true };
    },
  };
}
