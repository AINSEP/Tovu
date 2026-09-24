import { api, type AdminPost } from "@/lib/api";
import type { DashboardPort } from "./dashboard-port.hooks";

/**
 * @file The only place under `features/dashboard` that reaches `lib/api` — see
 * `dashboard-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. Each method wraps its `api` counterpart
 *  explicitly rather than pointing at it directly, matching `media-dependencies.hooks.ts`'s own
 *  reasoning — a route's own parameter shape (`listCommentsQueue`'s `options`) stays `lib/api.ts`'s
 *  to own. */
export const defaultDashboardPort: DashboardPort = {
  listPosts: () => api.listPosts(),
  listPages: () => api.listPages(),
  listMedia: () => api.listMedia(),
  listCommentsQueue: (options) => api.listCommentsQueue(options),
  getPresentation: () => api.getPresentation(),
  getPasswordStatus: async () => {
    const [status, me] = await Promise.all([api.getPasswordStatus(), api.me()]);
    return { usesDefaultPassword: status.usesDefaultPassword, principalId: me.user.id };
  },
};

/** Seed state for {@link createFakeDashboardPort}. Every field is independent — a test can seed
 *  just the one stat it cares about and let the rest default to "empty, no error", mirroring how
 *  `useDashboard` treats its five reads as unrelated sources (see that hook's own file header). */
export interface FakeDashboardPortOptions {
  posts?: AdminPost[];
  pages?: AdminPost[];
  /** Only `status` is read (`useDashboard` counts `status === "active"` rows) — narrowed the same
   *  way the port itself narrows `listMedia`. */
  media?: Array<{ status: string }>;
  /** Only the pending-queue LENGTH is read — seeded as a count rather than real `AdminComment`
   *  rows, matching the port's own `items: unknown[]` narrowing. */
  pendingCommentsCount?: number;
  activeThemeId?: string;
  /** Defaults to `false` — a test seeds `true` to exercise the default-password banner. */
  usesDefaultPassword?: boolean;
  /** The caller's own id the fake reports. Defaults to `"fake-user-1"`. */
  principalId?: string;
  listPostsError?: Error;
  listPagesError?: Error;
  listMediaError?: Error;
  listCommentsQueueError?: Error;
  getPresentationError?: Error;
  getPasswordStatusError?: Error;
}

/**
 * An in-memory {@link DashboardPort} for tests — "every port gets a fake" (see
 * `media-dependencies.hooks.ts`). Each of the five methods resolves or rejects independently, so a
 * test can describe "posts loaded but comments failed" directly instead of hand-building five
 * `Response` objects and stubbing global `fetch`.
 */
export function createFakeDashboardPort(options: FakeDashboardPortOptions = {}): DashboardPort {
  return {
    async listPosts() {
      if (options.listPostsError) throw options.listPostsError;
      return { posts: (options.posts ?? []).map((post) => ({ post })) };
    },
    async listPages() {
      if (options.listPagesError) throw options.listPagesError;
      return { posts: (options.pages ?? []).map((post) => ({ post })) };
    },
    async listMedia() {
      if (options.listMediaError) throw options.listMediaError;
      return { media: options.media ?? [] };
    },
    async listCommentsQueue() {
      if (options.listCommentsQueueError) throw options.listCommentsQueueError;
      return { items: Array.from({ length: options.pendingCommentsCount ?? 0 }) };
    },
    async getPresentation() {
      if (options.getPresentationError) throw options.getPresentationError;
      return { settings: { activeThemeId: options.activeThemeId ?? "fake-theme" } };
    },
    async getPasswordStatus() {
      if (options.getPasswordStatusError) throw options.getPasswordStatusError;
      return { usesDefaultPassword: options.usesDefaultPassword ?? false, principalId: options.principalId ?? "fake-user-1" };
    },
  };
}
