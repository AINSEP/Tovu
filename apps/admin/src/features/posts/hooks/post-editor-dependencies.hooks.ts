import { ApiError, api, type AdminMedia, type AdminPost, type AdminThemeSummary, type PresentationSettings } from "@/lib/api";
import { POST_VERSION_CONFLICT_CODE } from "../rules";
import type { StandingDraftAutosaveInput, StandingDraftAutosaveSnapshot } from "@/hooks/use-standing-draft-autosave.hooks";
import type { PostEditorPort } from "./post-editor-port.hooks";

/**
 * @file The only place `use-post-editor.hooks.ts` reaches `lib/api` — see `post-editor-port.hooks.ts`
 * for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultPostEditorPort: PostEditorPort = {
  getPost: (id) => api.getPost(id),
  getPresentation: () => api.getPresentation(),
  updatePost: (target, patch) => api.updatePost(target, patch),
  deletePost: (id) => api.deletePost(id),
  listPosts: () => api.listPosts(),
  uploadMedia: (input) => api.uploadMedia(input),
  templatePreviewUrl: (id, templateChoice) => api.templatePreviewUrl(id, templateChoice),
  putAutosave: (id, draft, options) => api.putAutosave(id, draft, options),
  getAutosave: (id) => api.getAutosave(id),
  discardAutosave: (id) => api.discardAutosave(id),
};

/** Seed state for {@link createFakePostEditorPort}. */
export interface FakePostEditorPortOptions {
  post?: AdminPost;
  presentation?: {
    settings?: Partial<PresentationSettings>;
    availableThemes?: AdminThemeSummary[];
    activeThemeTemplates?: string[];
    activeThemeStaticPageIds?: string[];
  };
  /** Rejects `getPost` with this message instead of resolving — the load-failure path. */
  getPostError?: string;
  /** Rejects `updatePost` with this message instead of resolving — the save-failure path. */
  updatePostError?: string;
  /** Rejects `deletePost` with this message instead of resolving — the delete-failure path. */
  deletePostError?: string;
  /** Mention feature's picker list — defaults to `[]` (no other posts to mention), same
   *  "explicit seed, safe empty default" shape every other array/list field on this options type
   *  already follows. */
  mentionablePosts?: AdminPost[];
  /** File-handler feature (2026-08-12) — the `AdminMedia` `uploadMedia` resolves with; defaults to
   *  {@link DEFAULT_MEDIA}. */
  uploadMediaResult?: AdminMedia;
  /** Rejects `uploadMedia` with this message instead of resolving — the upload-failure path. */
  uploadMediaError?: string;
  /** Seeds a standing draft as though a previous session had already parked one — the recovery-
   *  banner test seam. Absent/`undefined` means "nothing to recover", the common case. */
  autosave?: StandingDraftAutosaveSnapshot;
}

const DEFAULT_POST: AdminPost = {
  id: "fake-post-1",
  workspaceId: "fake-ws",
  kind: "post",
  title: "Fake Post",
  slug: "fake-post",
  bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
  bodyFormat: "doc",
  status: "draft",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: new Date(0).toISOString(),
  version: 1,
};

/** {@link FakePostEditorPortOptions.uploadMediaResult}'s own default — an arbitrary but complete
 *  `AdminMedia`, same "every field present, satisfies the real interface" bar {@link DEFAULT_POST}
 *  sets for itself. */
const DEFAULT_MEDIA: AdminMedia = {
  id: "fake-media-1",
  workspaceId: "fake-ws",
  title: "fake-upload.png",
  slug: "fake-upload-png",
  alt: "",
  caption: "",
  credit: "",
  sha256: "fake-sha256",
  status: "active",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  version: 1,
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
  contentType: "image/png",
  publicUrl: null,
};

/**
 * An in-memory {@link PostEditorPort} for tests — the fake that lets a test describe "this post is
 * loaded, published, with these theme templates" directly instead of stubbing global `fetch` or a
 * `FetchQueryProvider` (this hook does not use `lib/fetch-query` at all — see its own file header —
 * so unlike `createFakeRedirectsPort`, no query/mutation wiring sits between this fake and the hook).
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 *
 * `updatePost`/`deletePost` mutate the fake's own stored `post` so a test can chain a save/delete and
 * then assert the NEXT `getPost` (or a later assertion against `port.post`) reflects it — matching
 * `createFakeRedirectsPort`'s own "the fake's own store is the assertion surface" shape.
 */
export function createFakePostEditorPort(options: FakePostEditorPortOptions = {}): PostEditorPort & {
  /** The fake's current row — read directly to assert a save/delete's effect without a second `getPost` round-trip. */
  post: AdminPost;
  /** Every `putAutosave` draft this fake received, in call order. */
  readonly putAutosaveCalls: StandingDraftAutosaveInput[];
  /** Whether `discardAutosave` has been called at least once. */
  readonly discardAutosaveCalled: boolean;
  /** Every `updatePost` patch this fake received, in call order — the assertion surface for "did
   *  the editor actually SEND the basis version", which `post` alone cannot show (a patch the fake
   *  applied and a patch it merely received look identical in the stored row). */
  readonly updatePostCalls: Array<Partial<AdminPost> & { expectedVersion?: number }>;
  /** Advances the stored row as though a DIFFERENT operator had just saved it, without the editor
   *  under test knowing — the only way to reach a genuine stale-basis conflict rather than faking
   *  the rejection. */
  simulateConcurrentSave(title?: string): void;
} {
  const state = { post: options.post ?? { ...DEFAULT_POST } };
  const settings: PresentationSettings = {
    workspaceId: "fake-ws",
    activeThemeId: "fake-theme",
    updatedAt: new Date(0).toISOString(),
    ...options.presentation?.settings,
  };
  let autosave: StandingDraftAutosaveSnapshot | null = options.autosave ?? null;
  const putAutosaveCalls: StandingDraftAutosaveInput[] = [];
  let discardAutosaveCalled = false;
  const updatePostCalls: Array<Partial<AdminPost> & { expectedVersion?: number }> = [];

  return {
    get post() {
      return state.post;
    },
    set post(value) {
      state.post = value;
    },
    putAutosaveCalls,
    updatePostCalls,
    get discardAutosaveCalled() {
      return discardAutosaveCalled;
    },

    simulateConcurrentSave(title = "Saved by someone else") {
      state.post = { ...state.post, title, version: state.post.version + 1 };
    },

    async getPost() {
      if (options.getPostError) throw new Error(options.getPostError);
      return { post: state.post };
    },

    async getPresentation() {
      return {
        settings,
        availableThemes: options.presentation?.availableThemes ?? [],
        activeThemeTemplates: options.presentation?.activeThemeTemplates ?? [],
        activeThemeStaticPageIds: options.presentation?.activeThemeStaticPageIds ?? [],
      };
    },

    async updatePost(target, patch) {
      updatePostCalls.push(patch);
      if (options.updatePostError) throw new Error(options.updatePostError);
      if (target.id !== state.post.id) throw new Error(`fake post not found: ${target.id}`);
      // The real route's optimistic-concurrency guard, modeled rather than stubbed (2026-09-06):
      // the same opt-in strict-equality compare `updatePost` runs server-side, rejecting with the
      // same `ApiError` shape `lib/api.ts` builds from a `409 VERSION_CONFLICT` body. Modeled here
      // so a hook test reaches a conflict by actually being stale (`simulateConcurrentSave`), not
      // by seeding a canned rejection that would pass just as happily if the editor never sent a
      // version at all.
      const { expectedVersion, ...fields } = patch;
      if (expectedVersion !== undefined && expectedVersion !== state.post.version) {
        throw new ApiError(
          `post '${state.post.id}' was modified by another save (expected version ${expectedVersion}, current version ${state.post.version})`,
          409,
          POST_VERSION_CONFLICT_CODE,
          { details: { expectedVersion, currentVersion: state.post.version } }
        );
      }
      // `fields`, not `patch` — `expectedVersion` is a basis to compare, never a column to store.
      state.post = { ...state.post, ...fields, version: state.post.version + 1 };
      return { post: state.post };
    },

    async deletePost(id) {
      if (options.deletePostError) throw new Error(options.deletePostError);
      if (id !== state.post.id) throw new Error(`fake post not found: ${id}`);
      return { post: state.post };
    },

    async listPosts() {
      return { posts: (options.mentionablePosts ?? []).map((post) => ({ post })) };
    },

    async uploadMedia() {
      if (options.uploadMediaError) throw new Error(options.uploadMediaError);
      return { media: options.uploadMediaResult ?? DEFAULT_MEDIA };
    },

    // A distinct `fake://` scheme, not `api.templatePreviewUrl`'s real `siteUrl(...)`-wrapped
    // `/api/admin/...` shape — same "the fake proves the seam, not just the shape" reasoning
    // `createFakePageEditorPort`'s identical member documents.
    templatePreviewUrl(id, templateChoice) {
      return `fake://template-preview/${id}?templateChoice=${templateChoice ?? ""}`;
    },

    // Models the real guard, not just the happy path: `writeAutosave`
    // (`apps/website/src/features/post/repo.sqlite.ts`) is one `UPDATE ... WHERE version =
    // baseVersion`, so a draft built on a superseded basis is REFUSED — `{ applied: false }`, and
    // nothing is parked. Reproducing that here is what lets a test reach a genuine stale basis via
    // `simulateConcurrentSave` instead of stubbing the answer, which would pass whether or not the
    // editor reads `applied` at all. The call is still recorded: "the editor sent a write the
    // server threw away" is exactly the observation a stale-basis test needs.
    async putAutosave(id, draft) {
      if (id !== state.post.id) throw new Error(`fake post not found: ${id}`);
      putAutosaveCalls.push(draft);
      if (draft.baseVersion !== state.post.version) return { applied: false };
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
