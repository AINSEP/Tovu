import { useCallback, useEffect, useRef, useState } from "react";

import {
  canConfirmPlan,
  canRequestPlan,
  confirmationTokenFor,
  planOnScreen,
  summarizePublishReport,
  toPublishReportRows,
  type PublishContentPeerSummary,
  type PublishContentPhase,
  type PublishReportRow,
  type PublishReportSummary,
} from "@tovu/publish-content-ui";

import type { Translate } from "../../../lib/dictionary-translator";
import { defaultPublishContentPort } from "./publish-content-dependencies.hooks";
import type { PublishContentPort } from "./publish-content-port.hooks";

/**
 * @file `PublishContentDialog`'s behaviour — Escape-to-cancel, plus the whole plan -> confirm ->
 * execute ceremony (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4
 * task 11). The component renders what this returns and decides nothing itself, per the standing
 * rule that component logic belongs in a hook.
 *
 * ## What is NOT here
 *
 * The ceremony's *rules* — which rows a run writes, what each outcome is called, and when a plan may
 * be confirmed or executed — live in `@tovu/publish-content-ui` (`apps/website/src/features/
 * publish-content/ui/`), next to the planner whose behaviour they restate. This file is the React
 * shell around them: state, effects, and the three port calls. A rule that could drift from
 * `planner.ts` does not belong in this package.
 *
 * ## Why execute is fired from an effect rather than inline after confirm
 *
 * Plan §4 task 11's acceptance criterion is that the dialog *cannot* fire execute without a
 * confirmed plan. Executing inline at the end of `confirmAndPublish` would make that a property of
 * one function's control flow — true today, and one early-return away from not being true. Instead
 * the token only exists inside a `confirmed` phase, {@link confirmationTokenFor} is the only reader,
 * and the execute effect keys off that reader's result. There is no code path in this file that can
 * call `port.executePublish` with anything else.
 *
 * The server enforces the same property independently — `gateway.execute()` re-runs `computePlan()`
 * and hash-compares it against the confirmed token before any write (`features/publish-content/
 * gated-hooks.ts`). This half exists so the operator never sees a button that would 409.
 */

/** Everything `PublishContentDialog.tsx` renders. Nothing here is a raw port or a setter — the
 *  component gets finished strings and booleans, not state to interpret. */
export interface PublishContentConfirmView {
  readonly phase: PublishContentPhase;
  readonly peers: readonly PublishContentPeerSummary[];
  readonly selectedPeerId: string | null;
  readonly onSelectPeer: (peerId: string) => void;
  readonly rows: readonly PublishReportRow[];
  readonly summary: PublishReportSummary | null;
  readonly primaryLabel: string;
  readonly primaryDisabled: boolean;
  readonly onPrimary: () => void;
  /** A failed plan/confirm/execute, or a failed peer read. `null` when nothing has gone wrong. */
  readonly errorMessage: string | null;
  /** Set when the whole run refused (a content-hash version mismatch) — a different thing from an
   *  error, and it gets its own sentence rather than being flattened into one. */
  readonly refusalReason: string | null;
  readonly doneMessage: string | null;
  readonly noPeersMessage: string | null;
}

const EMPTY_ROWS: readonly PublishReportRow[] = [];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds the primary button's label. Counted copy is assembled from `t()`-resolved fragments rather
 * than one interpolated key, because this app's translator is a key lookup with no interpolation
 * (`lib/dictionary-translator.ts`) — the alternative is a key per possible count.
 *
 * @complexity O(1).
 */
function primaryLabelFor(phase: PublishContentPhase, summary: PublishReportSummary | null, t: Translate): string {
  if (phase.kind === "planning") return t("Planning…");
  if (phase.kind === "confirming" || phase.kind === "executing") return t("Publishing…");
  if (phase.kind === "done") return t("Published");
  if (phase.kind !== "planned") return t("Publish Content");
  const publishing = summary?.publishing ?? 0;
  if (publishing === 0) return t("Nothing to publish");
  return `${t("Publish")} ${publishing} ${publishing === 1 ? t("item") : t("items")}`;
}

/**
 * @param props.onCancel Called when the dialog should close (Escape pressed).
 * @param props.t The screen's own bound translator, threaded down rather than resolved again here.
 * @param props.port Dependency injection seam for tests — see `publish-content-port.hooks.ts`.
 * @complexity Time: O(n) per re-render in the plan's row count (row shaping + the summary counts);
 * space: O(n) for the shaped rows. One document-level keydown listener for the mounted lifetime.
 */
export function usePublishContentConfirm(props: {
  onCancel: () => void;
  t: Translate;
  port?: PublishContentPort;
}): PublishContentConfirmView {
  const { onCancel, t } = props;
  const port = props.port ?? defaultPublishContentPort;

  const [phase, setPhase] = useState<PublishContentPhase>({ kind: "idle" });
  const [peers, setPeers] = useState<readonly PublishContentPeerSummary[]>([]);
  const [peersLoaded, setPeersLoaded] = useState(false);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [peersError, setPeersError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  // `live` guards every `setState` that follows an `await`: the dialog is unmounted by its own
  // Cancel button and by Escape, either of which can land while a plan or a publish is in flight.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { peers: loaded } = await port.listPeers();
        if (cancelled || !live.current) return;
        setPeers(loaded);
        // Auto-select when there is exactly one target: the overwhelmingly common case is a single
        // production peer, and making the operator pick it from a list of one is friction with no
        // decision behind it. With two or more, the dialog asks.
        setSelectedPeerId(loaded.length === 1 ? loaded[0].id : null);
      } catch (error) {
        if (cancelled || !live.current) return;
        setPeersError(messageOf(error));
      } finally {
        if (!cancelled && live.current) setPeersLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [port]);

  const requestPlan = useCallback(async () => {
    if (selectedPeerId === null) return;
    setPhase({ kind: "planning" });
    try {
      const plan = await port.planPublish({ peerId: selectedPeerId });
      if (!live.current) return;
      setPhase({ kind: "planned", plan });
    } catch (error) {
      if (!live.current) return;
      setPhase({ kind: "failed", message: messageOf(error), code: null });
    }
  }, [port, selectedPeerId]);

  const confirmPlan = useCallback(async () => {
    if (selectedPeerId === null || phase.kind !== "planned" || !canConfirmPlan(phase)) return;
    const { plan } = phase;
    setPhase({ kind: "confirming", plan });
    try {
      const { confirmationToken } = await port.confirmPublish({
        peerId: selectedPeerId,
        planId: plan.planId,
        planHash: plan.planHash,
      });
      if (!live.current) return;
      setPhase({ kind: "confirmed", plan, confirmationToken });
    } catch (error) {
      if (!live.current) return;
      setPhase({ kind: "failed", message: messageOf(error), code: null });
    }
  }, [phase, port, selectedPeerId]);

  // The ONLY call site of `port.executePublish` in this package. Its input is whatever
  // `confirmationTokenFor` returns, which is `null` for every phase but `confirmed`/`executing` —
  // see this file's header for why the guard is shaped this way rather than as an inline check.
  const executionToken = confirmationTokenFor(phase);
  useEffect(() => {
    if (executionToken === null || phase.kind !== "confirmed" || selectedPeerId === null) return;
    const { plan } = phase;
    setPhase({ kind: "executing", plan, confirmationToken: executionToken });
    void (async () => {
      try {
        const result = await port.executePublish({ peerId: selectedPeerId, confirmationToken: executionToken });
        if (!live.current) return;
        setPhase({ kind: "done", result });
      } catch (error) {
        if (!live.current) return;
        setPhase({ kind: "failed", message: messageOf(error), code: null });
      }
    })();
  }, [executionToken, phase, port, selectedPeerId]);

  // The report stays on screen through confirm and execute — `planOnScreen` owns which phases have
  // one, so this file never has to re-enumerate them (and cannot get `planning`, which has no plan
  // yet, wrong).
  const visiblePlan = planOnScreen(phase);
  const rows = visiblePlan === null ? EMPTY_ROWS : toPublishReportRows(visiblePlan.details);
  const summary = visiblePlan === null ? null : summarizePublishReport(rows);

  const noPeersMessage =
    peersLoaded && peers.length === 0 && peersError === null
      ? t("No publish target is configured yet. Add one in Settings first.")
      : null;

  const canStart = canRequestPlan(phase) && selectedPeerId !== null;
  const onPrimary = useCallback(() => {
    if (canRequestPlan(phase)) void requestPlan();
    else void confirmPlan();
  }, [confirmPlan, phase, requestPlan]);

  return {
    phase,
    peers,
    selectedPeerId,
    onSelectPeer: setSelectedPeerId,
    rows,
    summary,
    primaryLabel: primaryLabelFor(phase, summary, t),
    primaryDisabled: !(canStart || canConfirmPlan(phase)),
    onPrimary,
    errorMessage: peersError ?? (phase.kind === "failed" ? phase.message : null),
    refusalReason: phase.kind === "planned" && phase.plan.details.refused ? phase.plan.details.refusalReason : null,
    doneMessage:
      phase.kind === "done"
        ? `${t("Published")} ${phase.result.changeSetIds.length} ${phase.result.changeSetIds.length === 1 ? t("change") : t("changes")}.`
        : null,
    noPeersMessage,
  };
}
