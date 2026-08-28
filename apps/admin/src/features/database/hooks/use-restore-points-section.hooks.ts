import { describeApiError, type AdminRestorePoint } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { KEYS } from "../rules";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";
import { defaultRestorePointsSectionPort } from "./restore-points-section-dependencies.hooks";
import type { RestorePointsSectionPort } from "./restore-points-section-port.hooks";

/**
 * @file Everything `RestorePointsSection` (the Database screen's restore-point list + create
 * action) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same error strings, including the decision record on `costAck: true` below.
 *
 * `t` (2026-08-11, standing i18n rule — see `use-timeline-section.hooks.ts`'s own file header for
 * the full rationale): this hook already called `useWiredAdminLocale()` for its own error-string
 * translations, so exposing that same already-resolved `locale` as a bound `t` on the return value
 * adds no new fetch. No raw `locale` needed here — `RestorePointsSection` has no local
 * subcomponents that take it directly.
 *
 * `lib/fetch-query` migration (2026-08-12): the list read is `useFetchQuery({ key: KEYS.
 * restorePoints, ... })`; `createRestorePoint` is one `useFetchMutation` that `invalidates: [KEYS.
 * restorePoints]` instead of calling `load()` by hand on success.
 *
 * DI seam (2026-08-14, Orc-BASH pass): `port` is now injected — see `restore-points-section-
 * port.hooks.ts` — rather than reaching `lib/api` directly, so a test can describe list/create
 * outcomes against `createFakeRestorePointsSectionPort` instead of stubbing global `fetch`.
 * `useWiredRestorePointsSection` below is the zero-argument pair `Database.tsx` actually mounts.
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

export interface RestorePointsSectionDependencies {
  port: RestorePointsSectionPort;
}

/**
 * @param deps Injected dependencies — the `RestorePointsSectionPort` to list/create restore points
 * through.
 * @returns The restore-points list, create state, `createRestorePoint`, and a bound `t` — see this
 * file's header for the full rationale.
 */
export function useRestorePointsSection(deps: RestorePointsSectionDependencies): RestorePointsSectionController {
  const { port } = deps;
  const locale = useWiredAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const list = useFetchQuery({ key: KEYS.restorePoints, fetch: () => port.listDatabaseRestorePoints() });

  const createMutation = useFetchMutation({
    // No capabilities-read route exists yet to learn `costClass` ahead of time (design-spec.md
    // §3.3 wants a cost/disk estimate the confirmer explicitly acknowledges first); `costAck: true`
    // is sent unconditionally so a `cheap`/`expensive` site can still mint one, and an
    // `unavailable` site gets the server's honest `RESTORE_POINT_UNAVAILABLE` rejection below
    // rather than a client-side guess.
    run: (_: undefined) => port.createDatabaseRestorePoint({ trigger: "manual", costAck: true }),
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

/**
 * Binds the real `/api/.../database/restore-points` client — see `restore-points-section-
 * dependencies.hooks.ts`. The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair,
 * so `Database.tsx` composes this and a test composes {@link useRestorePointsSection} with
 * `createFakeRestorePointsSectionPort`.
 *
 * @returns Same controller shape as {@link useRestorePointsSection}, bound to the real port.
 */
export function useWiredRestorePointsSection(): RestorePointsSectionController {
  return useRestorePointsSection({ port: defaultRestorePointsSectionPort });
}
