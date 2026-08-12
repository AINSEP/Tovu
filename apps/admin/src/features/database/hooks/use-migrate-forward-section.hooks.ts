import { useState } from "react";
import { api, describeApiError } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";

/**
 * @file Everything `MigrateForwardSection` (the Database screen's plan/confirm/execute
 * migrate-forward ceremony) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same handlers, same error strings.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — see `use-timeline-section.hooks.ts`'s own file
 * header for the full rationale): this hook already called `useAdminLocale()` for its own
 * error-string translations, so exposing that same already-resolved `locale` as a bound `t` (plus
 * the raw value, still needed for this section's own local step subcomponents and
 * `planReadyMessage`) on the return value adds no new fetch.
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
  /** Bound translator — `key` already resolved against the caller's locale, so `Database.tsx`
   *  never imports `useAdminLocale`/`database-i18n` for this section. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — this section's own local step subcomponents (`PlanMigrationStep`,
   *  `PlannedStep`, …) and `planReadyMessage` take `locale` directly rather than a bound
   *  translator. See this file's header. */
  locale: string;
}

export function useMigrateForwardSection(): MigrateForwardSectionController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
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
      setError(describeApiError(e, t(locale, "Failed to plan the forward migration")));
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
      setError(describeApiError(e, t(locale, "Failed to confirm the forward migration")));
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
      setError(describeApiError(e, t(locale, "Failed to execute the forward migration")));
    } finally {
      setBusy(false);
    }
  }

  return { step, busy, error, plan, confirmationToken, done, reset, startPlan, doConfirm, doExecute, t: boundT, locale };
}
