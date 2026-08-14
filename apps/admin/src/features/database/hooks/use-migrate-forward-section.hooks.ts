import { useState } from "react";
import { describeApiError } from "../../../lib/api";
import { useFetchMutation } from "../../../lib/fetch-query";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";
import { defaultMigrateForwardSectionPort } from "./migrate-forward-section-dependencies.hooks";
import type { MigrateForwardSectionPort } from "./migrate-forward-section-port.hooks";

/**
 * @file Everything `MigrateForwardSection` (the Database screen's plan/confirm/execute
 * migrate-forward ceremony) does, so `Database.tsx` is only markup.
 *
 * Extracted verbatim — same declaration order, same handlers, same error strings.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — see `use-timeline-section.hooks.ts`'s own file
 * header for the full rationale): this hook already called `useAdminLocale()` for its own
 * error-string translations, so exposing that same already-resolved `locale` as a bound `t` (plus
 * the raw value, still needed for this section's own local step subcomponents and
 * `planReadyMessage`) on the return value adds no new fetch.
 *
 * `lib/fetch-query` migration (2026-08-12): `startPlan`/`doConfirm`/`doExecute` are three
 * `useFetchMutation`s with no `invalidates` — see `rules.ts`'s own header: this ceremony has no
 * GET/read of its own to cache (`step`/`plan`/`confirmationToken`/`done` are pure client-side
 * workflow state, not a server resource another screen could invalidate into), so there is nothing
 * to invalidate. `useFetchMutation` is still the right seam here purely for its consistent
 * pending/error tracking (`mutation.status`/`.error`), replacing the hand-rolled `setBusy`/
 * `setError` pairs each handler used to open and close by hand. `step`/`plan`/`confirmationToken`/
 * `done` stay local `useState` — they encode the ceremony's own sequence, which no mutation object
 * carries on its own. `error` is a simple precedence chain (not `clearOtherWriteErrors`): the three
 * mutations are mutually exclusive by construction (`doConfirm`/`doExecute` both no-op without
 * their predecessor's output), so at most one ever holds a non-null `.error` at a time. `reset()`
 * now also resets all three mutations, so a stale failure from an earlier attempt at the current
 * step doesn't survive a full ceremony reset.
 *
 * DI seam (2026-08-14, Orc-BASH pass): `port` is now injected — see `migrate-forward-section-
 * port.hooks.ts` — rather than reaching `lib/api` directly, so a test can describe the
 * plan/confirm/execute ceremony against `createFakeMigrateForwardSectionPort` instead of stubbing
 * global `fetch`. `useWiredMigrateForwardSection` below is the zero-argument pair `Database.tsx`
 * actually mounts.
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

export interface MigrateForwardSectionDependencies {
  port: MigrateForwardSectionPort;
}

export function useMigrateForwardSection(deps: MigrateForwardSectionDependencies): MigrateForwardSectionController {
  const { port } = deps;
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const [step, setStep] = useState<CeremonyStep>("idle");
  const [plan, setPlan] = useState<{ planId: string; planHash: string } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const startPlanMutation = useFetchMutation({ run: (_: undefined) => port.planMigrateForward() });
  const confirmMutation = useFetchMutation({
    run: (input: { planId: string; planHash: string }) => port.confirmMigrateForward(input),
  });
  const executeMutation = useFetchMutation({ run: (confirmationTokenInput: string) => port.executeMigrateForward(confirmationTokenInput) });

  function reset() {
    setStep("idle");
    setPlan(null);
    setConfirmationToken(null);
    setDone(false);
    startPlanMutation.reset();
    confirmMutation.reset();
    executeMutation.reset();
  }

  async function startPlan() {
    try {
      const r = await startPlanMutation.mutate(undefined);
      setPlan({ planId: r.planId, planHash: r.planHash });
      setStep("planned");
    } catch {
      // already surfaced through startPlanMutation.error -> error below
    }
  }

  async function doConfirm() {
    if (!plan) return;
    try {
      const r = await confirmMutation.mutate({ planId: plan.planId, planHash: plan.planHash });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch {
      // already surfaced through confirmMutation.error -> error below
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    try {
      await executeMutation.mutate(confirmationToken);
      setDone(true);
      setStep("done");
    } catch {
      // already surfaced through executeMutation.error -> error below
    }
  }

  const busy = startPlanMutation.status === "pending" || confirmMutation.status === "pending" || executeMutation.status === "pending";
  // Mutually exclusive by construction (`doConfirm`/`doExecute` both no-op without their
  // predecessor's output — see this file's own header), so at most one of these three is ever
  // non-null at a time; a plain precedence chain is enough, no `clearOtherWriteErrors` needed.
  const rawError = startPlanMutation.error ?? confirmMutation.error ?? executeMutation.error;
  let error: string | null = null;
  if (startPlanMutation.error) {
    error = describeApiError(rawError, t(locale, "Failed to plan the forward migration"));
  } else if (confirmMutation.error) {
    error = describeApiError(rawError, t(locale, "Failed to confirm the forward migration"));
  } else if (executeMutation.error) {
    error = describeApiError(rawError, t(locale, "Failed to execute the forward migration"));
  }

  return { step, busy, error, plan, confirmationToken, done, reset, startPlan, doConfirm, doExecute, t: boundT, locale };
}

/**
 * Binds the real `/api/.../database/migrate-forward` client — see `migrate-forward-section-
 * dependencies.hooks.ts`. The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair,
 * so `Database.tsx` composes this and a test composes {@link useMigrateForwardSection} with
 * `createFakeMigrateForwardSectionPort`.
 */
export function useWiredMigrateForwardSection(): MigrateForwardSectionController {
  return useMigrateForwardSection({ port: defaultMigrateForwardSectionPort });
}
