import { api, type AdminRestorePoint, type AdminRestorePointSummary } from "@/lib/api";
import type { RestorePointsSectionPort } from "./restore-points-section-port.hooks";

/**
 * @file The only place `use-restore-points-section.hooks.ts` reaches `lib/api` — see
 * `restore-points-section-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRestorePointsSectionPort: RestorePointsSectionPort = {
  listDatabaseRestorePoints: () => api.listDatabaseRestorePoints(),
  createDatabaseRestorePoint: (options) => api.createDatabaseRestorePoint(options),
};

function fakeRestorePointSummary(overrides: Partial<AdminRestorePointSummary> = {}): AdminRestorePointSummary {
  return {
    id: overrides.id ?? "fake-rp-1",
    costClass: overrides.costClass ?? "cheap",
    kind: overrides.kind ?? "full",
  };
}

/** Seed state for {@link createFakeRestorePointsSectionPort}. */
export interface FakeRestorePointsSectionPortOptions {
  points?: AdminRestorePoint[];
  /** When set, `createDatabaseRestorePoint()` rejects with this instead of resolving — for
   *  create-failure tests. */
  createError?: Error;
}

/**
 * An in-memory {@link RestorePointsSectionPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `listDatabaseRestorePoints` always returns the live
 * `points` array's current snapshot, so a `createDatabaseRestorePoint` call that appends to it is
 * visible on the NEXT list read — matching `use-restore-points-section.hooks.ts`'s own
 * `invalidates: [KEYS.restorePoints]` reload behaviour without the fake needing to know about
 * `fetch-query` at all.
 */
export function createFakeRestorePointsSectionPort(
  options: FakeRestorePointsSectionPortOptions = {},
): RestorePointsSectionPort & {
  /** Every restore point currently in the fake's store, in list order. */
  readonly points: AdminRestorePoint[];
} {
  const points = [...(options.points ?? [])];

  return {
    points,
    async listDatabaseRestorePoints() {
      return { items: points };
    },
    async createDatabaseRestorePoint(reqOptions) {
      if (options.createError) throw options.createError;
      const created = fakeRestorePointSummary({ id: `fake-rp-${points.length + 1}` });
      points.push({
        ...created,
        trigger: reqOptions?.trigger ?? "manual",
        watermarkAtCapture: 0,
        createdAt: new Date(0).toISOString(),
      });
      return { restorePoint: created };
    },
  };
}
