import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import { nowIso as clockNowIso } from "@jini-ai/core/primitives";

import { isTrashed } from "../../contracts/core/soft-delete.js";
import type { PostRecord } from "./post.js";

/**
 * @file Scheduled go-live announcements (2026-10-21) — the one place a scheduled post's
 * `entry.published` comes from.
 *
 * Visibility stays render-time (`contracts/core/scheduled-publish.ts`): no job has to run for a
 * scheduled post to become readable. Events cannot work that way. A save of a post scheduled for
 * later used to emit `entry.published` at SAVE time, so every outbox consumer (webhooks, SEO
 * sitemap/feed invalidation, newsletters, notifications) learned of embargoed content early, and
 * nothing fired again when it really went live. Saves now treat a scheduled row as not public
 * (`post.ts`'s `publicFacingStatus`), and this sweep announces it once its `publishAt` passes.
 *
 * Exactly once, with no new column: the event id is `${id}-entry.published-${version}`, the very
 * id the save of that version would have used had the row been live. Nothing else can hold that id
 * (the save emitted nothing), and the outbox ignores a repeated id, so a sweep that overlaps a
 * previous window, runs in two processes, or replays after a restart re-enqueues a no-op.
 *
 * "Was saved while still scheduled" is `publishAt > updatedAt` on the row itself: a row saved at or
 * after its go-live time was announced (or not) by that save, so the sweep must leave it alone.
 */

/** Idle wait between sweeps; bounds how late a go-live is announced. */
export const POST_GO_LIVE_SWEEP_INTERVAL_MS = 60_000;

/** How far behind the previous pass's instant each later pass re-reads. Covers a save whose
 *  transaction committed after a pass had already read past its `publishAt`; the overlap is safe
 *  because a repeated event id is a no-op. */
export const POST_GO_LIVE_LOOKBACK_MS = 10 * 60_000;

/** Lists the rows a go-live sweep must announce. */
export interface GoLiveCandidatesPort {
  /**
   * Published, non-trashed rows of `workspaceId` with `afterIso < publishAt <= nowIso` (no lower
   * bound when `afterIso` is absent) and `publishAt > updatedAt` — saved while still scheduled.
   * Oldest go-live first.
   */
  listGoLiveCandidates(required: { workspaceId: string; nowIso: string; afterIso?: string }): Promise<PostRecord[]>;
}

/** True when `post` was saved while scheduled and its go-live time has since passed, so the save
 *  that wrote it announced nothing and the sweep may not have run yet. @complexity O(1). */
export function wentLiveSinceSave(required: { post: PostRecord; nowIso: string }, _optional: Record<string, never> = {}): boolean {
  const { post, nowIso } = required;
  const { publishAt } = post;
  if (post.status !== "published" || isTrashed(post) || typeof publishAt !== "string") return false;
  return publishAt > post.updatedAt && publishAt <= nowIso;
}

/** The `entry.published` a scheduled row emits when it goes live; `occurredAt` is the go-live
 *  instant itself, not whenever the sweep happened to notice it. @complexity O(1). */
export function goLiveEvent(required: { post: PostRecord }, _optional: Record<string, never> = {}): DomainEvent {
  const { post } = required;
  return {
    id: `${post.id}-entry.published-${post.version}`,
    name: "entry.published",
    occurredAt: post.publishAt ?? post.updatedAt,
    aggregateId: post.id,
    workspaceId: post.workspaceId,
    payload: { entryId: post.id, contentType: post.kind },
  };
}

/**
 * Enqueues `entry.published` for every row that went live in the window.
 *
 * @param required.deps.repo lists the window's candidates.
 * @param required.deps.outbox receives one event per candidate; a repeated id must be a no-op.
 * @param required.input.workspaceId the served workspace.
 * @param required.input.nowIso the pass's instant.
 * @param optional.afterIso exclusive lower bound on `publishAt`; absent ⇒ full catch-up.
 * @returns how many candidates were enqueued (repeats included).
 * @complexity O(candidates).
 */
export async function announceDueGoLives(
  required: { deps: { repo: GoLiveCandidatesPort; outbox: OutboxPort }; input: { workspaceId: string; nowIso: string } },
  optional: { afterIso?: string } = {}
): Promise<{ announced: number }> {
  const { deps, input } = required;
  const due = await deps.repo.listGoLiveCandidates({ ...input, ...(optional.afterIso ? { afterIso: optional.afterIso } : {}) });
  for (const post of due) await deps.outbox.enqueue(goLiveEvent({ post }));
  return { announced: due.length };
}

type IntervalHandle = { unref?: () => void };

function warn(error: unknown): void {
  console.error("[post-go-live-sweep] sweep failed; retrying after the idle interval", error);
}

/**
 * Starts the go-live sweep: a full catch-up pass now (posts that went live while the process was
 * down), then a pass every `intervalMs` over the window since the previous successful pass minus
 * {@link POST_GO_LIVE_LOOKBACK_MS}. Same lifecycle shape as the submission-IP sweep: unref'd
 * interval, an overlapping tick is skipped (single-flight), and `stop()` waits for a pass in flight.
 * A failed pass keeps the previous window start, so the next pass retries the same range.
 *
 * Start it only in a site-serving process, after `createApp` has subscribed the bus handlers
 * (`serving-app.ts`), like the outbox drainer it feeds.
 *
 * @param required.deps.repo, required.deps.outbox, required.deps.clock what a pass reads/writes.
 * @param required.workspaceId the served workspace.
 * @param optional.intervalMs idle wait (default {@link POST_GO_LIVE_SWEEP_INTERVAL_MS}).
 * @param optional.onError receives a failed pass's error (default `console.error`); its own throw is swallowed.
 * @param optional.timers injectable `setInterval`/`clearInterval` (tests).
 * @returns `{ stop }`.
 * @throws RangeError for a non-positive interval.
 * @complexity O(candidates) per pass.
 */
export function startPostGoLiveSweep(
  required: { deps: { repo: GoLiveCandidatesPort; outbox: OutboxPort; clock: ClockPort }; workspaceId: string },
  optional: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    timers?: { setInterval: (fn: () => void, ms: number) => IntervalHandle; clearInterval: (handle: IntervalHandle) => void };
  } = {}
): { stop(): Promise<void> } {
  const { intervalMs = POST_GO_LIVE_SWEEP_INTERVAL_MS, onError = warn } = optional;
  const timers = optional.timers ?? { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>) };
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) throw new RangeError("post go-live sweep interval must be positive");
  const { deps, workspaceId } = required;
  let afterIso: string | undefined;
  let active: Promise<void> | undefined;
  let stopped = false;
  const run = async (): Promise<void> => {
    const nowIso = clockNowIso({ clock: deps.clock });
    try {
      await announceDueGoLives({ deps, input: { workspaceId, nowIso } }, { afterIso });
      afterIso = new Date(Date.parse(nowIso) - POST_GO_LIVE_LOOKBACK_MS).toISOString();
    } catch (error) {
      try { onError(error); } catch { /* A logging failure cannot reject timer work. */ }
    }
  };
  const pass = (): void => {
    if (stopped || active !== undefined) return;
    active = run().finally(() => { active = undefined; });
  };
  pass();
  const timer = timers.setInterval(pass, intervalMs);
  timer.unref?.();
  return {
    stop: async () => {
      stopped = true;
      timers.clearInterval(timer);
      await active;
    },
  };
}
