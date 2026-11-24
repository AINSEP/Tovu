import type { AdminLedgerRow } from "@jini-ai/admin/core";
import { databaseApi } from "@/features/database/api/database-api";
import type { TimelineSectionPort } from "@jini-ai/admin/screens/database/hooks/timeline-section-port.hooks";
import { useTimelineSection, type TimelineSectionController, type TimelineSectionHost } from "@jini-ai/admin/screens/database/hooks/use-timeline-section.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { useCursorPages } from "@jini-ai/ui/fetch-query";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";

/**
 * @file The only place `use-timeline-section.hooks.ts` reaches `lib/api` — see `timeline-section-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultTimelineSectionPort: TimelineSectionPort = {
  getDatabaseTimeline: (_required, { options } = {}) => databaseApi.getDatabaseTimeline(options),
};

/** Seed state for {@link createFakeTimelineSectionPort}. */
export interface FakeTimelineSectionPortOptions {
  items?: AdminLedgerRow[];
  nextCursor?: string | null;
  /** When set, `getDatabaseTimeline({})` rejects with this instead of resolving — for load-failure
   *  tests. */
  getDatabaseTimelineError?: Error;
}

/**
 * An in-memory {@link TimelineSectionPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). Always returns the same seeded page regardless of the
 * requested filters/cursor — this hook's own filter/cursor bookkeeping lives in the CALLER, not the
 * port (same precedent `createFakeCommentQueuePort` uses for its
 * `listCommentsQueue`), so a test asserts the hook passed through the right options via the fake's
 * own call log instead of simulating server-side filtering.
 */
export function createFakeTimelineSectionPort(options: FakeTimelineSectionPortOptions = {}): TimelineSectionPort & {
  /** Every `getDatabaseTimeline` call's options, in call order. */
  readonly calls: Array<{ kind?: string; outcome?: string; fromDate?: string; toDate?: string; cursor?: string; limit?: number }>;
} {
  const calls: Array<{ kind?: string; outcome?: string; fromDate?: string; toDate?: string; cursor?: string; limit?: number }> = [];

  return {
    calls,
    async getDatabaseTimeline(_required, { options: reqOptions = {} } = {}) {
      calls.push(reqOptions);
      if (options.getDatabaseTimelineError) throw options.getDatabaseTimelineError;
      return { items: options.items ?? [], nextCursor: options.nextCursor ?? null };
    },
  };
}

/** This admin's collaborators for the package's Timeline hook: its locale query, API-error wording and
 *  the fetch-query layer's cursor-pages hook (bound to the same provider the admin kit uses).
 *  Module-level, so the hook fields keep their identity. */
export const TIMELINE_SECTION_HOST: TimelineSectionHost = {
  useLocale: () => useWiredAdminLocale(),
  describeError: (required) => describeApiError(required),
  useCursorPages: (required) => useCursorPages(required),
};

/**
 * Binds the real `/api/.../database/timeline` client — see `defaultTimelineSectionPort` above.
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Database.tsx`
 * composes this and a test composes the package's `useTimelineSection` with `createFakeTimelineSectionPort`.
 *
 * @returns Same controller shape as `useTimelineSection`, bound to the real port and this admin's host.
 */
export function useWiredTimelineSection(): TimelineSectionController {
  return useTimelineSection({ port: defaultTimelineSectionPort, host: TIMELINE_SECTION_HOST });
}
