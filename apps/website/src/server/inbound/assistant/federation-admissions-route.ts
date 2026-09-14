import type { Express, Request, Response } from "express";

import type { FederatedAdmissionReport } from "#src/assistant/mcp-federation/trust";

/**
 * @file `GET /api/federation/admissions` — reports what THIS daemon process actually admitted from
 * every configured external MCP connection at boot, rather than only writing that accounting to
 * this process's own stderr and discarding it (`mcp-federation/bootstrap.ts`'s
 * `logFederatedAdmissionReport`, which still runs and is unaffected by this route).
 *
 * Why this exists: `mcp-federation/trust.ts` R5 freezes the admitted set at connect, on purpose
 * (rug-pull protection — see that file's own header). The tab an operator edits, though, is not the
 * thing this daemon actually loaded; today the only way to see the gap between "what was saved" and
 * "what is live" is to read this process's terminal at the moment it booted. That is how this
 * project discovered Higgsfield's blocked `generate_image` in the first place. This route is the
 * structured, machine-readable form of the same accounting — see the write-tools implementation
 * outline, C-009 and §3.1 Source B.
 *
 * Authenticated by the SAME mechanism as every other route in this process: `agent-daemon-
 * server.ts` mounts `requireAgentDaemonToken()` globally, as the very first `app.use`, before any
 * route (including this one) is registered, and this path is never added to that gate's
 * `exemptPaths`. So a caller with no/invalid bearer token gets the gate's own fail-closed 401 (or
 * 503 if the daemon's own token is unconfigured) before this handler ever runs — there is
 * deliberately no second auth check inside this file. See `daemon-auth.ts`.
 *
 * In-memory and process-scoped, matching R5's own framing: `reports` is a LIVE getter over whatever
 * `attachFederatedMcpTools` has returned so far this process — the boot-time pass, plus every
 * federation hot-reload pass since (`mcp-federation/reload.ts`, `federation-reload-route.ts`) —
 * never persisted, and lost on restart, which is correct: it describes THIS process's admitted set,
 * and a stale answer here would be worse than an honest "ask again after the next boot."
 *
 * Was a plain snapshot array, handed in once at registration time, until federation hot-reload
 * (2026-09-11) needed this route to stay accurate after a reload rebinds `agent-daemon-server.ts`'s
 * `federationAdmissionReports` `let` to a NEW array — a plain captured array reference would keep
 * pointing at the boot-time one forever. A getter closure is the identical fix
 * `withFederatedRefusalDiagnosis`'s `() => federationAdmissionReports` already applies one call site
 * over, in that same file, for the identical reason.
 *
 * `configFailures` (2026-09-13): a SAVED, enabled row can fail before it ever reaches
 * `attachFederatedMcpTools` at all — most commonly a sealed env block that cannot be decrypted
 * because the site token is not available (`external-mcp-store.ts`'s `openExternalMcpEnv`). Such a
 * row has no admission report and is therefore invisible to `reports` above, which is exactly why an
 * operator whose saved server hit this case was told the generic "the assistant isn't running this
 * server at all" instead of the real reason — the real reason existed only in this process's own
 * stderr (`agent-daemon-server.ts`'s `resolveStoredExternalMcpConnections`). Same live-getter
 * treatment as `reports`, for the same reason: a reload can make a previously-failing row resolve
 * cleanly, and this must stop naming it the moment that happens, not keep reporting a stale failure.
 *
 * The intended caller is `src/server/routes/admin/external-mcp` (a separate phase, C-008), which
 * proxies this over the same authenticated `AGENT_DAEMON_URL` + `AGENT_DAEMON_TOKEN_ENV_VAR` channel
 * `assistant-daemon-client.ts` already uses. This route itself does not know or care who calls it —
 * it is the daemon's own honest answer to "what did you actually admit."
 */

export const FEDERATION_ADMISSIONS_PATH = "/api/federation/admissions";

export interface FederationAdmissionsRouteDeps {
  /**
   * Reads the CURRENT accounting live, called fresh on every request — never cached by this route.
   * `AttachFederatedToolsResult.reports`' own shape, verbatim, one entry per connection that reached
   * admission across every pass so far (boot, plus every reload). A connection that failed before
   * admission (bad spawn, timed-out handshake, native-id collision) contributes no entry, matching
   * that field's own contract. `isPreset` rides along unmodified — this route is a pure serializer,
   * never a reshape point, so a field this file does not itself read still reaches every caller.
   */
  readonly reports: () => readonly { readonly connectionId: string; readonly report: FederatedAdmissionReport; readonly isPreset: boolean }[];
  /**
   * Reads the CURRENT boot/reload-time config-resolution failures live — see this file's own doc on
   * `configFailures` above. One entry per SAVED, enabled row that could not even be turned into a
   * connection attempt (never reached `attachFederatedMcpTools`, so it has no entry in `reports`
   * either). `reason` is `external-mcp-store.ts`'s own operator-facing failure string — already
   * guaranteed secret-free by that module's own contract (see `admin-http/routes/external-mcp/
   * probe.ts`'s INV-006 doc, which relays the identical string to an operator today) — never a raw
   * stack trace or provider error dumped verbatim.
   *
   * Optional, defaulting to none — the same back-compat shape `AdminFederatedAdmissionEntry.isPreset`
   * uses one hop downstream, and for the identical reason: every pre-existing caller that builds
   * this deps object (this file's own tests, `admin-external-mcp-admissions-routes.test.ts`'s
   * stand-in daemon) predates this field and has nothing to report, not "declined to answer".
   */
  readonly configFailures?: () => readonly { readonly connectionId: string; readonly reason: string }[];
}

/**
 * Mounts the read-only admissions report route.
 *
 * @param app - The daemon's Express app, already gated by `requireAgentDaemonToken`.
 * @param deps.reports - Live accessor for the current admission accounting; see
 * {@link FederationAdmissionsRouteDeps}.
 * @param deps.configFailures - Live accessor for the current boot/reload-time config-resolution
 * failures; see {@link FederationAdmissionsRouteDeps}.
 * @complexity O(1) route dispatch; `reports()`/`configFailures()` are each O(1) (a `let` read).
 * @overallScore 100
 */
export function registerFederationAdmissionsRoute(app: Express, deps: FederationAdmissionsRouteDeps): void {
  app.get(FEDERATION_ADMISSIONS_PATH, (_req: Request, res: Response) => {
    const connections = deps.reports();
    // `configFailures` is omitted entirely, not sent as `[]`, when the caller never wired it — the
    // wire shape a pre-existing caller (this file's own older tests, before 2026-09-13) built its
    // exact-equality assertions against must not gain a field it never declared.
    res.status(200).json(deps.configFailures ? { connections, configFailures: deps.configFailures() } : { connections });
  });
}
