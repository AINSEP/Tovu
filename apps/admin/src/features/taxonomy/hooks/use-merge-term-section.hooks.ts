import { useEffect, useRef, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Stale-response guard (2026-09-05, same class of bug `use-widget-instance-editor.hooks.ts`'s
  // `activeEntityRef`/`use-term-detail-panel.hooks.ts`'s `activeTermIdRef` already fix for their own
  // save()-after-navigate cases): `Taxonomy.tsx` mounts `MergeTermSection` with no
  // `key={term.id}` — switching the selected term re-renders this SAME hook instance with a new
  // `term` prop rather than remounting a fresh one, so a `startPlan`/`doConfirm`/`doExecute` call in
  // flight for the term the operator just navigated AWAY FROM has no effect-cleanup moment of its
  // own to learn that happened. `activeTermIdRef` always holds the latest term id this hook was
  // RENDERED with; every completion handler below skips committing `step`/`plan`/`confirmationToken`/
  // `busy`/`error` onto whatever term is on screen now once the operator has switched. `busy`/`error`
  // are local state rather than read straight off the three mutations' own `.status`/`.error` for the
  // same reason: those objects are NOT re-created per term, so a stale settlement could otherwise
  // flip one again after the term-change effect below has already reset it.
  const activeTermIdRef = useRef(term.id);
  activeTermIdRef.current = term.id;

  // Same deps as the pre-migration effect ([term.id]) — the three mutation objects are
  // intentionally excluded, same reasoning as `use-term-detail-panel.hooks.ts`'s identical effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutation objects intentionally excluded — same reasoning as use-term-detail-panel.hooks.ts's identical effect.
  useEffect(() => {
    setIntoTermId("");
    setStep("idle");
    setPlan(null);
    setConfirmationToken(null);
    setBusy(false);
    setError(null);
    planMutation.reset();
    confirmMutation.reset();
    executeMutation.reset();
  }, [term.id]);

  async function startPlan() {
    if (!intoTermId) return;
    const forTermId = term.id;
    setBusy(true);
    setError(null);
    try {
      const r = await planMutation.mutate({ fromTermId: term.id, intoTermId });
      if (activeTermIdRef.current !== forTermId) return; // superseded by a term switch
      setPlan({ planId: r.planId, planHash: r.planHash, overlappingContentCount: r.details.overlappingContentCount });
      setStep("planned");
    } catch (e) {
      if (activeTermIdRef.current !== forTermId) return;
      setError(describeApiError(e, t(locale, "Failed to plan the merge")));
    } finally {
      if (activeTermIdRef.current === forTermId) setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    const forTermId = term.id;
    setBusy(true);
    setError(null);
    try {
      const r = await confirmMutation.mutate({ fromTermId: term.id, planId: plan.planId, planHash: plan.planHash });
      if (activeTermIdRef.current !== forTermId) return;
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      if (activeTermIdRef.current !== forTermId) return;
      setError(describeApiError(e, t(locale, "Failed to confirm the merge")));
    } finally {
      if (activeTermIdRef.current === forTermId) setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    const forTermId = term.id;
    setBusy(true);
    setError(null);
    try {
      await executeMutation.mutate({ fromTermId: term.id, intoTermId, confirmationToken });
      // `onMerged` also guarded — `Taxonomy.tsx`'s own `onMerged` both clears `selectedTermId` AND
      // reloads; a stale execute must not deselect whatever DIFFERENT term the operator has since
      // switched to. The list still refreshes regardless (`executeMutation`'s own
      // `invalidates: [KEYS.list]` above is not gated on this), so the merge itself is never lost —
      // only this callback's forced deselect/reload is skipped for a superseded call.
      if (activeTermIdRef.current !== forTermId) return;
      onMerged();
    } catch (e) {
      if (activeTermIdRef.current !== forTermId) return;
      setError(describeApiError(e, t(locale, "Failed to execute the merge")));
    } finally {
      if (activeTermIdRef.current === forTermId) setBusy(false);
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
