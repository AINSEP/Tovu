import { useCallback, useEffect, useRef, useState } from "react";

import {
  canConfirmPlan,
  canRequestPlan,
  confirmationTokenFor,
  countSelectedPublishing,
  planOnScreen,
  selectableRowKeys,
  summarizePublishReport,
  toPublishReportRows,
  type PublishContentPeerSummary,
  type PublishContentPhase,
  type PublishReportRow,
  type PublishReportSummary,
} from "@tovu/publish-content-ui";

import { describeApiError, type AdminPublishDestinationView } from "@/lib/api";

import type { Translate } from "../../../lib/dictionary-translator";
import { defaultPublishContentPort } from "./publish-content-dependencies.hooks";
import type { PublishContentPort } from "./publish-content-port.hooks";

/**
 * @file The colocated `PublishContentDialog` behaviour — Escape-to-cancel, plus plan -> confirm ->
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

/** The empty state's offer to connect — what replaces the old "configure a peer in Settings" dead
 *  end (`destination.ts`'s header: the connect action lives here, behind Publish, rather than on a
 *  settings screen the owner has to already know to visit). `message` is the server's own sentence
 *  (`AdminPublishDestinationView.message`) verbatim, never rewritten here. */
export interface PublishContentConnectOffer {
  readonly message: string;
  /** `null` on a fresh install with nothing deployed yet — the primary button stays disabled until
   *  there is a candidate to connect to. */
  readonly candidateUrl: string | null;
}

/** Everything `PublishContentDialog.tsx` renders. Nothing here is a raw port or a setter — the
 *  component gets finished strings and booleans, not state to interpret. */
export interface PublishContentConfirmView {
  readonly phase: PublishContentPhase;
  readonly peers: readonly PublishContentPeerSummary[];
  readonly selectedPeerId: string | null;
  readonly onSelectPeer: (peerId: string) => void;
  readonly rows: readonly PublishReportRow[];
  readonly summary: PublishReportSummary | null;
  /** The keys of the rows this run would publish — every {@link PublishReportRow.selectable} row the
   *  operator has not unchecked. Rows that are not selectable are never in here. */
  readonly selectedKeys: ReadonlySet<string>;
  readonly onToggleRow: (key: string) => void;
  /** Checks every selectable row, or unchecks every one of them when any is currently checked. */
  readonly onToggleAll: () => void;
  /** `false` once the operator has committed (confirming/executing/done) — the report stays on
   *  screen through those phases, but its checkboxes stop being an offer at that point. */
  readonly selectionEnabled: boolean;
  /** Header-checkbox state. `someSelected` is the indeterminate case and is never true at the same
   *  time as `allSelected`. */
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly primaryLabel: string;
  readonly primaryDisabled: boolean;
  readonly onPrimary: () => void;
  /** A failed plan/confirm/execute, or a failed peer read. `null` when nothing has gone wrong. */
  readonly errorMessage: string | null;
  /** Set when the whole run refused (a content-hash version mismatch) — a different thing from an
   *  error, and it gets its own sentence rather than being flattened into one. */
  readonly refusalReason: string | null;
  readonly doneMessage: string | null;
  /** Set once peers have loaded empty and the destination check has resolved. `null` while peers
   *  exist, are still loading, or the destination check hasn't resolved yet — see this file's
   *  connect-offer effect. */
  readonly connectOffer: PublishContentConnectOffer | null;
}

const EMPTY_ROWS: readonly PublishReportRow[] = [];

/**
 * Operator-facing copy for a failed call, via the shared `describeApiError` base case rather than a
 * local `error.message` read (the 2026-08-01 adversarial-UX audit's cross-cutting finding #2: every
 * screen that rebuilt this chain itself, and every screen whose author forgot, showed a raw
 * developer string or a blank).
 *
 * The verbatim pass-through matters here specifically. A peer whose host resolves to a private
 * address answers 502 `EGRESS_REFUSED` with a message naming `devHostAllowlist` and the env var to
 * set — that sentence is the operator's only instruction for fixing it, so it must reach the screen
 * unrewritten. `request()` throws it as an `ApiError` whose `message` IS `body.error`, and
 * `describeApiError` returns that untouched; the fallback only covers an empty message or a thrown
 * non-Error.
 *
 * @complexity O(1).
 */
function messageOf(error: unknown, fallback: string): string {
  return describeApiError(error, fallback);
}

/**
 * Builds the primary button's label. Counted copy is assembled from `t()`-resolved fragments rather
 * than one interpolated key, because this app's translator is a key lookup with no interpolation
 * (`lib/dictionary-translator.ts`) — the alternative is a key per possible count.
 *
 * The connect offer takes priority over every phase check below it: while it is present, the same
 * button IS the connect action (see this file's header note on why one control is reused rather
 * than adding a second button next to a disabled "Publish").
 *
 * @complexity O(1).
 */
function primaryLabelFor(
  phase: PublishContentPhase,
  selectedPublishing: number,
  connectOffer: PublishContentConnectOffer | null,
  connecting: boolean,
  t: Translate
): string {
  if (connectOffer) return connecting ? t("Connecting…") : t("Connect");
  if (phase.kind === "planning") return t("Planning…");
  if (phase.kind === "confirming" || phase.kind === "executing") return t("Publishing…");
  if (phase.kind === "done") return t("Published");
  if (phase.kind !== "planned") return t("Publish Content");
  // The SELECTED count, not the plan's own: the button must promise what this click will actually
  // do. A plan of 59 writable rows with 56 unchecked says "Publish 3 items".
  if (selectedPublishing === 0) return t("Nothing to publish");
  return `${t("Publish")} ${selectedPublishing} ${selectedPublishing === 1 ? t("item") : t("items")}`;
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

  // The empty state's connect offer — only ever populated when the peer list comes back empty (see
  // the effect below). `destination` and `destinationError` are mutually exclusive with each other,
  // same convention as `peers`/`peersError`.
  const [destination, setDestination] = useState<AdminPublishDestinationView | null>(null);
  const [destinationLoaded, setDestinationLoaded] = useState(false);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Stored as what the operator UNCHECKED, not as what is checked. "All checked by default" is then
  // the empty set rather than a value that has to be seeded from the plan the moment it arrives —
  // there is no effect to forget, no window where the rows render before the seeding lands, and a
  // re-plan's new rows arrive checked without anything having to re-seed them.
  const [deselectedKeys, setDeselectedKeys] = useState<ReadonlySet<string>>(() => new Set());

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
        // Nothing to publish to yet — check whether this install can offer a one-click connect
        // instead of failing shut. Sequenced after `listPeers` rather than fired in parallel: the
        // common case (already connected) never needs this second call at all.
        if (loaded.length === 0) {
          try {
            const view = await port.getDestination();
            if (cancelled || !live.current) return;
            setDestination(view);
          } catch (destinationErr) {
            if (cancelled || !live.current) return;
            setDestinationError(messageOf(destinationErr, t("Could not check whether this install can publish yet.")));
          } finally {
            if (!cancelled && live.current) setDestinationLoaded(true);
          }
        }
      } catch (error) {
        if (cancelled || !live.current) return;
        setPeersError(messageOf(error, t("Could not load publish targets.")));
      } finally {
        if (!cancelled && live.current) setPeersLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `t` is read only for a fallback string and is deliberately NOT a dependency: a caller whose
    // translator is a fresh closure each render would otherwise refetch the peer list on every
    // render. The worst case is a fallback sentence in a stale locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  // Takes `peerId` explicitly rather than reading `selectedPeerId` off closure: `onConnect` below
  // calls this in the same tick it learns the newly-connected peer's id, before that `setState` has
  // committed, so a closure read here would still see `null`.
  const requestPlan = useCallback(
    async (peerId: string) => {
      setPhase({ kind: "planning" });
      try {
        const plan = await port.planPublish({ peerId });
        if (!live.current) return;
        setPhase({ kind: "planned", plan });
      } catch (error) {
        if (!live.current) return;
        setPhase({ kind: "failed", message: messageOf(error, t("Could not work out what would be published.")), code: null });
      }
    },
    [port, t]
  );

  // The connect action behind the empty state — `destination.ts`'s header explains why it lives
  // here rather than on a settings screen. Success folds the newly connected site straight into
  // `peers`/`selectedPeerId` and moves on to planning immediately: the operator asked to publish,
  // not to "connect", so the one extra click stays inside the same flow rather than landing back on
  // a now-idle dialog they'd have to press Publish on again.
  const onConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    setDestinationError(null);
    try {
      const view = await port.connectDestination();
      if (!live.current) return;
      if (view.site === null) {
        // Contract violation, not a user-facing failure mode: `destination.ts`'s `/connect` always
        // returns a site on success. Guarded rather than assumed so a server regression here shows
        // up as a sentence instead of a crash.
        setDestinationError(t("Could not connect."));
        setConnecting(false);
        return;
      }
      const { site } = view;
      setPeers([site]);
      setSelectedPeerId(site.id);
      setConnecting(false);
      void requestPlan(site.id);
    } catch (error) {
      if (!live.current) return;
      setDestinationError(messageOf(error, t("Could not connect.")));
      setConnecting(false);
    }
  }, [connecting, port, requestPlan, t]);

  /**
   * Confirms the plan on screen — and, when the operator unchecked rows, RE-PLANS first against a
   * bundle narrowed to what is still checked, then confirms THAT plan.
   *
   * The re-plan is what makes a deselection real. A confirmation token is bound to one plan hash, and
   * the destination applies the bundle it planned — so the only way to publish a subset is to give
   * the destination that subset to plan in the first place (`export-bundle.ts`'s
   * `selectBundleEntities`, via `push/plan`'s `selectedEntityKeys`). The alternative, carrying a
   * selection into execute for the apply loop to honour, would put the operator's exclusion behind a
   * flag a destination running an older build would silently ignore and publish everything anyway.
   *
   * A narrowed re-plan that turns out to write nothing lands back on `planned` with the narrowed
   * rows showing rather than confirming a run that would burn a restore point to do nothing.
   */
  const confirmPlan = useCallback(async () => {
    if (selectedPeerId === null || phase.kind !== "planned" || !canConfirmPlan(phase)) return;
    const { plan } = phase;
    const selectable = selectableRowKeys(toPublishReportRows(plan.details));
    const keep = selectable.filter((key) => !deselectedKeys.has(key));
    if (keep.length === 0) return;
    setPhase({ kind: "confirming", plan });
    try {
      const confirmed =
        keep.length === selectable.length
          ? plan
          : await port.planPublish({ peerId: selectedPeerId, selectedEntityKeys: keep });
      if (!live.current) return;
      if (!canConfirmPlan({ kind: "planned", plan: confirmed })) {
        setPhase({ kind: "planned", plan: confirmed });
        return;
      }
      const { confirmationToken } = await port.confirmPublish({
        peerId: selectedPeerId,
        planId: confirmed.planId,
        planHash: confirmed.planHash,
      });
      if (!live.current) return;
      setPhase({ kind: "confirmed", plan: confirmed, confirmationToken });
    } catch (error) {
      if (!live.current) return;
      setPhase({ kind: "failed", message: messageOf(error, t("Could not publish.")), code: null });
    }
  }, [deselectedKeys, phase, port, selectedPeerId, t]);

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
        // `plan.bundleId` travels from the plan response into the execute call — the peer refuses a
        // token presented against any bundle but the one it planned.
        const result = await port.executePublish({
          peerId: selectedPeerId,
          bundleId: plan.bundleId,
          confirmationToken: executionToken,
        });
        if (!live.current) return;
        setPhase({ kind: "done", result });
      } catch (error) {
        if (!live.current) return;
        setPhase({ kind: "failed", message: messageOf(error, t("Could not publish.")), code: null });
      }
    })();
  }, [executionToken, phase, port, selectedPeerId, t]);

  // The report stays on screen through confirm and execute — `planOnScreen` owns which phases have
  // one, so this file never has to re-enumerate them (and cannot get `planning`, which has no plan
  // yet, wrong).
  const visiblePlan = planOnScreen(phase);
  const rows = visiblePlan === null ? EMPTY_ROWS : toPublishReportRows(visiblePlan.details);
  const summary = visiblePlan === null ? null : summarizePublishReport(rows);

  // Derived every render rather than stored: `deselectedKeys` is the only state, so these can never
  // disagree with it or with the rows currently on screen.
  const selectableKeys = selectableRowKeys(rows);
  const selectedKeys: ReadonlySet<string> = new Set(selectableKeys.filter((key) => !deselectedKeys.has(key)));
  const selectedPublishing = countSelectedPublishing(rows, selectedKeys);
  const allSelected = selectableKeys.length > 0 && selectedKeys.size === selectableKeys.length;
  const someSelected = selectedKeys.size > 0 && !allSelected;

  // `null` until BOTH the peer list came back empty and the destination check that follows it has
  // resolved — so the dialog never flashes a stale "add one in Settings" sentence, and never shows
  // the connect offer a beat before it has anything real to say.
  const connectOffer: PublishContentConnectOffer | null =
    peersLoaded && peers.length === 0 && peersError === null && destinationLoaded && destination !== null
      ? { message: destination.message, candidateUrl: destination.candidateUrl }
      : null;

  // Checkboxes are an offer, and the offer closes the moment the operator commits: `planned` is the
  // only phase where changing the selection could still change what gets published.
  const selectionEnabled = phase.kind === "planned";

  const onToggleRow = (key: string): void => {
    setDeselectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // "Any checked -> uncheck everything", so the header is an escape hatch from a big plan rather
  // than a toggle whose meaning flips at an invisible halfway point.
  const onToggleAll = (): void => {
    setDeselectedKeys(selectedKeys.size > 0 ? new Set(selectableKeys) : new Set());
  };

  const canStart = canRequestPlan(phase) && selectedPeerId !== null;
  const onPrimary = useCallback(() => {
    if (connectOffer) {
      void onConnect();
      return;
    }
    if (canRequestPlan(phase)) {
      if (selectedPeerId !== null) void requestPlan(selectedPeerId);
    } else {
      void confirmPlan();
    }
  }, [confirmPlan, connectOffer, onConnect, phase, requestPlan, selectedPeerId]);

  return {
    phase,
    peers,
    selectedPeerId,
    onSelectPeer: setSelectedPeerId,
    rows,
    summary,
    selectedKeys,
    onToggleRow,
    onToggleAll,
    selectionEnabled,
    allSelected,
    someSelected,
    primaryLabel: primaryLabelFor(phase, selectedPublishing, connectOffer, connecting, t),
    primaryDisabled: connectOffer
      ? connecting || connectOffer.candidateUrl === null
      : // `selectedPublishing` is ANDed with the plan-level rule, never a replacement for it: a plan
        // that may not be confirmed at all stays disabled whatever is checked, and a confirmable
        // plan with everything unchecked is disabled too — the button never promises a run that
        // would write nothing.
        !(canStart || (canConfirmPlan(phase) && selectedPublishing > 0)),
    onPrimary,
    errorMessage: peersError ?? destinationError ?? (phase.kind === "failed" ? phase.message : null),
    refusalReason: phase.kind === "planned" && phase.plan.details.refused ? phase.plan.details.refusalReason : null,
    doneMessage:
      phase.kind === "done"
        ? `${t("Published")} ${phase.result.changeSetIds.length} ${phase.result.changeSetIds.length === 1 ? t("change") : t("changes")}.`
        : null,
    connectOffer,
  };
}
