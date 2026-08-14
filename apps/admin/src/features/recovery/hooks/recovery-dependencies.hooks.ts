import {
  api,
  type AdminRecoveryDeepLinkResult,
  type AdminRecoveryStatus,
  type AdminRestorePoint,
  type DatabaseContextEnvelope,
} from "../../../lib/api";
import type { RecoveryPort } from "./recovery-port.hooks";

/**
 * @file The only place `use-recovery.hooks.ts` reaches `lib/api` — see `recovery-port.hooks.ts` for
 * why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRecoveryPort: RecoveryPort = {
  getRecoveryStatus: () => api.getRecoveryStatus(),
  listRecoveryRestorePoints: () => api.listRecoveryRestorePoints(),
  resolveRecoveryDeepLink: (envelope) => api.resolveRecoveryDeepLink(envelope),
};

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
}

const DEFAULT_STATUS: AdminRecoveryStatus = { costClass: "cheap", banner: null };

/**
 * An in-memory {@link RecoveryPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeRecoveryPort(options: FakeRecoveryPortOptions = {}): RecoveryPort & {
  /** Every `resolveRecoveryDeepLink` call's envelope, in call order. */
  readonly deepLinkCalls: DatabaseContextEnvelope[];
} {
  const deepLinkCalls: DatabaseContextEnvelope[] = [];

  return {
    deepLinkCalls,
    async getRecoveryStatus() {
      if (options.loadError) throw options.loadError;
      return options.status ?? DEFAULT_STATUS;
    },
    async listRecoveryRestorePoints() {
      if (options.loadError) throw options.loadError;
      return { items: options.points ?? [] };
    },
    async resolveRecoveryDeepLink(envelope) {
      deepLinkCalls.push(envelope);
      if (options.deepLinkError) throw options.deepLinkError;
      return options.deepLinkResult ?? { found: false, restorePoint: null };
    },
  };
}
