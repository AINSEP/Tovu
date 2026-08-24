import { api, type AdminMedia, type AdminPost, type AdminThemeSummary, type PresentationSettings } from "../../../lib/api";
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
  contentType: "image/png",
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
} {
  const state = { post: options.post ?? { ...DEFAULT_POST } };
  const settings: PresentationSettings = {
    workspaceId: "fake-ws",
    activeThemeId: "fake-theme",
    updatedAt: new Date(0).toISOString(),
    ...options.presentation?.settings,
  };

  return {
    get post() {
      return state.post;
    },
    set post(value) {
      state.post = value;
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
      if (options.updatePostError) throw new Error(options.updatePostError);
      if (target.id !== state.post.id) throw new Error(`fake post not found: ${target.id}`);
      state.post = { ...state.post, ...patch, version: state.post.version + 1 };
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
  };
}
