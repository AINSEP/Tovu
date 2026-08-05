import { useState } from "react";
import { api, describeApiError } from "../../../lib/api";

/**
 * @file Everything `MigrateForwardSection` (the Database screen's plan/confirm/execute
 * migrate-forward ceremony) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same handlers, same error strings.
 */

export type CeremonyStep = "idle" | "planned" | "confirmed" | "done";

export interface MigrateForwardSectionController {
  step: CeremonyStep;
  busy: boolean;
  error: string | null;
  plan: { planId: string; planHash: string } | null;
  confirmationToken: string | null;
  done: boolean;
  reset: () => void;
  startPlan: () => Promise<void>;
  doConfirm: () => Promise<void>;
  doExecute: () => Promise<void>;
}

export function useMigrateForwardSection(): MigrateForwardSectionController {
  const [step, setStep] = useState<CeremonyStep>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planId: string; planHash: string } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setStep("idle");
    setError(null);
    setPlan(null);
    setConfirmationToken(null);
    setDone(false);
  }

  async function startPlan() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.planMigrateForward();
      setPlan({ planId: r.planId, planHash: r.planHash });
      setStep("planned");
    } catch (e) {
      setError(describeApiError(e, "Failed to plan the forward migration"));
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.confirmMigrateForward({ planId: plan.planId, planHash: plan.planHash });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      setError(describeApiError(e, "Failed to confirm the forward migration"));
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    setBusy(true);
    setError(null);
    try {
      await api.executeMigrateForward(confirmationToken);
      setDone(true);
      setStep("done");
    } catch (e) {
      setError(describeApiError(e, "Failed to execute the forward migration"));
    } finally {
      setBusy(false);
    }
  }

  return { step, busy, error, plan, confirmationToken, done, reset, startPlan, doConfirm, doExecute };
}
