import { api, describeApiError, type AdminRestorePoint } from "../../../lib/api";
import { useFetchMutation, useFetchQuery } from "../../../lib/fetch-query";
import { KEYS } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";

/**
 * @file Everything `RestorePointsSection` (the Database screen's restore-point list + create
 * action) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same error strings, including the decision record on `costAck: true` below.
 *
 * `t` (2026-08-11, standing i18n rule — see `use-timeline-section.hooks.ts`'s own file header for
 * the full rationale): this hook already called `useAdminLocale()` for its own error-string
 * translations, so exposing that same already-resolved `locale` as a bound `t` on the return value
 * adds no new fetch. No raw `locale` needed here — `RestorePointsSection` has no local
 * subcomponents that take it directly.
 *
 * `lib/fetch-query` migration (2026-08-12): the list read is `useFetchQuery({ key: KEYS.
 * restorePoints, ... })`; `createRestorePoint` is one `useFetchMutation` that `invalidates: [KEYS.
 * restorePoints]` instead of calling `load()` by hand on success. This feature has no injected
 * `port` (unlike every other migrated feature) — `api.*` stays a direct import here, matching the
 * pre-migration code; adding the DI seam is out of this migration's scope (see `rules.ts`'s own
 * header for why this feature's `KEYS` file is new).
 */

export interface RestorePointsSectionController {
  points: AdminRestorePoint[] | null;
  error: string | null;
  creating: boolean;
  createRestorePoint: () => Promise<void>;
  /** Bound translator — `key` already resolved against the caller's locale, so `Database.tsx`
   *  never imports `useAdminLocale`/`database-i18n` for this section. See this file's header. */
  t: (key: string) => string;
}

export function useRestorePointsSection(): RestorePointsSectionController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const list = useFetchQuery({ key: KEYS.restorePoints, fetch: () => api.listDatabaseRestorePoints() });

  const createMutation = useFetchMutation({
    // No capabilities-read route exists yet to learn `costClass` ahead of time (design-spec.md
    // §3.3 wants a cost/disk estimate the confirmer explicitly acknowledges first); `costAck: true`
    // is sent unconditionally so a `cheap`/`expensive` site can still mint one, and an
    // `unavailable` site gets the server's honest `RESTORE_POINT_UNAVAILABLE` rejection below
    // rather than a client-side guess.
    run: (_: undefined) => api.createDatabaseRestorePoint({ trigger: "manual", costAck: true }),
    invalidates: [KEYS.restorePoints],
  });

  async function createRestorePoint() {
    try {
      await createMutation.mutate(undefined);
    } catch {
      // already surfaced through createMutation.error -> error below
    }
  }

  const points = list.data?.items ?? null;
  // The create write's own failure outranks a background list-refresh failure, same precedence
  // `redirects/rules.ts`'s `visibleRedirectsError` documents — flat `if`s rather than a nested
  // ternary, per `adapter.tanstack.tsx`'s `resolveFetchQueryStatus` doc on why the two carry a
  // different complexity-gate weight for the same branch count.
  let error: string | null = null;
  if (createMutation.error) {
    error = describeApiError(createMutation.error, t(locale, "Failed to create restore point"));
  } else if (!points && list.error) {
    error = describeApiError(list.error, t(locale, "failed to load restore points"));
  }

  return { points, error, creating: createMutation.status === "pending", createRestorePoint, t: boundT };
}
