import { useEffect, useState } from "react";
import { api, describeApiError, type AdminRestorePoint } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";

/**
 * @file Everything `RestorePointsSection` (the Database screen's restore-point list + create
 * action) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings,
 * including the decision record on `costAck: true` below.
 *
 * `t` (2026-08-11, standing i18n rule — see `use-timeline-section.hooks.ts`'s own file header for
 * the full rationale): this hook already called `useAdminLocale()` for its own error-string
 * translations, so exposing that same already-resolved `locale` as a bound `t` on the return value
 * adds no new fetch. No raw `locale` needed here — `RestorePointsSection` has no local
 * subcomponents that take it directly.
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
  const [points, setPoints] = useState<AdminRestorePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .listDatabaseRestorePoints()
      .then((r) => setPoints(r.items))
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load restore points"))));
  }

  useEffect(load, []);

  async function createRestorePoint() {
    setCreating(true);
    setError(null);
    try {
      // No capabilities-read route exists yet to learn `costClass` ahead of time (design-spec.md
      // §3.3 wants a cost/disk estimate the confirmer explicitly acknowledges first); `costAck:
      // true` is sent unconditionally so a `cheap`/`expensive` site can still mint one, and an
      // `unavailable` site gets the server's honest `RESTORE_POINT_UNAVAILABLE` rejection below
      // rather than a client-side guess.
      await api.createDatabaseRestorePoint({ trigger: "manual", costAck: true });
      load();
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to create restore point")));
    } finally {
      setCreating(false);
    }
  }

  return { points, error, creating, createRestorePoint, t: boundT };
}
