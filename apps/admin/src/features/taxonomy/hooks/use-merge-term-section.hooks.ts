import { useEffect, useState } from "react";
import { describeApiError, type AdminTerm } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
import { defaultMergeTermSectionPort } from "./merge-term-section-dependencies.hooks";
import type { MergeTermSectionPort } from "./merge-term-section-port.hooks";

/**
 * @file Everything `MergeTermSection` (the merge-term plan/confirm/execute wizard, ADR-044,
 * SPEC-018 C-207) does, so it can stay markup only.
 *
 * Extracted verbatim — same state, same effect (reset on term change), same three handlers, same
 * error strings. The original component also took a `taxonomy` prop, used only to compute
 * `otherTerms` (now `rules.ts`'s `otherMergeTargets`, called directly by the view); this hook has
 * no use for it and does not accept it.
 *
 * `port` is injected — see `merge-term-section-port.hooks.ts` — rather than importing `lib/api`
 * directly, so a test can describe plan/confirm/execute outcomes against
 * `createFakeMergeTermSectionPort` instead of stubbing global `fetch`. `useWiredMergeTermSection`
 * below is the zero-argument pair `Taxonomy.tsx` actually mounts.
 */

export type MergeStep = "idle" | "planned" | "confirmed";

export interface MergeTermSectionOptions {
  term: AdminTerm;
  onMerged: () => void;
}

export interface MergeTermSectionController {
  intoTermId: string;
  setIntoTermId: (intoTermId: string) => void;
  step: MergeStep;
  busy: boolean;
  error: string | null;
  plan: { planId: string; planHash: string; overlappingContentCount: number } | null;
  confirmationToken: string | null;
  startPlan: () => Promise<void>;
  doConfirm: () => Promise<void>;
  doExecute: () => Promise<void>;
}

export function useMergeTermSection(
  options: MergeTermSectionOptions,
  port: MergeTermSectionPort,
  locale: string
): MergeTermSectionController {
  const { term, onMerged } = options;
  const [intoTermId, setIntoTermId] = useState("");
  const [step, setStep] = useState<MergeStep>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planId: string; planHash: string; overlappingContentCount: number } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);

  useEffect(() => {
    setIntoTermId("");
    setStep("idle");
    setError(null);
    setPlan(null);
    setConfirmationToken(null);
  }, [term.id]);

  async function startPlan() {
    if (!intoTermId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await port.planMergeTerm({ fromTermId: term.id, intoTermId });
      setPlan({ planId: r.planId, planHash: r.planHash, overlappingContentCount: r.details.overlappingContentCount });
      setStep("planned");
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to plan the merge")));
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await port.confirmMergeTerm({ fromTermId: term.id, planId: plan.planId, planHash: plan.planHash });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to confirm the merge")));
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    setBusy(true);
    setError(null);
    try {
      await port.executeMergeTerm({ fromTermId: term.id, intoTermId, confirmationToken });
      onMerged();
    } catch (e) {
      setError(describeApiError(e, t(locale, "Failed to execute the merge")));
    } finally {
      setBusy(false);
    }
  }

  return { intoTermId, setIntoTermId, step, busy, error, plan, confirmationToken, startPlan, doConfirm, doExecute };
}

/**
 * Binds the real `/api/.../taxonomy/terms/:id/merge` client — see
 * `merge-term-section-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useMergeTermSection} with
 * `createFakeMergeTermSectionPort`.
 */
export function useWiredMergeTermSection(options: MergeTermSectionOptions): MergeTermSectionController {
  const locale = useAdminLocale();
  return useMergeTermSection(options, defaultMergeTermSectionPort, locale);
}
