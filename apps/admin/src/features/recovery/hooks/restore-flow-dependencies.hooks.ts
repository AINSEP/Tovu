import {
  api,
  type AdminDisclosureResult,
  type GatedConfirmResult,
  type GatedPlanResult,
  type RestoreExecuteResult,
} from "../../../lib/api";
import type { RestoreFlowPort } from "./restore-flow-port.hooks";

/**
 * @file The only place `use-restore-flow.hooks.ts` reaches `lib/api` — see `restore-flow-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRestoreFlowPort: RestoreFlowPort = {
  computeRecoveryDisclosure: (restorePointId) => api.computeRecoveryDisclosure(restorePointId),
  planRestore: (restorePointId) => api.planRestore(restorePointId),
  confirmRestore: (input) => api.confirmRestore(input),
  executeRestore: (input) => api.executeRestore(input),
};

/** Seed state for {@link createFakeRestoreFlowPort}. */
export interface FakeRestoreFlowPortOptions {
  disclosure?: AdminDisclosureResult;
  plan?: GatedPlanResult;
  confirmationToken?: string;
  executeResult?: RestoreExecuteResult;
  /** When set, `computeRecoveryDisclosure()` rejects with this instead of resolving — for
   *  disclosure-failure tests. */
  disclosureError?: Error;
  /** When set, `planRestore()` rejects with this instead of resolving — for plan-failure tests. */
  planError?: Error;
  /** When set, `confirmRestore()` rejects with this instead of resolving — for confirm-failure
   *  tests. */
  confirmError?: Error;
  /** When set, `executeRestore()` rejects with this instead of resolving — for execute-failure
   *  tests. */
  executeError?: Error;
}

const DEFAULT_DISCLOSURE: AdminDisclosureResult = { partial: true, watermarkBaselineAvailable: true, counts: {} };
const DEFAULT_PLAN: GatedPlanResult = { planId: "fake-plan-1", planHash: "fake-hash-1", details: undefined };

/**
 * An in-memory {@link RestoreFlowPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). The three ceremony steps are mutually exclusive by
 * construction in the hook (`doConfirm`/`doExecute` no-op without their predecessor's output), so
 * this fake needs no cross-call state machine of its own — each method just resolves its own fixed
 * or seeded result, mirroring `migrate-forward-section-dependencies.hooks.ts`'s identical fake.
 */
export function createFakeRestoreFlowPort(options: FakeRestoreFlowPortOptions = {}): RestoreFlowPort {
  return {
    async computeRecoveryDisclosure() {
      if (options.disclosureError) throw options.disclosureError;
      return options.disclosure ?? DEFAULT_DISCLOSURE;
    },
    async planRestore() {
      if (options.planError) throw options.planError;
      return options.plan ?? DEFAULT_PLAN;
    },
    async confirmRestore() {
      if (options.confirmError) throw options.confirmError;
      return { confirmationToken: options.confirmationToken ?? "fake-token-1" };
    },
    async executeRestore() {
      if (options.executeError) throw options.executeError;
      return options.executeResult ?? { restoreRunId: "fake-run-1", state: "succeeded" };
    },
  };
}
