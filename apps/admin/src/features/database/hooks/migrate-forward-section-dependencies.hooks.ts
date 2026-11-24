import type { GatedConfirmResult, GatedPlanResult } from "@jini-ai/core/contracts/site/gated-results";
import type { MigrateForwardResult } from "@jini-ai/admin/core";
import { databaseApi } from "@/features/database/api/database-api";
import type { MigrateForwardSectionPort } from "@jini-ai/admin/screens/database/hooks/migrate-forward-section-port.hooks";
import { useMigrateForwardSection, type MigrateForwardSectionController, type MigrateForwardSectionHost } from "@jini-ai/admin/screens/database/hooks/use-migrate-forward-section.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";

/**
 * @file The only place `use-migrate-forward-section.hooks.ts` reaches `lib/api` — see
 * `migrate-forward-section-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultMigrateForwardSectionPort: MigrateForwardSectionPort = {
  planMigrateForward: () => databaseApi.planMigrateForward(),
  confirmMigrateForward: (input, _options = {}) => databaseApi.confirmMigrateForward(input),
  executeMigrateForward: ({ confirmationToken }, _options = {}) => databaseApi.executeMigrateForward({ confirmationToken }),
};

/** Seed state for {@link createFakeMigrateForwardSectionPort}. */
export interface FakeMigrateForwardSectionPortOptions {
  plan?: GatedPlanResult;
  confirmationToken?: string;
  executeResult?: MigrateForwardResult;
  /** When set, `planMigrateForward()` rejects with this instead of resolving — for plan-failure
   *  tests. */
  planError?: Error;
  /** When set, `confirmMigrateForward()` rejects with this instead of resolving — for
   *  confirm-failure tests. */
  confirmError?: Error;
  /** When set, `executeMigrateForward()` rejects with this instead of resolving — for
   *  execute-failure tests. */
  executeError?: Error;
}

const DEFAULT_PLAN: GatedPlanResult = { planId: "fake-plan-1", planHash: "fake-hash-1", details: undefined };

/**
 * An in-memory {@link MigrateForwardSectionPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). The three ceremony steps are mutually exclusive by
 * construction in the hook (`doConfirm`/`doExecute` no-op without their predecessor's output), so
 * this fake needs no cross-call state machine of its own — each method just resolves its own fixed
 * or seeded result.
 */
export function createFakeMigrateForwardSectionPort(
  options: FakeMigrateForwardSectionPortOptions = {},
): MigrateForwardSectionPort {
  return {
    async planMigrateForward() {
      if (options.planError) throw options.planError;
      return options.plan ?? DEFAULT_PLAN;
    },
    async confirmMigrateForward() {
      if (options.confirmError) throw options.confirmError;
      return { confirmationToken: options.confirmationToken ?? "fake-token-1" };
    },
    async executeMigrateForward() {
      if (options.executeError) throw options.executeError;
      return options.executeResult ?? { migrated: true };
    },
  };
}

/** This admin's collaborators for the package's migrate-forward hook: its locale query and API-error
 *  wording. Module-level, so the hook field keeps its identity. */
export const MIGRATE_FORWARD_SECTION_HOST: MigrateForwardSectionHost = {
  useLocale: () => useWiredAdminLocale(),
  describeError: (required) => describeApiError(required),
};

/**
 * Binds the real `/api/.../database/migrate-forward` client — see `defaultMigrateForwardSectionPort`
 * above. The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Database.tsx`
 * composes this and a test composes the package's `useMigrateForwardSection` with
 * `createFakeMigrateForwardSectionPort`.
 *
 * @returns Same controller shape as `useMigrateForwardSection`, bound to the real port and this admin's host.
 */
export function useWiredMigrateForwardSection(): MigrateForwardSectionController {
  return useMigrateForwardSection({ port: defaultMigrateForwardSectionPort, host: MIGRATE_FORWARD_SECTION_HOST });
}
