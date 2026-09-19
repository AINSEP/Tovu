import { ApiError, api, type AdminPost } from "@/lib/api";
import { POST_VERSION_CONFLICT_CODE } from "../rules";
import type { PostsListPort } from "./posts-list-port.hooks";

/**
 * @file The only place `use-posts.hooks.ts` reaches `lib/api` — see `posts-list-port.hooks.ts` for
 * why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultPostsListPort: PostsListPort = {
  listPosts: () => api.listPosts(),
  createPost: (title) => api.createPost(title),
  updatePost: (target, patch) => api.updatePost(target, patch),
  deletePost: (id) => api.deletePost(id),
};

const FAKE_WORKSPACE_ID = "fake-ws";

function fakePost(overrides: Partial<AdminPost> = {}): AdminPost {
  return {
    id: overrides.id ?? "fake-post-1",
    workspaceId: FAKE_WORKSPACE_ID,
    kind: "post",
    title: "Untitled",
    slug: "untitled",
    bodyJson: {},
    bodyFormat: "doc",
    status: "draft",
    templateChoice: null,
    overridesThemePage: false,
    updatedAt: new Date(0).toISOString(),
    version: 1,
    ...overrides,
  };
}

/** Seed state for {@link createFakePostsListPort}. */
export interface FakePostsListPortOptions {
  posts?: AdminPost[];
  /** When set, `createPost()` rejects with this instead of resolving — for create-failure
   *  tests. */
  createError?: Error;
  /** When set, `updatePost()` rejects with this instead of resolving — for disable-failure
   *  tests. */
  updateError?: Error;
  /** When set, `deletePost()` rejects with this instead of resolving — for delete-failure
   *  tests. */
  deleteError?: Error;
}

/**
 * An in-memory {@link PostsListPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). Mirrors `pages-dependencies.hooks.ts`'s
 * `createFakePagesPort` — `Pages.tsx`/`Posts.tsx` are twin screens over the same shape of route.
 */
export function createFakePostsListPort(options: FakePostsListPortOptions = {}): PostsListPort & {
  /** Every post currently in the fake's store, in list order. */
  readonly posts: AdminPost[];
  /** Advances one stored row's version as though a DIFFERENT operator (the full editor, or another
   *  list action) had just saved it, without the caller under test knowing — the only way to reach a
   *  genuine stale-basis conflict rather than seeding a canned rejection. Mirrors
   *  `post-editor-dependencies.hooks.ts`'s identical `simulateConcurrentSave`. */
  simulateConcurrentSave(id: string, title?: string): void;
} {
  const posts = [...(options.posts ?? [])];

  return {
    posts,
    simulateConcurrentSave(id, title = "Saved by someone else") {
      const index = posts.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake post not found: ${id}`);
      posts[index] = { ...posts[index]!, title, version: posts[index]!.version + 1 };
    },
    async listPosts() {
      return { posts: posts.map((post) => ({ post })) };
    },
    async createPost(title) {
      if (options.createError) throw options.createError;
      const created = fakePost({ id: `fake-post-${posts.length + 1}`, title, slug: title.toLowerCase() });
      posts.push(created);
      return { post: created };
    },
    async updatePost({ id }, patch) {
      if (options.updateError) throw options.updateError;
      const index = posts.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake post not found: ${id}`);
      const current = posts[index]!;
      // The real route's optimistic-concurrency guard, modeled rather than stubbed — see
      // `post-editor-dependencies.hooks.ts`'s identical comment on its own `updatePost` for why this
      // is modeled (a caller reaches a conflict by genuinely being stale) rather than a canned
      // rejection (which would pass even if the caller never sent a version at all).
      const { expectedVersion, ...fields } = patch;
      if (expectedVersion !== undefined && expectedVersion !== current.version) {
        throw new ApiError(
          `post '${current.id}' was modified by another save (expected version ${expectedVersion}, current version ${current.version})`,
          409,
          POST_VERSION_CONFLICT_CODE,
          { details: { expectedVersion, currentVersion: current.version } }
        );
      }
      const updated = { ...current, ...fields, version: current.version + 1 };
      posts[index] = updated;
      return { post: updated };
    },
    async deletePost(id) {
      if (options.deleteError) throw options.deleteError;
      const index = posts.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake post not found: ${id}`);
      const [removed] = posts.splice(index, 1);
      return { post: removed! };
    },
  };
}
