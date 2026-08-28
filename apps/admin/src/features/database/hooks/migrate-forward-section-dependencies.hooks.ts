import { api, type GatedConfirmResult, type GatedPlanResult, type MigrateForwardExecuteResult } from "@/lib/api";
import type { MigrateForwardSectionPort } from "./migrate-forward-section-port.hooks";

/**
 * @file The only place `use-migrate-forward-section.hooks.ts` reaches `lib/api` — see
 * `migrate-forward-section-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultMigrateForwardSectionPort: MigrateForwardSectionPort = {
  planMigrateForward: () => api.planMigrateForward(),
  confirmMigrateForward: (input) => api.confirmMigrateForward(input),
  executeMigrateForward: (confirmationToken) => api.executeMigrateForward(confirmationToken),
};

/** Seed state for {@link createFakeMigrateForwardSectionPort}. */
export interface FakeMigrateForwardSectionPortOptions {
  plan?: GatedPlanResult;
  confirmationToken?: string;
  executeResult?: MigrateForwardExecuteResult;
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
