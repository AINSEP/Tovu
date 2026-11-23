import type { AdminRecoveryDeepLinkResult, AdminRecoveryStatus, AdminRestorePoint, DatabaseContextEnvelope } from "@jini-ai/admin/core";
import { recoveryApi } from "@/features/recovery/api/recovery-api";
import type { AdminRestorePointSummary } from "@/features/database/api/database-api.types";
import { databaseApi } from "@/features/database/api/database-api";
import type { RecoveryPort } from "@jini-ai/admin/recovery/hooks/recovery-port.hooks";
import { useRecovery, type RecoveryController, type RecoveryHost } from "@jini-ai/admin/recovery/hooks/use-recovery.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";

/**
 * @file The only place `use-recovery.hooks.ts` reaches `lib/api` — see `recovery-port.hooks.ts` for
 * why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRecoveryPort: RecoveryPort = {
  getRecoveryStatus: () => recoveryApi.getRecoveryStatus(),
  listRecoveryRestorePoints: () => recoveryApi.listRecoveryRestorePoints(),
  createRestorePoint: (_input, options = {}) => databaseApi.createRecoveryRestorePoint(options),
  resolveRecoveryDeepLink: (envelope, _options = {}) => recoveryApi.resolveRecoveryDeepLink(envelope),
};

/** This admin's collaborators for the package's Recovery hook: its locale, API-error wording,
 *  router, content-refresh bus and console. Module-level, so the two hooks keep their identity. */
export const RECOVERY_HOST: RecoveryHost = {
  useLocale: () => useAdminLocale(),
  describeError: (required) => describeApiError(required),
  navigate: (required, optional = {}) => navigate(required, optional),
  // The screen's refresh subscription stays on this host's bus: a restore point minted by an
  // assistant run reloads the list through the package hook's own `load`.
  useContentRefreshSubscription: (required) => useContentRefreshSubscription(required),
  reportError: ({ message, detail }) => console.error(message, detail),
};

/**
 * Binds the real `/api/.../recovery` client — the zero-argument half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Recovery.tsx` composes this and a test composes the package's `useRecovery`
 * with `createFakeRecoveryPort`.
 *
 * @returns Same controller shape as `useRecovery`, bound to the real port and this admin's host.
 */
export function useWiredRecovery(): RecoveryController {
  return useRecovery({ port: defaultRecoveryPort, host: RECOVERY_HOST });
}

/** Every caller names the point's `id` (it is derived from the store size), so it is required. */
function fakeRestorePointSummary(
  overrides: Pick<AdminRestorePointSummary, "id"> & Partial<AdminRestorePointSummary>,
): AdminRestorePointSummary {
  return {
    id: overrides.id,
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
 * the next list read.
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
    async createRestorePoint(_input, reqOptions = {}) {
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
