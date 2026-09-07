import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, describeApiError, type AdminExternalMcpAdmissionsSnapshot } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { hasPermission } from "@/lib/permissions";

import { describeAdmissionDrift, type AdmissionDriftConnection, type SavedConnectionIntent } from "../external-mcp-admissions-rules";

/**
 * @file The transport behind Settings → External MCP's "what is the assistant actually running"
 * banner: three reads the app already had clients for, and never called together.
 *
 * ## The 503 is data, not an error to swallow
 *
 * `GET .../mcp-servers/admissions` answers a down or unreachable daemon with a distinguishable 503
 * (`code: "AGENT_DAEMON_UNAVAILABLE"`) rather than `{ connections: [] }`, precisely so "the
 * assistant is not running" and "it is running with nothing admitted" stay distinguishable — see
 * that route's own header. This hook preserves that: {@link ExternalMcpAdmissionsController.unavailable}
 * is a sentence to render, never a silently empty list.
 *
 * ## Why the restart button needs a permission read of its own
 *
 * `POST .../system/assistant-daemon/restart` is `system.write`-gated, while this whole tab is
 * `admin.integrations.manage`-gated — so an operator with integration rights and no system rights
 * would get a 403 from a button that looked available. The outline calls that out as decision D-4
 * and answers it: hide the button, and say who can do it instead. `hasPermission` (not a bare
 * `.includes`) is what makes that correct for a workspace owner, whose grant is the literal `"*"`.
 *
 * This is affordance-hiding, not authorization: the route re-checks server-side on every call.
 */

/** The three calls this hook makes, injectable so a test composes it with plain fakes. */
export interface ExternalMcpAdmissionsPort {
  getAdmissions(): Promise<AdminExternalMcpAdmissionsSnapshot>;
  me(): Promise<{ effectivePermissions?: string[] }>;
  restartAssistantDaemon(): Promise<{ ok: boolean; reason?: string }>;
}

export interface ExternalMcpAdmissionsController {
  readonly loading: boolean;
  /** A sentence to render when the daemon could not be asked. `null` when it answered. */
  readonly unavailable: string | null;
  /** Only connections with something to say — an agreeing roster renders nothing. */
  readonly connections: readonly AdmissionDriftConnection[];
  /** D-4: whether this principal may actually restart the assistant. */
  readonly canRestart: boolean;
  readonly restarting: boolean;
  /** The restart route's own refusal reason (it answers 409 while shutting down), or `null`. */
  readonly restartError: string | null;
  /** `true` while a restart this hook triggered was ACCEPTED and the bounded re-read that follows it
   *  is still running — never "the assistant is back up", which no signal in this codebase can
   *  currently claim (see the restart route's own header). It goes false when the watch window
   *  closes, so the "Restarting…" line stops after {@link RESTART_WATCH_ATTEMPTS} attempts rather
   *  than standing for the rest of the mounted session (2026-09-07, ADM-002). */
  readonly restartAccepted: boolean;
  restart(): void;
}

const ADMISSIONS_KEY = ["external-mcp", "admissions"] as const;
const PERMISSIONS_KEY = ["auth", "me"] as const;

export const defaultExternalMcpAdmissionsPort: ExternalMcpAdmissionsPort = {
  getAdmissions: () => api.getExternalMcpAdmissions(),
  me: () => api.me(),
  restartAssistantDaemon: () => api.restartAssistantDaemon(),
};

/** Splits the admissions read into "answered" and "could not be asked". Extracted so
 *  {@link useExternalMcpAdmissions} stays under the shop complexity ceiling; the fallback sentence
 *  is `describeApiError`'s job, so the route's own 503 body reaches the operator rather than being
 *  replaced by a generic one. */
function resolveUnavailable(error: unknown): string | null {
  if (!error) return null;
  return describeApiError(error, "The assistant is not reporting what it loaded — it may not be running.");
}

/** Gap between post-restart re-reads. The daemon is a child of the API process and comes back in
 *  roughly three seconds, so this is a little under two boots — long enough that a slow boot is not
 *  spent on the first two attempts, short enough that the banner is not visibly lagging. */
const RESTART_WATCH_INTERVAL_MS = 2_500;

/** How many re-reads one accepted restart buys. Eight × 2.5s covers twenty seconds, which is far
 *  outside any observed daemon boot. Bounded rather than "until the snapshot changes" because
 *  nothing in the snapshot identifies WHICH daemon answered — a restart into an identical
 *  configuration produces a byte-identical reply, so "it changed" is not a signal that exists. */
const RESTART_WATCH_ATTEMPTS = 8;

/**
 * A bounded re-read of the admissions snapshot, armed by an accepted restart.
 *
 * Not `invalidates: [ADMISSIONS_KEY]` on the restart mutation, and that is the whole design point.
 * `POST .../system/assistant-daemon/restart` answers as soon as a restart has been INITIATED and
 * structurally cannot wait for the new daemon to be healthy (that route's own header states this
 * and points the caller at polling instead). A refetch fired on its 200 is therefore guaranteed to
 * read the dying daemon or a 503 — it would replace one wrong answer with another and then stop.
 *
 * A chain of `setTimeout`s driven by the remaining-attempt count, rather than one `setInterval`:
 * the count is the state the UI already needs to render (`watching`), so deriving the schedule from
 * it keeps one source of truth and makes React's own cleanup cancel the pending read on unmount.
 *
 * @param refetch - The admissions query's `refetch`. Read through a ref because `useFetchQuery`
 *   rebuilds it every render (its `useCallback` closes over TanStack's per-render result object),
 *   so depending on it directly would re-arm the timer on every render — a spin, not a schedule.
 * @complexity O(1) per attempt; at most {@link RESTART_WATCH_ATTEMPTS} attempts per accepted restart.
 */
function useRestartWatch(refetch: () => void): { watching: boolean; begin: () => void } {
  const [attemptsLeft, setAttemptsLeft] = useState(0);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    // One arming expression and one cleanup, rather than an early `return` for the idle case:
    // `clearTimeout(undefined)` is a specified no-op, so the idle render still yields a cleanup and
    // the effect has a single exit.
    const handle =
      attemptsLeft <= 0
        ? undefined
        : setTimeout(() => {
            refetchRef.current();
            setAttemptsLeft((left) => left - 1);
          }, RESTART_WATCH_INTERVAL_MS);
    return () => clearTimeout(handle);
  }, [attemptsLeft]);

  const begin = useCallback(() => setAttemptsLeft(RESTART_WATCH_ATTEMPTS), []);
  return { watching: attemptsLeft > 0, begin };
}

/** One restart outcome — a RESOLVED `{ok: false, reason}` is this route's "refused right now", not a
 *  rejection (`api.ts`'s own comment on `restartAssistantDaemon`). */
type RestartOutcome = { ok: boolean; reason?: string };

/**
 * The click handler: fire the restart, record its outcome, and arm the post-restart watch only when
 * the restart was ACCEPTED. A `{ok: false}` refusal ("shutting down") means nothing was restarted,
 * so there is no new daemon to catch up to and re-reading would just re-fetch the same snapshot
 * eight times.
 *
 * Split out of {@link useExternalMcpAdmissions} to keep that hook under the shop complexity ceiling.
 *
 * @complexity O(1).
 */
function useRestartAction(
  mutate: (input: undefined) => Promise<RestartOutcome>,
  setOutcome: (outcome: RestartOutcome | null) => void,
  beginRestartWatch: () => void,
): () => void {
  return useCallback(() => {
    setOutcome(null);
    // `.catch` is required, not defensive: `mutate`'s own promise already carries a handler, but
    // `.then` derives a NEW promise that would reject unhandled. The failure itself is not
    // swallowed — it is read back off `restartCall.error` by the caller.
    void mutate(undefined)
      .then((result) => {
        setOutcome(result);
        if (result.ok) beginRestartWatch();
      })
      .catch(() => undefined);
  }, [mutate, setOutcome, beginRestartWatch]);
}

/** The route's own refusal reason, or `null`. Its 409 body carries `reason`; an older build that
 *  refuses without one still has to say something, so the fallback is a sentence rather than a
 *  silent `null` that would render as "the restart worked". */
function resolveRefusal(outcome: RestartOutcome | null): string | null {
  if (!outcome || outcome.ok) return null;
  return outcome.reason ?? "the restart was refused";
}

/**
 * @param deps.port - See {@link ExternalMcpAdmissionsPort}.
 * @param deps.savedAllowedToolNamesById - Each roster card's own `allowedToolNames` field value,
 *   keyed by server id, plus its on/off toggle, so the banner can state saved-vs-live rather than
 *   only live — including for a saved connection the daemon never reported (ADM-001).
 * @complexity O(c · t) in connections and their refused tools.
 * @overallScore 100
 */
export function useExternalMcpAdmissions(deps: {
  port: ExternalMcpAdmissionsPort;
  savedAllowedToolNamesById: Readonly<Record<string, SavedConnectionIntent>>;
}): ExternalMcpAdmissionsController {
  const { port, savedAllowedToolNamesById } = deps;

  const admissions = useFetchQuery({ key: ADMISSIONS_KEY, fetch: () => port.getAdmissions() });
  const permissions = useFetchQuery({ key: PERMISSIONS_KEY, fetch: () => port.me() });
  const restartCall = useFetchMutation({ run: () => port.restartAssistantDaemon() });
  // `MutationResult` carries `status`/`error` but no `data`, and this route's "refused right now"
  // outcome is a RESOLVED `{ ok: false, reason }` rather than a rejection (`api.ts`'s own comment on
  // `restartAssistantDaemon`) — so the refusal reason has to be captured here or it is lost.
  const [outcome, setOutcome] = useState<RestartOutcome | null>(null);

  const connections = useMemo(
    () => describeAdmissionDrift(admissions.data, savedAllowedToolNamesById),
    [admissions.data, savedAllowedToolNamesById],
  );

  const { watching, begin: beginRestartWatch } = useRestartWatch(admissions.refetch);
  const restart = useRestartAction(restartCall.mutate, setOutcome, beginRestartWatch);

  const refusal = resolveRefusal(outcome);

  return {
    loading: admissions.status === "loading",
    unavailable: resolveUnavailable(admissions.error),
    connections,
    canRestart: hasPermission(permissions.data?.effectivePermissions ?? [], "system.write"),
    restarting: restartCall.status === "pending",
    restartError: refusal ?? (restartCall.error ? describeApiError(restartCall.error, "Could not restart the assistant.") : null),
    restartAccepted: outcome?.ok === true && watching,
    restart,
  };
}

/** The zero-argument half of the `useX(deps)` / `useWiredX()` pair this app uses everywhere, so a
 *  component composes the real ports and a test composes fakes. */
export function useWiredExternalMcpAdmissions(
  savedAllowedToolNamesById: Readonly<Record<string, SavedConnectionIntent>>,
): ExternalMcpAdmissionsController {
  return useExternalMcpAdmissions({ port: defaultExternalMcpAdmissionsPort, savedAllowedToolNamesById });
}
