import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { createVisitorPageTargets } from "../visitor-page-targets.js";
import { createVisitorFrontendControl } from "#src/assistant/site/visitor-frontend-control";
import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import { daemonRouteHost, mountJiniRoutes, NO_OPERATION_TRACKING, nodeSessionTimer } from "../../../../platform/express/jini-routes.js";
import { requestHookInput } from "#src/platform/express/request-facts";
import { PUBLIC_JSON_BODY_LIMIT_BYTES } from "#src/server/inbound/shared/json-body-parsers";
import { createVisitorTurnDedupe } from "#src/assistant/site/visitor-turn-dedupe";
import { VISITOR_TURN_DUPLICATE_CODE } from "#src/assistant/site/public-errors";
import { redactSecrets } from "@jini-ai/core";
import { createVisitorToolBudgets } from "#src/assistant/site/visitor-tool-budgets";
import { createMemoryCounterStore } from "@jini-ai/http-kit/rate-limit";
import { createVisitorConfirmations, VISITOR_CONFIRMATION_WAIT_MS } from "#src/assistant/site/visitor-confirmations";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler, type SchedulerPort } from "@jini-ai/daemon/scheduler";
import { createVisitorAgUiResume, VISITOR_APPROVAL_EXPIRED } from "#src/assistant/site/visitor-ag-ui-resume";
import { handleVisitorAgUiResume, isVisitorAgUiResume, type VisitorSegment } from "./site-assistant-ag-ui-approval.js";
import { randomBytes } from "node:crypto";
import { isSameOrigin, normalizeOriginCandidate } from "@jini-ai/core/contracts/server/verified-origin";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { registerSiteAssistantConfirm } from "#src/server/inbound/public-http/routes/site-assistant-confirm";
import type { ErrorRequestHandler, Express, Request, Response } from "express";

import { createSiteAssistantErrorReporter, siteAssistantIncident, type SiteAssistantErrorReporter, type SiteAssistantErrorLogEntry, resolveSiteAssistantMode, isPublicAssistantEnabled } from "#src/assistant/index";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";
import { selectVisitorChatWire } from "./site-assistant-ag-ui.js";
import { respondPublicError, runSiteAssistantPreflight } from "./site-assistant-preflight.js";
import { beginStream, createVisitorAgUiSegmentWriter, createVisitorLegacyWriter, createVisitorTurnWriter, handleAdmittedChat, type VisitorTurnStream } from "./site-assistant-turn.js";

/**
 * @file The PUBLIC site assistant's HTTP surface (ADR-054) — the visitor-facing chat, distinct from
 * the admin assistant dock (ADR-049) which it shares only UI components with.
 *
 * Three properties this route exists to guarantee, all of them consequences of the caller being
 * anonymous internet traffic:
 *
 * 1. **The visitor never supplies a key, and never sees one.** This is why the route calls the
 *    provider adapter in-process instead of mounting `@jini-ai/http-kit`'s
 *    `registerModelProxyRoutes`. That route requires `apiKey` in the POST body (`model-proxy.ts`
 *    line ~194, required for all five providers) with no server-side injection hook on
 *    `ModelProxyHttpDeps` — correct for the admin's BYOK Execution mode, where the key is that
 *    admin's own, and a key-leak if pointed at the public. ADR-054's decision 1 originally said to
 *    mount it; that was written before checking how it sources credentials, and decision 3 ("the
 *    key is server-side, always") is the one that governs.
 * 2. **No process spawn.** `runProviderToolTurn` is an in-process HTTP relay. The
 *    agent-CLI path spawns an OS process per run, so N visitors is N processes —
 *    disabled for visitors, including legacy demo opt-ins (`assistant/site/mode.ts`).
 * 3. **No tool the allowlist did not name.** The executor below dispatches through
 *    `assistant/site/capability-registry.ts`'s `invoke()` (SPEC-046 REQ-0) — a typed registry over a
 *    fixed, literal capability list, not dynamic/config-driven registration, so an unknown tool name
 *    still refuses before anything runs, same as the closed switch this replaced. The registry is
 *    also where "who is asking" is checked: this route always passes `caller: "anonymous-visitor"`.
 * 4. **Off by default, and a 404 when off.** `assistant/public-assistant-settings.ts`'s
 *    `site.assistant.public_enabled` ledger value gates `handleChat` before anything else runs —
 *    that file's own header requires "no assistant endpoint" when disabled, not a hidden one, so a
 *    disabled workspace answers exactly as if this route were never registered.
 *
 * 5. **Rate-limited by IP** (SPEC-046 REQ-7). `deps.siteAssistantRateLimiter` (`SITE_ASSISTANT_PER_IP`
 *    — 10 requests / 5 minutes / IP, `core/rate-limit/rate-limit.ts`) is checked before any
 *    mode/config branch below, so a caller over budget gets a cheap 429 without touching the model
 *    provider. This closes what used to be an open item tracked against ADR-054: an anonymous
 *    endpoint in front of a paid API is a cost-attack surface without it.
 * 6. **Page actions never accept model-chosen paths.** The visitor resolver binds published IDs
 *    to public routes before Jini delegates to the isolated frontend session. The server publication
 *    and live DOM filter bound each control. Human confirmation travels as bounded, sanitized copy
 *    on the existing `client_directive` channel; machine calls never enter transcript events.
 *
 * 7. **The provider is the one the OPERATOR configured, and a mismatch is said out loud.** This
 *    route called `runGoogleToolTurn` unconditionally until 2026-09-16: its key resolution read
 *    `apiKey` off the resolved site credential and dropped that credential's
 *    `provider`/`baseUrl`/`model`, so a workspace that had saved an Anthropic or OpenAI key still
 *    posted to `generativelanguage.googleapis.com` with a Gemini model id. It now dispatches
 *    through `@jini-ai/agent-runtime/providers/tool-turn`'s `runProviderToolTurn` — the SAME provider-neutral
 *    adapter the admin's own BYOK execution path uses, deliberately reused rather than
 *    reimplemented, so exactly one place in this codebase knows how to turn
 *    `(protocol, key, baseUrl, model)` into a provider call.
 *
 *    The companion rule is that nothing here may silently substitute a provider. `GEMINI_API_KEY`
 *    — and, since 2026-09-16 (t91 F3.1), `TOVU_SITE_ASSISTANT_BASE_URL` and
 *    `TOVU_SITE_ASSISTANT_MODEL` too — are Google env fallbacks by name and by issuer, so all three
 *    are offered ONLY when the resolved provider is `google` (see {@link siteAssistantEnvFallbacks}).
 *    A workspace configured for Anthropic with no Anthropic key gets a 503 naming the provider and
 *    the missing key in the operator log, never a working-looking answer paid for by the wrong credential, and never an
 *    endpoint or model borrowed from a Google deployment's env configuration either. Same for an
 *    unsupported `provider` string, and for a non-Google provider with no model configured: refuse
 *    before the stream opens, and log which one it is. Public errors carry only safe text and an id.
 */

const CHAT_PATH = "/api/site-assistant/chat";
/** The site's route deps plus the two test seams the visitor assistant reads. */
type SiteAssistantModuleDeps = RouteDeps & { siteAssistantErrorLog?: (entry: SiteAssistantErrorLogEntry) => void; siteAssistantConfirmationScheduler?: SchedulerPort };

/** `siteAssistantConfirmationScheduler` owns the one timer a held visitor confirmation has: its
 *  expiry. The host passes none and gets real timeouts; a test passes its own to reach the expiry
 *  ending without waiting out the 60 s the visitor is given. */
export function createSiteAssistantModule(
  { deps, reporter }: { deps: SiteAssistantModuleDeps; reporter: ErrorReporter },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): ServerModuleHandle & { shutdown: () => void } {
  const context = createSiteAssistantContext(deps, env, reporter);
  const { resolution } = context;
  return {
    name: "site-assistant",

    start: () => {
      // Logged once at boot, not per request. A refusal is the operator asking for something they
      // did not get, and a gate that downgrades silently is one they will conclude is broken.
      if (resolution.refusedReason) {
        console.warn(`[site-assistant] ${resolution.refusedReason}`);
      }
      if (resolution.mode === "cli") {
        console.warn(
          "[site-assistant] DEMO MODE: cli execution is enabled. Every visitor message spawns an OS " +
            "process with filesystem access. Do not run this on a publicly reachable deployment.",
        );
      }
    },

    registerRoutes: ({ app }, _options = {}) => registerSiteAssistantRoutes(app, context),

    /** Process shutdown: every parked visitor approval is denied and its held call ended. */
    shutdown: () => context.approvalResume.shutdownVisitorApprovals(),
  };
}

function createSiteAssistantContext(deps: SiteAssistantModuleDeps, env: NodeJS.ProcessEnv, siteReporter: ErrorReporter) {
  // The site's one reporter as route error ports: the visitor frontend and confirm mounts are this site's routes.
  const routeErrors: RouteErrorPorts = { reporter: siteReporter, observability: NO_OPERATION_TRACKING };
  const confirmations = createVisitorConfirmations({ nowMs: deps.clock.nowMs.bind(deps.clock),
    exchanges: createSurfaceExchangeStore({ clock: deps.clock, scheduler: deps.siteAssistantConfirmationScheduler ?? createTimeoutScheduler({}),
      // This generator is cryptographic; the site's ordinary IDs can be time ordered.
      idGenerator: { newId: () => randomBytes(16).toString("base64url") }, defaultChannel: "visitor-tool-confirmation" },
    { idleTtlMs: VISITOR_CONFIRMATION_WAIT_MS, maxLifetimeMs: VISITOR_CONFIRMATION_WAIT_MS }) });
  const pageTargets = createVisitorPageTargets({ deps });
  const confirmLimiter = createRateLimiter({ clock: deps.clock, profile: { max: 60, windowSeconds: 60, burst: 0 } });
  const resolution = resolveSiteAssistantMode(env);
  // MOVE: Process-lifetime budgets survive individual chat requests; no timers or workers are started.
  const visitorToolBudgets = createVisitorToolBudgets({ clock: deps.clock, createCounterStore: () => createMemoryCounterStore({}) });
  const log = deps.siteAssistantErrorLog ?? ((entry: SiteAssistantErrorLogEntry) => console.error("[site-assistant]", entry));
  const reporter = createSiteAssistantErrorReporter({
    ids: deps.idGen, redact: redactSecrets,
    // Failures (not visitor-caused answers) also reach the error tracker, with the same redacted
    // diagnostic and the public error id; the visitor still gets only the fixed public message.
    log: (entry) => {
      log(entry);
      const incident = siteAssistantIncident({ entry });
      if (incident) deps.tracker.error({ error: incident }, { context: { operation: "site_assistant.chat", attributes: { code: entry.code, errorId: entry.errorId } } });
    },
  });

  const frontend = createVisitorFrontendControl({ workspaceId: deps.workspaceId, clock: deps.clock, ports: { mountRoutes: mountJiniRoutes,
    // The visitor frontend routes are this site's: their incidents go to the site's one reporter.
    routeHost: (required) => daemonRouteHost({ ...required, errors: routeErrors }), parserLimitBytes: PUBLIC_JSON_BODY_LIMIT_BYTES, setTimer: nodeSessionTimer, hookInput: requestHookInput },
    enabled: async () => env.TOVU_VISITOR_TOOLS_POLICY !== 'off' && await isPublicAssistantEnabled(
      { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }),
    canonicalOrigin: () => deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId }), reportError: ({ error }) => { reporter({ code: "visitor_frontend_control", diagnostic: error }); },
  });
  const turnDedupe = createVisitorTurnDedupe({ clock: deps.clock });
  // Process-local AG-UI approval handoff; the same scheduler port as the exchange expiry.
  const approvalResume = createVisitorAgUiResume<VisitorSegment>({ nowMs: () => deps.clock.nowMs(),
    scheduler: deps.siteAssistantConfirmationScheduler ?? createTimeoutScheduler({}), confirm: (required) => confirmations.confirm(required),
    reportError: ({ error }) => { reporter({ code: "visitor_tools_confirm", diagnostic: error }); } });
  return { approvalResume, deps, env, confirmations, pageTargets, confirmLimiter, resolution, visitorToolBudgets, reporter, routeErrors, frontend, turnDedupe };
}

export type SiteAssistantTurnContext = Pick<ReturnType<typeof createSiteAssistantContext>,
  "deps" | "env" | "confirmations" | "pageTargets" | "visitorToolBudgets" | "frontend" | "approvalResume">;

function registerSiteAssistantRoutes(app: Express, context: ReturnType<typeof createSiteAssistantContext>): void {
      const { deps, env, confirmations, confirmLimiter, reporter, routeErrors, frontend } = context;
      frontend.mount({ app });
      const enabled = async () => env.TOVU_VISITOR_TOOLS_POLICY !== "off" && await isPublicAssistantEnabled(
        { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId });
      const allowsOrigin = async ({ origin }: { origin: string }) => {
        const target = normalizeOriginCandidate({ rawUrl: origin });
        if (!target) return false;
        const canonical = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
        return isSameOrigin({ target, canonical });
      };
      const resumePorts = { enabled, allowsOrigin, limiter: confirmLimiter, resolveApprovalOwner: frontend.resolveApprovalOwner, resume: context.approvalResume,
        openSegment: ({ req, res, threadId, runId }: { req: Request; res: Response; threadId: string; runId: string }): VisitorSegment => {
          beginStream(req, res);
          const writer = createVisitorAgUiSegmentWriter({ res, deps, wireIds: { threadId, runId } });
          writer.start();
          return { res, writer, runId };
        } };
      registerSiteAssistantConfirm({ app, errors: routeErrors, ports: {
        confirmations, limiter: confirmLimiter, resolveOwner: frontend.resolveOwner, enabled, allowsOrigin,
        reportError: ({ error }) => { reporter({ code: "visitor_tools_confirm", diagnostic: error }); },
      } });
      // The app's public JSON parser runs before this module. Handle its errors here, before the
      // generic size/error middleware, so oversized/malformed visitor requests also get safe ids.
      const handleBodyError: ErrorRequestHandler = (error, _req, res, next) => {
        if (res.headersSent) { next(error); return; }
        const type = (error as { type?: unknown } | null)?.type;
        const oversized = type === "entity.too.large";
        const invalid = type === "entity.parse.failed";
        const fallbackStatus = invalid ? 400 : 500;
        const fallbackCode = invalid ? "VALIDATION" : "unavailable";
        respondPublicError({
          res, status: oversized ? 413 : fallbackStatus, reportError: reporter,
          code: oversized ? "PAYLOAD_TOO_LARGE" : fallbackCode, diagnostic: error,
        });
      };
      app.use(CHAT_PATH, handleBodyError);
      app.post(CHAT_PATH, (req: Request, res: Response) => handleSiteAssistantRequest({ req, res, context, resumePorts }));
    }

function handleSiteAssistantRequest({ req, res, context, resumePorts }: {
  req: Request; res: Response; context: ReturnType<typeof createSiteAssistantContext>;
  resumePorts: Parameters<typeof handleVisitorAgUiResume>[0]["ports"];
}, _optional = {}): void {
  const { env, reporter } = context;
        const secrets: string[] = env.GEMINI_API_KEY ? [env.GEMINI_API_KEY] : [];
        const reportError: SiteAssistantErrorReporter = required => reporter(required, { exactSecrets: secrets });
        // Only the explicit AG-UI media range switches wires; the response then varies by Accept,
        // refusals included. Legacy responses keep their pinned headers.
        const stream: VisitorTurnStream = { wire: selectVisitorChatWire({ accept: req.get("accept") }) };
        if (stream.wire === "ag-ui") res.vary("Accept");
        // An answer to a parked approval, not a new turn: recognized before any provider start.
        if (stream.wire === "ag-ui" && isVisitorAgUiResume({ body: req.body })) {
          void handleVisitorAgUiResume({ req, res, ports: resumePorts }).catch((error: unknown) => {
            reporter({ code: "visitor_tools_confirm", diagnostic: error });
            if (!res.headersSent) res.status(400).json({ error: VISITOR_APPROVAL_EXPIRED }); else res.end();
          });
          return;
        }
        void handleChat(req, res, { ...context, reportError, secrets, stream }).catch((error: unknown) => {
          // The stream may already be open, in which case status codes are no longer available —
          // report on the stream if we can, and never leave a visitor's connection hanging.
          const publicError = reportError({ code: "unavailable", diagnostic: error });
          if (res.headersSent) {
            // The writer's terminal latch makes this a no-op on AG-UI when the turn already ended.
            (stream.writer ?? createVisitorLegacyWriter({ res })).finish({ outcome: { kind: "error", ...publicError } });
            res.end();
          } else {
            const { message, ...metadata } = publicError;
            res.status(500).json({ error: message, ...metadata });
          }
        });
}

async function handleChat(req: Request, res: Response, context: ReturnType<typeof createSiteAssistantContext> & { reportError: SiteAssistantErrorReporter; secrets: string[]; stream: VisitorTurnStream }): Promise<void> {
        const { deps, env, resolution, frontend, reportError, secrets } = context;
        const preflight = await runSiteAssistantPreflight(req, res, deps, env, resolution, reportError, context.stream.wire);
        if (!preflight.ok) return;
        const { message, priorTurns, provider, turnId, wireIds } = preflight;
        // Owner decision 2026-11-23: a widget retry carries the SAME turnId, and the server must not
        // bill a second provider run for it. Admitted here (after the cheap gates, before any spend);
        // a failure before `providerStarted()` releases the turn so the retry still works.
        const turn = context.turnDedupe.admit({ scope: `${deps.workspaceId}|${resolveClientIp(req)}`, turnId });
        if (!turn.admitted) {
          respondPublicError({ res, status: 409, reportError, code: VISITOR_TURN_DUPLICATE_CODE, diagnostic: `visitor turn already ${turn.state}` });
          return;
        }
        context.stream.writer = createVisitorTurnWriter({ res, deps, stream: context.stream, wireIds });
        context.stream.wireIds = wireIds;
        try { await handleAdmittedChat({ req, res, context, preflight: { message, priorTurns, provider }, turn }); }
        finally { turn.finish({ delivered: res.writableEnded }); }
      }
