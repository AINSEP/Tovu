import {
  api,
  type AdminComment,
  type AdminCommentsQueuePage,
  type CommentModerationAction,
  type CommentStatus,
} from "@/lib/api";
import type { CommentQueuePort } from "./comment-queue-port.hooks";

/**
 * @file The only place `use-comment-queue.hooks.ts` reaches `lib/api` — see `comment-queue-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultCommentQueuePort: CommentQueuePort = {
  listCommentsQueue: (options) => api.listCommentsQueue(options),
  moderateComment: (input) => api.moderateComment(input),
  purgeComment: (input) => api.purgeComment(input),
};

/** Seed state for {@link createFakeCommentQueuePort}. */
export interface FakeCommentQueuePortOptions {
  items?: AdminComment[];
  nextCursor?: string | null;
  /** When set, `listCommentsQueue()` rejects with this instead of resolving — for load-failure
   *  tests. */
  listError?: Error;
  /** When set, `moderateComment()` rejects with this instead of resolving — for
   *  moderation-failure tests. */
  moderateError?: Error;
  /** When set, `purgeComment()` rejects with this instead of resolving — for purge-failure
   *  tests. */
  purgeError?: Error;
}

/**
 * An in-memory {@link CommentQueuePort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `listCommentsQueue` always returns the full seeded
 * page regardless of `status`/`cursor` — this hook's own paging/filter logic lives in the CALLER
 * (its `status` state, its cursor bookkeeping), not in the port, so the fake does not need to
 * simulate server-side filtering to prove the hook wires those params through correctly (see the
 * `records the requested status/cursor` test below, which asserts on the port's own call log
 * instead).
 */
export function createFakeCommentQueuePort(options: FakeCommentQueuePortOptions = {}): CommentQueuePort & {
  /** Every `listCommentsQueue` call's options, in call order — lets a test assert the hook passed
   *  through the right status/cursor without the fake needing to filter anything itself. */
  readonly listCalls: Array<{ status?: CommentStatus; cursor?: string }>;
  /** Every `moderateComment` call's input, in call order. */
  readonly moderateCalls: Array<{ commentId: string; action: CommentModerationAction; expectedVersion: number }>;
  /** Every `purgeComment` call's input, in call order. */
  readonly purgeCalls: Array<{ commentId: string }>;
} {
  const listCalls: Array<{ status?: CommentStatus; cursor?: string }> = [];
  const moderateCalls: Array<{ commentId: string; action: CommentModerationAction; expectedVersion: number }> = [];
  const purgeCalls: Array<{ commentId: string }> = [];

  return {
    listCalls,
    moderateCalls,
    purgeCalls,
    async listCommentsQueue(queryOptions) {
      listCalls.push(queryOptions);
      if (options.listError) throw options.listError;
      const page: AdminCommentsQueuePage = { items: options.items ?? [], nextCursor: options.nextCursor ?? null };
      return page;
    },
    async moderateComment(input) {
      moderateCalls.push(input);
      if (options.moderateError) throw options.moderateError;
    },
    async purgeComment(input) {
      purgeCalls.push(input);
      if (options.purgeError) throw options.purgeError;
    },
  };
}
