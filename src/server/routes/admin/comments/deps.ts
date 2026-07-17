import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — narrow `RouteDeps` slice for the `comments-moderation`
 * server module (admin moderation queue/actions/settings — distinct from the already-shipped
 * Comments admin FRONTEND, SPEC-036/037, which is unrelated UI work).
 *
 * Purpose:
 * `moderation-queue.ts`/`moderate.ts` already declare their own narrower `Pick<RouteDeps, ...>`
 * types (`AdminCommentsModerationQueueDeps`/`AdminCommentsModerateDeps`, ADR-031 §6/§9,
 * SPEC-033) — this type is a genuine union of those two plus `get-settings.ts`/`put-settings.ts`'s
 * actual field needs (read directly rather than guessed), mirroring
 * `routes/admin/taxonomy/deps.ts`'s/`routes/admin/content/deps.ts`'s identical narrowing
 * rationale from SPEC-034/038.
 *
 * Each field's real reader, confirmed by reading all 4 registrar files directly:
 * - `workspaceId`/`authorize`: every one of the 4 registrars (the shared 404/403 dance).
 * - `commentRepo`: `moderation-queue.ts`'s `listModerationQueue` call.
 * - `commentWriteService`: `moderate.ts`'s `applyModeration`/`purge` calls.
 * - `commentsSettingsReady`: `get-settings.ts`/`put-settings.ts`, awaited before touching the
 *   settings ledger (mirrors `seoReady`'s identical convention).
 * - `settingsRepo`: `get-settings.ts`'s `getCommentsSettings` call and `put-settings.ts`'s
 *   `setCommentsSettings` call.
 * - `clock`/`idGen`/`principalRepo`: `put-settings.ts`'s `setCommentsSettings` call only
 *   (`get-settings.ts` doesn't write, so it never needs these three).
 */
export type CommentsModerationRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "commentRepo"
  | "commentWriteService"
  | "commentsSettingsReady"
  | "settingsRepo"
  | "clock"
  | "idGen"
  | "principalRepo"
>;
