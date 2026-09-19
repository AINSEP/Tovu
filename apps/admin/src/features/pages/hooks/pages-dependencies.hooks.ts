import { ApiError, api, type AdminPost } from "@/lib/api";
import { PAGE_VERSION_CONFLICT_CODE } from "../rules";
import type { PagesPort } from "./pages-port.hooks";

/**
 * @file The only place `use-pages.hooks.ts` reaches `lib/api` — see `pages-port.hooks.ts` for why
 * the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultPagesPort: PagesPort = {
  listPages: () => api.listPages(),
  createPage: (title) => api.createPage(title),
  updatePost: (target, patch) => api.updatePost(target, patch),
  deletePage: (id) => api.deletePage(id),
};

const FAKE_WORKSPACE_ID = "fake-ws";

function fakePage(overrides: Partial<AdminPost> = {}): AdminPost {
  return {
    id: overrides.id ?? "fake-page-1",
    workspaceId: FAKE_WORKSPACE_ID,
    kind: "page",
    title: "Untitled",
    slug: "untitled",
    bodyJson: {},
    bodyFormat: "html",
    bodyHtml: "",
    status: "draft",
    templateChoice: null,
    overridesThemePage: false,
    updatedAt: new Date(0).toISOString(),
    version: 1,
    ...overrides,
  };
}

/** Seed state for {@link createFakePagesPort}. */
export interface FakePagesPortOptions {
  pages?: AdminPost[];
  /** When set, `createPage()` rejects with this instead of resolving — for create-failure
   *  tests. */
  createError?: Error;
  /** When set, `updatePost()` rejects with this instead of resolving — for disable-failure
   *  tests. */
  updateError?: Error;
  /** When set, `deletePage()` rejects with this instead of resolving — for delete-failure
   *  tests. */
  deleteError?: Error;
}

/**
 * An in-memory {@link PagesPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakePagesPort(options: FakePagesPortOptions = {}): PagesPort & {
  /** Every page currently in the fake's store, in list order. */
  readonly pages: AdminPost[];
  /** Advances one stored row's version as though a DIFFERENT operator had just saved it — see
   *  `posts-list-dependencies.hooks.ts`'s identical `simulateConcurrentSave`. */
  simulateConcurrentSave(id: string, title?: string): void;
} {
  const pages = [...(options.pages ?? [])];

  return {
    pages,
    simulateConcurrentSave(id, title = "Saved by someone else") {
      const index = pages.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake page not found: ${id}`);
      pages[index] = { ...pages[index]!, title, version: pages[index]!.version + 1 };
    },
    async listPages() {
      return { posts: pages.map((post) => ({ post })) };
    },
    async createPage(title) {
      if (options.createError) throw options.createError;
      const created = fakePage({ id: `fake-page-${pages.length + 1}`, title, slug: title.toLowerCase() });
      pages.push(created);
      return { post: created };
    },
    async updatePost({ id }, patch) {
      if (options.updateError) throw options.updateError;
      const index = pages.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake page not found: ${id}`);
      const current = pages[index]!;
      // Modeled real guard — see `posts-list-dependencies.hooks.ts`'s identical comment.
      const { expectedVersion, ...fields } = patch;
      if (expectedVersion !== undefined && expectedVersion !== current.version) {
        throw new ApiError(
          `post '${current.id}' was modified by another save (expected version ${expectedVersion}, current version ${current.version})`,
          409,
          PAGE_VERSION_CONFLICT_CODE,
          { details: { expectedVersion, currentVersion: current.version } }
        );
      }
      const updated = { ...current, ...fields, version: current.version + 1 };
      pages[index] = updated;
      return { post: updated };
    },
    async deletePage(id) {
      if (options.deleteError) throw options.deleteError;
      const index = pages.findIndex((p) => p.id === id);
      if (index < 0) throw new Error(`fake page not found: ${id}`);
      const [removed] = pages.splice(index, 1);
      return { post: removed! };
    },
  };
}
