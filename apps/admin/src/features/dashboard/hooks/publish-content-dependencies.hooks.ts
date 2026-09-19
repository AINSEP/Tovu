import type {
  PublishContentConfirmResult,
  PublishContentExecuteResult,
  PublishContentPeerSummary,
  PublishContentPlanResult,
  PublishContentReport,
} from "@tovu/publish-content-ui";

import { api } from "@/lib/api";

import type { PublishContentPort } from "./publish-content-port.hooks";

/**
 * @file The only place under `features/dashboard` that reaches `lib/api` for publishing — see
 * `publish-content-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. Each method wraps its `api` counterpart
 *  explicitly rather than pointing at it directly, matching `dashboard-dependencies.hooks.ts`'s own
 *  reasoning — a route's own parameter shape stays `lib/api.ts`'s to own. */
export const defaultPublishContentPort: PublishContentPort = {
  listPeers: () => api.listPublishContentPeers(),
  planPublish: (input) => api.planPublishContent(input),
  confirmPublish: (input) => api.confirmPublishContent(input),
  executePublish: (input) => api.executePublishContent(input),
};

/** Seed state for {@link createFakePublishContentPort}. Every stage can be made to fail
 *  independently, because the three stages fail for genuinely different reasons in production —
 *  `plan` on a `PLAN_STALE`/network error, `confirm` on a permission or an expired token, `execute`
 *  on `RESTORE_POINT_UNAVAILABLE` — and the dialog owes the operator a different sentence for each. */
export interface FakePublishContentPortOptions {
  peers?: readonly PublishContentPeerSummary[];
  report?: PublishContentReport;
  planId?: string;
  planHash?: string;
  bundleId?: string;
  confirmationToken?: string;
  executeResult?: PublishContentExecuteResult;
  listPeersError?: Error;
  planError?: Error;
  confirmError?: Error;
  executeError?: Error;
}

/** What {@link createFakePublishContentPort} recorded, so a test can assert on what was NOT called —
 *  which is the whole point for `executePublish` (plan §4 task 11: the dialog cannot fire execute
 *  without a confirmed plan). */
export interface FakePublishContentPortCalls {
  readonly listPeers: number;
  readonly planPublish: Array<{ peerId: string }>;
  readonly confirmPublish: Array<{ peerId: string; planId: string; planHash: string }>;
  readonly executePublish: Array<{ peerId: string; bundleId: string; confirmationToken: string }>;
}

/**
 * An in-memory {@link PublishContentPort} for tests — "every port gets a fake" (see
 * `dashboard-dependencies.hooks.ts`). Also the reason this dialog could be built and tested against
 * the frozen route contract while Task 10 was still writing the routes themselves.
 *
 * @complexity O(1) per call; the recorded call log grows with the number of calls made.
 */
export function createFakePublishContentPort(
  options: FakePublishContentPortOptions = {}
): PublishContentPort & { readonly calls: FakePublishContentPortCalls } {
  const calls: FakePublishContentPortCalls = { listPeers: 0, planPublish: [], confirmPublish: [], executePublish: [] };

  return {
    calls,
    async listPeers() {
      (calls as { listPeers: number }).listPeers += 1;
      if (options.listPeersError) throw options.listPeersError;
      return { peers: options.peers ?? [] };
    },
    async planPublish(input): Promise<PublishContentPlanResult> {
      calls.planPublish.push(input);
      if (options.planError) throw options.planError;
      return {
        planId: options.planId ?? "fake-plan",
        planHash: options.planHash ?? "fake-plan-hash",
        bundleId: options.bundleId ?? "fake-bundle",
        details: options.report ?? { refused: false, refusalReason: null, applyOrder: [], rows: [] },
      };
    },
    async confirmPublish(input): Promise<PublishContentConfirmResult> {
      calls.confirmPublish.push(input);
      if (options.confirmError) throw options.confirmError;
      return { confirmationToken: options.confirmationToken ?? "fake-token" };
    },
    async executePublish(input): Promise<PublishContentExecuteResult> {
      calls.executePublish.push(input);
      if (options.executeError) throw options.executeError;
      return options.executeResult ?? { restorePointId: "fake-restore-point", changeSetIds: ["fake-change-set"] };
    },
  };
}
