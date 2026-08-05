import { useEffect, useState } from "react";
import { api, describeApiError, type AdminRestorePoint } from "../../../lib/api";

/**
 * @file Everything `RestorePointsSection` (the Database screen's restore-point list + create
 * action) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings,
 * including the decision record on `costAck: true` below.
 */

export interface RestorePointsSectionController {
  points: AdminRestorePoint[] | null;
  error: string | null;
  creating: boolean;
  createRestorePoint: () => Promise<void>;
}

export function useRestorePointsSection(): RestorePointsSectionController {
  const [points, setPoints] = useState<AdminRestorePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .listDatabaseRestorePoints()
      .then((r) => setPoints(r.items))
      .catch((e) => setError(describeApiError(e, "failed to load restore points")));
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
      setError(describeApiError(e, "Failed to create restore point"));
    } finally {
      setCreating(false);
    }
  }

  return { points, error, creating, createRestorePoint };
}
