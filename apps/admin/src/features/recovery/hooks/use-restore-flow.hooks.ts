import { useEffect, useState } from "react";

import { describeApiError, type AdminDisclosureResult, type AdminRestorePoint } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../recovery-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import { defaultRestoreFlowPort } from "./restore-flow-dependencies.hooks";
import type { RestoreFlowPort } from "./restore-flow-port.hooks";

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
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — see `use-recovery.hooks.ts`'s own file header for
 * the full rationale): this hook already called `useAdminLocale()` for its own error-string
 * translations, so exposing that same already-resolved `locale` as a bound `t` (plus the raw value,
 * still needed for `RestoreFlow`'s own local step subcomponents and the several `recovery-i18n.tsx`
 * helpers that take `locale` directly) on the return value adds no new fetch.
 *
 * DI seam (2026-08-14, Orc-BASH pass): `port` is injected as a second argument — see
 * `restore-flow-port.hooks.ts` — rather than reaching `lib/api` directly, so a test can describe
 * the disclosure/plan/confirm/execute ceremony against `createFakeRestoreFlowPort` instead of
 * stubbing global `fetch`. `props` (the `point`) stays a separate first argument, same two-argument
 * shape `use-form-submissions.hooks.ts`'s `useFormSubmissions(props, port)` uses — `point` is a
 * business input, not an external dependency. `useWiredRestoreFlow` below is the pair `RestoreFlow`
 * in `Recovery.tsx` actually mounts.
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
  /** Bound translator — `key` already resolved against the caller's locale, so `RestoreFlow` never
   *  imports `useAdminLocale`/`recovery-i18n` itself. See this file's header. */
  t: Translate;
  /** Raw resolved locale — `RestoreFlow`'s own local step subcomponents and several
   *  `recovery-i18n.tsx` helpers take `locale` directly rather than a bound translator. See this
   *  file's header. */
  locale: string;
}

export function useRestoreFlow(props: { point: AdminRestorePoint }, port: RestoreFlowPort): RestoreFlowController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
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
    port
      .computeRecoveryDisclosure(props.point.id)
      .then(setDisclosure)
      .catch((e) => setError(describeApiError(e, t(locale, "Failed to compute the discarded-write-window disclosure"))));
  }, [props.point.id]);

  async function startPlan() {
    setBusy(true);
    setCeremonyError(null);
    try {
      const r = await port.planRestore(props.point.id);
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
      const r = await port.confirmRestore({
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
      const r = await port.executeRestore({ confirmationToken, restorePointId: props.point.id });
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
    t: boundT,
    locale,
  };
}

/**
 * Binds the real `/api/.../recovery/restore` client — see `restore-flow-dependencies.hooks.ts`.
 * The zero-argument-deps half of the `useX(dependencies)` / `useWiredX()` pair, so `RestoreFlow` in
 * `Recovery.tsx` composes this and a test composes {@link useRestoreFlow} with
 * `createFakeRestoreFlowPort`.
 *
 * @param props Same business input as {@link useRestoreFlow} — the selected restore point.
 */
export function useWiredRestoreFlow(props: { point: AdminRestorePoint }): RestoreFlowController {
  return useRestoreFlow(props, defaultRestoreFlowPort);
}
