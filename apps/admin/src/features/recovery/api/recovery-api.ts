import { request } from "../../../lib/admin-http/request";
import type { GatedConfirmResult, GatedPlanResult } from "@jini-ai/core/contracts/site/gated-results";
import type { AdminDisclosureResult, AdminRecoveryDeepLinkResult, AdminRecoveryStatus, AdminRestorePoint, DatabaseContextEnvelope, RestoreExecuteResult } from "./recovery-api.types";

/** The admin API calls of the recovery feature. */
export const recoveryApi = {
  // Recovery (ADR-045) — restore-points list (shared with Database), disclosure, deep-link, status,
  // and the restore ceremony itself (SPEC-019 C-301/C-302/C-303).
  listRecoveryRestorePoints: () => request<{ items: AdminRestorePoint[] }>({ path: "/recovery/restore-points" }),
  computeRecoveryDisclosure: ({ restorePointId }: { restorePointId: string }, _optional: Record<string, never> = {}) =>
    request<AdminDisclosureResult>({ path: "/recovery/disclosure" }, { init: {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    } }),
  resolveRecoveryDeepLink: (envelope: DatabaseContextEnvelope) =>
    request<AdminRecoveryDeepLinkResult>({ path: "/recovery/deep-link" }, { init: {
      method: "POST",
      body: JSON.stringify({ envelope }),
    } }),
  getRecoveryStatus: () => request<AdminRecoveryStatus>({ path: "/recovery/status" }),
  planRestore: ({ restorePointId }: { restorePointId: string }, _optional: Record<string, never> = {}) =>
    request<GatedPlanResult>({ path: "/recovery/restore/plan" }, { init: {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    } }),
  confirmRestore: (
    {
      planId,
      planHash,
      disclosureAcknowledged,
    }: { planId: string; planHash: string; disclosureAcknowledged: boolean },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>({ path: "/recovery/restore/confirm" }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash, disclosureAcknowledged }),
    } }),
  executeRestore: (
    { confirmationToken, restorePointId }: { confirmationToken: string; restorePointId: string },
    _options: Record<string, never> = {}
  ) =>
    request<RestoreExecuteResult>({ path: "/recovery/restore/execute" }, { init: {
      method: "POST",
      body: JSON.stringify({ confirmationToken, restorePointId }),
    } }),
};
