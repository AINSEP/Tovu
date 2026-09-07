import { useCallback, useMemo, useState } from "react";

import { api, describeApiError, type AdminExternalMcpAdmissionsSnapshot } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { hasPermission } from "@/lib/permissions";

import { describeAdmissionDrift, type AdmissionDriftConnection } from "../external-mcp-admissions-rules";

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
  /** `true` once a restart was ACCEPTED — never "the assistant is back up", which no signal in
   *  this codebase can currently claim (see the restart route's own header). */
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

/**
 * @param deps.port - See {@link ExternalMcpAdmissionsPort}.
 * @param deps.savedAllowedToolNamesById - Each roster card's own `allowedToolNames` field value,
 *   keyed by server id, so the banner can state saved-vs-live rather than only live.
 * @complexity O(c · t) in connections and their refused tools.
 * @overallScore 100
 */
export function useExternalMcpAdmissions(deps: {
  port: ExternalMcpAdmissionsPort;
  savedAllowedToolNamesById: Readonly<Record<string, string>>;
}): ExternalMcpAdmissionsController {
  const { port, savedAllowedToolNamesById } = deps;

  const admissions = useFetchQuery({ key: ADMISSIONS_KEY, fetch: () => port.getAdmissions() });
  const permissions = useFetchQuery({ key: PERMISSIONS_KEY, fetch: () => port.me() });
  const restartCall = useFetchMutation({ run: () => port.restartAssistantDaemon() });
  // `MutationResult` carries `status`/`error` but no `data`, and this route's "refused right now"
  // outcome is a RESOLVED `{ ok: false, reason }` rather than a rejection (`api.ts`'s own comment on
  // `restartAssistantDaemon`) — so the refusal reason has to be captured here or it is lost.
  const [outcome, setOutcome] = useState<{ ok: boolean; reason?: string } | null>(null);

  const connections = useMemo(
    () => describeAdmissionDrift(admissions.data, savedAllowedToolNamesById),
    [admissions.data, savedAllowedToolNamesById],
  );

  const { mutate } = restartCall;
  const restart = useCallback(() => {
    setOutcome(null);
    // `.catch` is required, not defensive: `mutate`'s own promise already carries a handler, but
    // `.then` derives a NEW promise that would reject unhandled. The failure itself is not
    // swallowed — it is read back off `restartCall.error` below.
    void mutate(undefined)
      .then(setOutcome)
      .catch(() => undefined);
  }, [mutate]);

  const refusal = outcome && !outcome.ok ? (outcome.reason ?? "the restart was refused") : null;

  return {
    loading: admissions.status === "loading",
    unavailable: resolveUnavailable(admissions.error),
    connections,
    canRestart: hasPermission(permissions.data?.effectivePermissions ?? [], "system.write"),
    restarting: restartCall.status === "pending",
    restartError: refusal ?? (restartCall.error ? describeApiError(restartCall.error, "Could not restart the assistant.") : null),
    restartAccepted: outcome?.ok === true,
    restart,
  };
}

/** The zero-argument half of the `useX(deps)` / `useWiredX()` pair this app uses everywhere, so a
 *  component composes the real ports and a test composes fakes. */
export function useWiredExternalMcpAdmissions(
  savedAllowedToolNamesById: Readonly<Record<string, string>>,
): ExternalMcpAdmissionsController {
  return useExternalMcpAdmissions({ port: defaultExternalMcpAdmissionsPort, savedAllowedToolNamesById });
}
