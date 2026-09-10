import {
  api,
  type AdminRecoveryDeepLinkResult,
  type AdminRecoveryStatus,
  type AdminRestorePoint,
  type AdminRestorePointSummary,
  type DatabaseContextEnvelope,
} from "@/lib/api";
import type { RecoveryPort } from "./recovery-port.hooks";

/**
 * @file The only place `use-recovery.hooks.ts` reaches `lib/api` — see `recovery-port.hooks.ts` for
 * why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRecoveryPort: RecoveryPort = {
  getRecoveryStatus: () => api.getRecoveryStatus(),
  listRecoveryRestorePoints: () => api.listRecoveryRestorePoints(),
  createRestorePoint: (options) => api.createRecoveryRestorePoint(options),
  resolveRecoveryDeepLink: (envelope) => api.resolveRecoveryDeepLink(envelope),
};

function fakeRestorePointSummary(overrides: Partial<AdminRestorePointSummary> = {}): AdminRestorePointSummary {
  return {
    id: overrides.id ?? "fake-rp-1",
    costClass: overrides.costClass ?? "cheap",
    kind: overrides.kind ?? "full",
  };
}

/** Seed state for {@link createFakeRecoveryPort}. */
export interface FakeRecoveryPortOptions {
  status?: AdminRecoveryStatus;
  points?: AdminRestorePoint[];
  deepLinkResult?: AdminRecoveryDeepLinkResult;
  /** When set, `getRecoveryStatus()`/`listRecoveryRestorePoints()` both reject with this instead of
   *  resolving — for load-failure tests (mirrors the hook's own `Promise.all` pairing). */
  loadError?: Error;
  /** When set, `resolveRecoveryDeepLink()` rejects with this instead of resolving — for
   *  deep-link-failure tests. */
  deepLinkError?: Error;
  /** When set, `createRestorePoint()` rejects with this instead of resolving — for
   *  create-failure tests. */
  createError?: Error;
}

const DEFAULT_STATUS: AdminRecoveryStatus = { costClass: "cheap", banner: null };

/**
 * An in-memory {@link RecoveryPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `listRecoveryRestorePoints` always returns the live
 * `points` array's current snapshot, so a `createRestorePoint` call that appends to it is visible on
 * the next list read — same shape `restore-points-section-dependencies.hooks.ts`'s fake uses.
 */
export function createFakeRecoveryPort(options: FakeRecoveryPortOptions = {}): RecoveryPort & {
  /** Every `resolveRecoveryDeepLink` call's envelope, in call order. */
  readonly deepLinkCalls: DatabaseContextEnvelope[];
  /** Every restore point currently in the fake's store, in list order. */
  readonly points: AdminRestorePoint[];
} {
  const deepLinkCalls: DatabaseContextEnvelope[] = [];
  const points = [...(options.points ?? [])];

  return {
    deepLinkCalls,
    points,
    async getRecoveryStatus() {
      if (options.loadError) throw options.loadError;
      return options.status ?? DEFAULT_STATUS;
    },
    async listRecoveryRestorePoints() {
      if (options.loadError) throw options.loadError;
      return { items: points };
    },
    async createRestorePoint(reqOptions) {
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
    async resolveRecoveryDeepLink(envelope) {
      deepLinkCalls.push(envelope);
      if (options.deepLinkError) throw options.deepLinkError;
      return options.deepLinkResult ?? { found: false, restorePoint: null };
    },
  };
}
