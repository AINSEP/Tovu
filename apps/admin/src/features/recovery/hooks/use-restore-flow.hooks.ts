import { useEffect, useState } from "react";

import { api, describeApiError, type AdminDisclosureResult, type AdminRestorePoint } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../recovery-i18n";

/**
 * @file The restore ceremony (`plan`/`confirm`/`execute`, SPEC-019 C-301/C-302/C-303) plus the
 * discarded-write-window disclosure fetch, so `RestoreFlow` in `Recovery.tsx` is only markup.
 *
 * Extracted verbatim — same nine pieces of state, same reset-on-point-change effect, same three
 * ceremony steps, same error strings. See `Recovery.tsx`'s file header for why the ceremony is
 * restart-based rather than a live hot-swap.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/recovery` needs it.
 */

export type CeremonyStep = "idle" | "planned" | "confirmed" | "done";

export interface RestoreFlowController {
  disclosure: AdminDisclosureResult | null;
  error: string | null;
  acknowledged: boolean;
  setAcknowledged: (checked: boolean) => void;
  step: CeremonyStep;
  busy: boolean;
  ceremonyError: string | null;
  plan: { planId: string; planHash: string } | null;
  confirmationToken: string | null;
  result: { restoreRunId: string; state: string; restartRequired?: boolean } | null;
  startPlan: () => Promise<void>;
  doConfirm: () => Promise<void>;
  doExecute: () => Promise<void>;
}

export function useRestoreFlow(props: { point: AdminRestorePoint }): RestoreFlowController {
  const locale = useAdminLocale();
  const [disclosure, setDisclosure] = useState<AdminDisclosureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const [step, setStep] = useState<CeremonyStep>("idle");
  const [busy, setBusy] = useState(false);
  const [ceremonyError, setCeremonyError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planId: string; planHash: string } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ restoreRunId: string; state: string; restartRequired?: boolean } | null>(
    null,
  );

  useEffect(() => {
    setDisclosure(null);
    setAcknowledged(false);
    setError(null);
    setStep("idle");
    setBusy(false);
    setCeremonyError(null);
    setPlan(null);
    setConfirmationToken(null);
    setResult(null);
    api
      .computeRecoveryDisclosure(props.point.id)
      .then(setDisclosure)
      .catch((e) => setError(describeApiError(e, t(locale, "Failed to compute the discarded-write-window disclosure"))));
  }, [props.point.id]);

  async function startPlan() {
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await api.planRestore(props.point.id);
      setPlan({ planId: r.planId, planHash: r.planHash });
      setStep("planned");
    } catch (e) {
      setCeremonyError(describeApiError(e, t(locale, "Failed to plan the restore")));
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await api.confirmRestore({
        planId: plan.planId,
        planHash: plan.planHash,
        disclosureAcknowledged: acknowledged,
      });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      setCeremonyError(describeApiError(e, t(locale, "Failed to confirm the restore")));
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await api.executeRestore({ confirmationToken, restorePointId: props.point.id });
      setResult({ restoreRunId: r.restoreRunId, state: r.state, restartRequired: r.restartRequired });
      setStep("done");
    } catch (e) {
      setCeremonyError(describeApiError(e, t(locale, "Failed to execute the restore")));
    } finally {
      setBusy(false);
    }
  }

  return {
    disclosure,
    error,
    acknowledged,
    setAcknowledged,
    step,
    busy,
    ceremonyError,
    plan,
    confirmationToken,
    result,
    startPlan,
    doConfirm,
    doExecute,
  };
}
