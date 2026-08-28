import { useEffect, useState } from "react";
import { describeApiError, type AdminTerm } from "@/lib/api";
import { useFetchMutation } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
import { KEYS } from "../rules";
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
 *
 * `lib/fetch-query` migration (2026-08-12): plan/confirm/execute are three independent
 * `useFetchMutation`s rather than one shared `busy`/`error` pair — only `executeMergeTerm` actually
 * changes taxonomy state (the plan/confirm steps just issue a token), so only it
 * `invalidates: [KEYS.list]`. `busy`/`error` below fold the three back into the single values the
 * wizard's three MUTUALLY EXCLUSIVE steps need (`step` only ever has one of them in flight or
 * errored at a time), same "one banner, precedence-derived" shape as
 * `use-taxonomy.hooks.ts`'s own `error`.
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
  const [plan, setPlan] = useState<{ planId: string; planHash: string; overlappingContentCount: number } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);

  const planMutation = useFetchMutation({
    run: (target: { fromTermId: string; intoTermId: string }) => port.planMergeTerm(target),
  });
  const confirmMutation = useFetchMutation({
    run: (target: { fromTermId: string; planId: string; planHash: string }) => port.confirmMergeTerm(target),
  });
  // The only step that actually changes taxonomy state — plan/confirm merely issue a token.
  const executeMutation = useFetchMutation({
    run: (target: { fromTermId: string; intoTermId: string; confirmationToken: string }) => port.executeMergeTerm(target),
    invalidates: [KEYS.list],
  });

  // Same deps as the pre-migration effect ([term.id]) — the three mutation objects are
  // intentionally excluded, same reasoning as `use-term-detail-panel.hooks.ts`'s identical effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutation objects intentionally excluded — same reasoning as use-term-detail-panel.hooks.ts's identical effect.
  useEffect(() => {
    setIntoTermId("");
    setStep("idle");
    setPlan(null);
    setConfirmationToken(null);
    planMutation.reset();
    confirmMutation.reset();
    executeMutation.reset();
  }, [term.id]);

  async function startPlan() {
    if (!intoTermId) return;
    try {
      const r = await planMutation.mutate({ fromTermId: term.id, intoTermId });
      setPlan({ planId: r.planId, planHash: r.planHash, overlappingContentCount: r.details.overlappingContentCount });
      setStep("planned");
    } catch {
      // already surfaced through planMutation.error -> error below
    }
  }

  async function doConfirm() {
    if (!plan) return;
    try {
      const r = await confirmMutation.mutate({ fromTermId: term.id, planId: plan.planId, planHash: plan.planHash });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch {
      // already surfaced through confirmMutation.error -> error below
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    try {
      await executeMutation.mutate({ fromTermId: term.id, intoTermId, confirmationToken });
      onMerged();
    } catch {
      // already surfaced through executeMutation.error -> error below
    }
  }

  // The wizard's three steps are mutually exclusive in practice (confirm only runs after a
  // successful plan, execute only after a successful confirm), so at most one of these three is
  // ever non-null at a time — precedence here just picks whichever step is actually active.
  const busy = planMutation.status === "pending" || confirmMutation.status === "pending" || executeMutation.status === "pending";
  const error =
    (planMutation.error && describeApiError(planMutation.error, t(locale, "Failed to plan the merge"))) ??
    (confirmMutation.error && describeApiError(confirmMutation.error, t(locale, "Failed to confirm the merge"))) ??
    (executeMutation.error && describeApiError(executeMutation.error, t(locale, "Failed to execute the merge"))) ??
    null;

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
