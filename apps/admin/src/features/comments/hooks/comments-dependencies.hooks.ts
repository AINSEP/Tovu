import { api } from "../../../lib/api";
import type { CommentsPort } from "./comments-port.hooks";

/**
 * @file The only place `use-comments.hooks.ts` reaches `lib/api` — see `comments-port.hooks.ts` for
 * why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultCommentsPort: CommentsPort = {
  me: () => api.me(),
};

/** Seed state for {@link createFakeCommentsPort}. */
export interface FakeCommentsPortOptions {
  effectivePermissions?: string[];
  /** When set, `me()` rejects with this instead of resolving — for load-failure tests. */
  meError?: Error;
}

/**
 * An in-memory {@link CommentsPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeCommentsPort(options: FakeCommentsPortOptions = {}): CommentsPort {
  return {
    async me() {
      if (options.meError) throw options.meError;
      return { effectivePermissions: options.effectivePermissions ?? [] };
    },
  };
}
