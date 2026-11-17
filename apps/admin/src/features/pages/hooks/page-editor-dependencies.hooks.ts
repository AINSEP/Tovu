import { getAdminDraftIdentity } from "@/lib/admin-draft-identity";
import type { ThemeTier } from "@/features/themes/api/themes-api.types";
import { themesApi } from "@/features/themes/api/themes-api";
import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { postsApi } from "@/features/posts/api/posts-api";
import { pagesApi } from "@/features/pages/api/pages-api";
import { ApiError } from "@/lib/admin-http/request";
import type { StandingDraftAutosaveInput, StandingDraftAutosaveSnapshot } from "@/hooks/use-standing-draft-autosave.hooks";
import type { PageEditorPort } from "./page-editor-port.hooks";
import { PAGE_VERSION_CONFLICT_CODE } from "../rules";

/**
 * @file The only place under `features/pages/hooks` that reaches `lib/api` for these five routes —
 * see `page-editor-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s
 *  `redirectsHostPorts`. `getPresentation` narrows `api.getPresentation()`'s wider response down to
 *  the fields this port promises. */
export const defaultPageEditorPort: PageEditorPort = {
  getPage: ({ routeSlug }, _options = {}) => pagesApi.getPage({ id: routeSlug }),
  getPresentation: async () => {
    const { activeThemeTemplates, settings, availableThemes } = await themesApi.getPresentation({ kind: "page" });
    const activeTheme = availableThemes.find((theme) => theme.id === settings.activeThemeId);
    return {
      activeThemeTemplates,
      activeThemeId: settings.activeThemeId,
      activeThemeApiVersion: activeTheme?.apiVersion,
      // "View Template" parity with `features/posts` (2026-09-24) — same `?? null` normalization
      // `usePostEditor`'s own load effect applies for "theme absent from `availableThemes`".
      activeThemeTier: activeTheme?.tier ?? null,
    };
  },
  updatePageHtml: ({ id, html }, _options = {}) => pagesApi.updatePageHtml({ id, html }),
  // The shared posts route saves pages too; `entry` makes a failure notice say "page".
  updatePost: ({ target, patch }, _options = {}) => postsApi.updatePost(target, { options: patch, entry: "page" }),
  deletePage: ({ id }, _options = {}) => pagesApi.deletePage({ id }),
  templatePreviewUrl: ({ id, templateChoice }, _options = {}) => postsApi.templatePreviewUrl({ id, templateChoice }),
  putAutosave: ({ id, draft }, options = {}) => postsApi.putAutosave({ id, draft }, options),
  getBackupPrincipalId: () => getAdminDraftIdentity(),
  getAutosave: ({ id }, _options = {}) => postsApi.getAutosave({ id }),
  discardAutosave: ({ id }, _options = {}) => postsApi.discardAutosave({ id }),
};

/** Seed state for {@link createFakePageEditorPort}. */
export interface FakePageEditorPortOptions {
  page: AdminPost;
  activeThemeTemplates?: string[];
  activeThemeId?: string;
  activeThemeApiVersion?: 2;
  /** "View Template" parity with `features/posts`' `createFakePostEditorPort` (2026-09-24). `null`
   *  default matches the real port's own "theme absent from `availableThemes`" fallback. */
  activeThemeTier?: ThemeTier | null;
  /** Seeds a standing draft as though a previous session had already parked one — the recovery-
   *  banner test seam. Absent/`undefined` means "nothing to recover", the common case. */
  autosave?: StandingDraftAutosaveSnapshot;
}

type FakePageState = {
  page: AdminPost;
  updatePostCalls: Array<Partial<AdminPost> & { expectedVersion?: number }>;
  updatePageHtmlCalls: string[];
  deleteCalled: boolean;
  autosave: StandingDraftAutosaveSnapshot | null;
  putAutosaveCalls: StandingDraftAutosaveInput[];
  discardAutosaveCalled: boolean;
  getPageCalls: number;
};

/** Writes made "by someone else", for tests that need a genuine stale basis. */
function fakeSimulations({ state }: { state: FakePageState }): { simulateConcurrentSave(required: {}, optional?: { title?: string }): void; simulateExternalWrite(required: { patch: Partial<AdminPost> }): void } {
  return {
    simulateConcurrentSave({}, { title = "Saved by someone else" } = {}) {
      state.page = { ...state.page, title, version: state.page.version + 1 };
    },

    simulateExternalWrite({ patch }) {
      state.page = { ...state.page, ...patch, version: state.page.version + 1 };
    }
  };
}

/** Reads: the page, the presentation and the template preview URL. */
function fakeReads({ state, options }: { state: FakePageState; options: FakePageEditorPortOptions }): Pick<PageEditorPort, "getPage" | "getPresentation" | "templatePreviewUrl"> {
  return {
    async getPage() {
      state.getPageCalls += 1;
      return { post: state.page };
    },

    async getPresentation() {
      return {
        activeThemeTemplates: options.activeThemeTemplates ?? [],
        // A distinct default, not `"basic"` — a test asserting a canvas URL built from THIS fake
        // fails if the editor ever goes back to reading the real active theme directly.
        activeThemeId: options.activeThemeId ?? "fake-theme",
        activeThemeApiVersion: options.activeThemeApiVersion,
        activeThemeTier: options.activeThemeTier ?? null,
      };
    },

    // A distinct `fake://` scheme, not `api.templatePreviewUrl`'s real `siteUrl(...)`-wrapped
    // `/api/admin/...` shape — so a test asserting the rendered iframe's `src` came from THIS fake
    // fails if `PageEditor.tsx`'s preview ever goes back to calling the real `api` directly.
    templatePreviewUrl({ id, templateChoice }) {
      return `fake://template-preview/${id}?templateChoice=${templateChoice ?? ""}`;
    },
  };
}

/** Writes: html body, metadata patch (with the real optimistic-concurrency guard) and delete. */
function fakeWrites({ state }: { state: FakePageState }): Pick<PageEditorPort, "updatePageHtml" | "updatePost" | "deletePage"> {
  return {
    // Mirrors the real route's `ensureHtmlFormat` + `write` pair (`apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts`):
    // the FIRST call on a still-`doc`-format row converts it to `html` AND drops `body_json`. Modelled
    // here rather than only storing `bodyHtml`, so a test that saves twice sees the same row shape the
    // server would hand back on the second load — without it this fake would report a converted page
    // as still `doc`-format forever, which is exactly the state `pageAcceptsHtmlBody` branches on.
    async updatePageHtml({ id, html }) {
      if (id !== state.page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      state.updatePageHtmlCalls.push(html);
      // `version` is bumped because the real writer bumps it: `PagesHtmlDocumentStore.write()`
      // (`apps/website/src/features/pages/html-document-store.sqlite.ts`) sets `version: version + 1`
      // on every successful body write. The fake used to leave it alone, which made a save that
      // wrote BOTH routes look — to any test — like it had only consumed one version step. That
      // hid the ordering bug this fake now models: with the body written first, the basis the
      // editor loaded is already stale by the time the metadata write claims it.
      state.page = { ...state.page, bodyFormat: "html", bodyJson: {}, bodyHtml: html, version: state.page.version + 1 };
      return { post: state.page };
    },

    async updatePost({ target: { id }, patch }) {
      if (id !== state.page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      state.updatePostCalls.push(patch);
      // The real route's optimistic-concurrency guard, modeled rather than stubbed: the same opt-in
      // strict-equality compare `updatePost` runs server-side, rejecting with the same `ApiError`
      // shape `lib/api.ts` builds from a `409 VERSION_CONFLICT` body. Mirrors
      // `createFakePostEditorPort`'s identical block, and is modeled here so a hook test reaches a
      // conflict by actually BEING stale (`simulateConcurrentSave`) rather than by seeding a canned
      // rejection that would pass just as happily if the editor never sent a version at all.
      const { expectedVersion, ...fields } = patch;
      if (expectedVersion !== undefined && expectedVersion !== state.page.version) {
        throw new ApiError(
          { message: `page '${state.page.id}' was modified by another save (expected version ${expectedVersion}, current version ${state.page.version})`,
          status: 409 },
          { code: PAGE_VERSION_CONFLICT_CODE,
          body: { details: { expectedVersion, currentVersion: state.page.version } } }
        );
      }
      state.page = { ...state.page, ...fields, version: state.page.version + 1 };
      return { post: state.page };
    },

    async deletePage({ id }) {
      if (id !== state.page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      state.deleteCalled = true;
      return { post: state.page };
    },
  };
}

/** The standing-draft autosave seam. */
function fakeAutosave({ state }: { state: FakePageState }): Pick<PageEditorPort, "putAutosave" | "getAutosave" | "discardAutosave"> {
  return {
    // Models the real guard, not just the happy path — see `createFakePostEditorPort`'s identical
    // member for the full reasoning: `writeAutosave` is one `UPDATE ... WHERE version =
    // baseVersion`, so a draft built on a superseded basis is refused and nothing is parked. The
    // call is still recorded, because "the editor sent a write the server threw away" is the
    // observation a stale-basis test needs.
    async putAutosave({ id, draft }, _options = {}) {
      if (id !== state.page.id) throw new Error(`fake page editor port: unknown page id ${id}`);
      state.putAutosaveCalls.push(draft);
      if (draft.baseVersion !== state.page.version) return { applied: false };
      state.autosave = { ...draft, savedAt: "2026-09-06T00:00:00.000Z", savedByPrincipalId: "user-local" };
      return { applied: true };
    },

    async getAutosave() {
      return { autosave: state.autosave };
    },

    async discardAutosave() {
      state.discardAutosaveCalled = true;
      state.autosave = null;
      return { ok: true };
    },
  };
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
  /** Every `updatePost` patch this fake received, in call order — the assertion surface for "did
   *  the editor actually SEND the basis version", which `current` alone cannot show (a patch the
   *  fake applied and a patch it merely received look identical in the stored row). */
  readonly updatePostCalls: Array<Partial<AdminPost> & { expectedVersion?: number }>;
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
  /** Advances the stored row as though a DIFFERENT operator had just saved it, without the editor
   *  under test knowing — the only way to reach a genuine stale-basis refusal from `putAutosave`
   *  rather than stubbing the rejection. Mirrors `createFakePostEditorPort`'s identical member. */
  simulateConcurrentSave(required: {}, optional?: { title?: string }): void;
  /** Advances the stored row as though an agent tool (`pages_write_html` / `pages_write_region`)
   *  wrote it — the content-refresh background check's own trigger, distinct from
   *  {@link simulateConcurrentSave} only in NAME (both bump `version` the identical way); kept as a
   *  separate method so a test reads as "the assistant changed this" rather than "another operator's
   *  Save", matching the scenario `use-external-entry-refresh.hooks.ts` is testing for. */
  simulateExternalWrite(required: { patch: Partial<AdminPost> }): void;
  /** Count of `getPage` calls this fake has served — the assertion surface for "a notification that
   *  named other resources cost no fetch", which `current` alone cannot show. */
  readonly getPageCalls: number;
} {
  const state: FakePageState = {
    page: { ...options.page },
    updatePostCalls: [],
    updatePageHtmlCalls: [],
    deleteCalled: false,
    autosave: options.autosave ?? null,
    putAutosaveCalls: [],
    discardAutosaveCalled: false,
    getPageCalls: 0,
  };

  return {
    get current() {
      return state.page;
    },
    updatePostCalls: state.updatePostCalls,
    updatePageHtmlCalls: state.updatePageHtmlCalls,
    get deleteCalled() {
      return state.deleteCalled;
    },
    putAutosaveCalls: state.putAutosaveCalls,
    get discardAutosaveCalled() {
      return state.discardAutosaveCalled;
    },
    get getPageCalls() {
      return state.getPageCalls;
    },
    ...fakeSimulations({ state }),
    ...fakeReads({ state, options }),
    ...fakeWrites({ state }),
    ...fakeAutosave({ state }),
  };
}
