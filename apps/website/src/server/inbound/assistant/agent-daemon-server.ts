/**
 * @file The standalone agent daemon — a separate OS process from Tovu's own server, per the
 * architecture correction to ADR-049: Tovu does not spawn coding-agent CLIs itself.
 *
 * Owns the FULL `@jini-ai/*` kernel for a run's whole lifetime — `RunLifecycle` + `EventLog` +
 * `AgentExecutor` + `ToolRegistry` + `ToolExecutor` + `/api/runs` + `/api/agents` +
 * `/api/delegated-tool-calls`. Tool execution could not be split off into Tovu's own process the
 * way the first draft of this file assumed: `@jini-ai/daemon`'s `DelegatedToolBridge` calls
 * `lifecycle.emit()` directly to record `tool_use`/`tool_result` into the run's own event log —
 * the same log the browser's SSE subscription (proxied through Tovu, see
 * `src/server/modules/assistant.ts`) is watching. Executing a tool in a different process from
 * the run's real `RunLifecycle` would write those events into a log nobody is watching, and the
 * chat would never show the agent's tool calls at all.
 *
 * Tool handlers still need Tovu's real database to do anything real (create a content type,
 * etc.), so this process opens its own connection to the SAME SQLite file Tovu's main process
 * uses (`createSqliteRouteDeps`) — safe under SQLite's WAL mode, which supports multiple
 * process-level connections to one file. `src/index.ts` spawns this process only after its own
 * boot/migrations finish, so the two don't race on first-boot schema setup.
 *
 * Caveat, disclosed rather than silently broken: `TOVU_DB=memory` gives this process its OWN,
 * disconnected in-memory store — an in-memory store is inherently per-process. A tool call would
 * still execute and return a result, but writes would not be visible from Tovu's main process (or
 * vice versa). Full end-to-end testing of tool execution needs the real SQLite-backed store.
 *
 * Principal propagation: this process has no browser session/cookie of its own. Tovu's proxy
 * layer stamps the authenticated principal's id into `contextRef` (`{prompt, principalId}`,
 * Tovu's own wire format) before forwarding a run-start request here; `onStarted` decodes it and
 * records `runId -> principal` locally so `resolveDelegatedPrincipal` (called later, out of band,
 * by this run's own spawned `jini-mcp` subprocess) can answer without needing Tovu at all.
 *
 * Authorization: the bearer gate below establishes that a caller is Tovu's proxy, not which admin
 * the proxy speaks for — so on its own it lets any logged-in admin read, stream, or cancel any
 * other admin's run by id. `run-ownership.ts` closes that: the proxy asserts its verified principal
 * in a header on every forwarded request, and this process compares it against the run's recorded
 * owner. Enforcement is here rather than in the proxy because this is the process that owns run
 * state, so the ownership record and the run it protects live and die together.
 *
 * Authentication: every route mounted here is gated by `daemon-auth.ts`'s
 * `requireAgentDaemonToken()`, applied globally as the FIRST `app.use` — before `express.json()`,
 * so an unauthenticated caller's body is never even parsed. It requires an exact
 * `Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN>` match, has no loopback exemption (binding to
 * `127.0.0.1` keeps remote hosts out but does nothing about other local processes, which is the
 * actual threat for a daemon that can start real agent runs and write to `content.db`), and fails
 * closed with 503 when the token env var is unset. The token is minted once per boot by
 * `src/index.ts`'s `main()` and inherited by this process through every `child_process.spawn`
 * `daemon-supervisor.ts` makes (the first one and every automatic respawn alike, since all of them
 * spread `process.env`); `src/server/modules/assistant.ts`'s proxy is the only caller that holds
 * it. Deliberately NOT `@jini-ai/http-kit`'s `registerApiBearerAuthMiddleware` — see
 * `daemon-auth.ts`'s header for why its loopback short-circuit makes it a no-op here.
 *
 * One route is exempt by necessity, not by preference: `/api/delegated-tool-calls`, which is
 * called by this run's own `jini-mcp` MCP subprocess rather than by Tovu's proxy. That subprocess
 * receives only `JINI_RUN_ID`/`JINI_DAEMON_URL` from `@jini-ai/daemon` and sends no
 * `Authorization` header, so a bearer requirement there would simply break tool execution. It
 * remains gated by `resolvePrincipal`'s fail-closed check that the posted `runId` is a live,
 * `randomUUID()`-derived id this process is currently tracking. See `DELEGATED_TOOL_CALLS_PATH`.
 */
import { isDaemonLifecycleLogQuiet } from "#src/server/runtime/lifecycle/daemon-lifecycle-log";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import express from "express";

import { createToolRegistry } from "@jini-ai/core";
import type { Principal } from "@jini-ai/core";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
// From `@jini-ai/agent-runtime`, which owns the seam — not `@jini-ai/daemon`, which only accepts
// one as an option. The ambient shim this repo used to carry declared it on `daemon`, and being a
// shim it made that wrong claim typecheck cleanly.
import type { PromptAugmenter } from "@jini-ai/agent-runtime";
import {
  createDiskAttachmentStore,
  createFrontendControl,
  registerAgentRoutes,
  registerAttachmentRoutes,
  registerComponentCatalogRoutes,
  registerDelegatedToolRoutes,
  registerRunRoutes,
  registerToolCatalogRoutes,
} from "@jini-ai/http-kit";
import type { AdapterContext, AttachmentStore, DelegatedToolExecuteRequest, RunStartHandler, StoredAttachment } from "@jini-ai/http-kit";

/** The `run`/`lifecycle` shape `RunStartHandler` receives — derived rather than imported directly
 *  from `@jini-ai/daemon`/`@jini-ai/protocol` so this file adds no new package-import edge just to
 *  name a type its one existing `RunStartHandler` import already carries structurally. */
type OnStartedContext = Parameters<RunStartHandler>[0];

import { registerInstalledExtensionTools } from "#src/assistant/installed-extension-tools";
import { registerSupabaseMcpPreset } from "#src/features/plugins/supabase-mcp/supabase-mcp-plugin";
import { assemblePromptWithPluginPrefix, resolveAgentPluginPromptPrefix } from "./plugin-prompt-prefix.js";
import { buildCapabilityManifestPrefix, resolveCapabilityManifestArm } from "./capability-manifest-prefix.js";
import {
  agentCarriesOwnMemory,
  extractSessionRefFromEndEvent,
  resolveResumeSessionField,
  shouldClearSessionOnFailedResume,
  wouldForcedColdStartLoseConversationContext,
} from "./agent-session-resume.js";
import { createLiveRunTracker } from "./agent-run-concurrency.js";
import {
  agentAcceptsHostMintedSessionId,
  resolveHostMintedSessionId,
  resolveNewSessionField,
} from "./agent-session-binding.js";
import { createConversationStartLock } from "./conversation-start-lock.js";
import {
  ASSISTANT_DISALLOWED_TOOLS,
  buildBaseSystemOverlay,
  resolveBashProhibitionEnabled,
} from "./assistant-system-overlay.js";
import { registerFederationAdmissionsRoute } from "./federation-admissions-route.js";
import { registerFederationReloadRoute } from "./federation-reload-route.js";
import { createAgentDaemonRouteDeps, startPluginActivationPolling } from "../../runtime/composition/agent-daemon-deps.js";
import { resolveChatAttachmentUploadDirectory } from "./chat-attachment-directory.js";
import { installUnhandledRejectionGuard } from "../../runtime/boot/process-error-guards.js";
import { installFirstPartyToolContributors } from "../../runtime/composition/tool-catalog-manifest.js";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { createPendingAuthorizationStore } from "#src/platform/oauth/index";
import {
  listAssistantAgents,
  rescanAssistantAgents,
  createCustomInstructionsCache,
  DELEGATED_TOOL_CALLS_PATH,
  requireAgentDaemonToken,
  AGENT_DAEMON_EXIT_CODE,
  FRONTEND_CONTROL_CAPABILITIES,
  attachFederatedMcpTools,
  buildFederatedRefusalPrefix,
  withFederatedRefusalDiagnosis,
  createFederationReloadCoordinator,
  type FederationReloadResult,
  type FederationDeps,
  createLiveToolCatalogQuery,
  type ResolvedFederatedConnection,
  createDeviceAuthorizationStore,
  createExternalMcpConnectionGate,
  createExternalMcpOAuthService,
  readEnabledExternalMcpConfigs,
  toResolvedFederatedConnections,
  registerA2uiActionsRoute,
  registerMcpUiToolCallsRoute,
  resolveMcpJsonInjection,
  createOwnedRunListHandler,
  createRunOwnerRegistry,
  requireRunOwnership,
  RUN_PRINCIPAL_HEADER,
  parseRunStartContextRef,
  buildPageContextPromptBlock,
  buildComponentCatalogQuery,
  buildToolCatalogQuery,
  listToolCatalogEntries,
  constrainPrincipalToReadOnlyTools,
  createAssistantToolExecutor,
  withToolCatalogAudit,
  UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID,
  UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID,
  buildAssistantToolRegistrations,
} from "#src/assistant/agent-daemon-port";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { buildPromoteChatAttachmentTool, MEDIA_PROMOTE_CHAT_ATTACHMENT_TOOL_ID } from "#src/features/media/promote-chat-attachment";
import { buildListPendingChatAttachmentsTool } from "#src/features/media/list-pending-chat-attachments";
import { TOVU_MAX_UPLOAD_BYTES } from "#src/features/media/index";
import { withPageNavigateErrorRewrap } from "#src/assistant/rewrap-page-navigate-error";

const port = Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319);
const daemonUrl = `http://127.0.0.1:${port}`;
const DEFAULT_AGENT_ID = "claude";

/**
 * Self-termination watchdog, 2026-08-05 (`ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`).
 *
 * `daemon-supervisor.ts`'s `spawnRealDaemonProcessFor` puts this process in its own detached
 * process group specifically so it CAN be reaped independently (see that function's own comment) —
 * but that only works if the supervisor gets a chance to run its own shutdown-time kill. Confirmed
 * live, twice, two different ways: Playwright's default `webServer` teardown skips straight to an uncatchable
 * `SIGKILL` unless opted out of (fixed at that source, `development/playwright.admin.config.ts`'s
 * `gracefulShutdown`), and — separately, still unfixed at its own source — an external `SIGTERM`
 * sent straight to Playwright's own top-level CLI process never invokes `teardown()` at all,
 * bypassing `gracefulShutdown` too. Direct repro of the second case: the daemon was still fully
 * alive and bound to its port, completely unchanged, 30+ seconds after that kill, with zero
 * self-cleanup. Any such case — including a plain `kill -9` of `src/index.ts`, or a CI/agent
 * timeout wrapper killing it outside its own signal handlers — leaves this process orphaned with
 * nothing left to reap it. This watchdog is the last line of defense: detect that independently,
 * from inside this process, rather than depending on anything outside it to notice.
 *
 * Why the OS's own `process.ppid` cannot be that signal: `daemon-supervisor.ts`'s dev-mode spawn is
 * a 3-hop `npx -> tsx -> node` chain, and confirmed live via `ps` that none of those three
 * exec-replaces itself — all three stay alive for the whole run. This process's actual `ppid`
 * therefore resolves to the middle `tsx` hop, not to `src/index.ts`'s own process, so watching
 * `ppid` would watch the wrong ancestor. `daemon-supervisor.ts` instead passes the true one
 * explicitly via `TOVU_PARENT_PID`.
 *
 * Opt-in by construction, not by a feature flag: `TOVU_PARENT_PID` is set by exactly one caller
 * (`daemon-supervisor.ts` — confirmed the only spawner of this file). A manual/standalone boot of
 * this file (local debugging, or any test that spawns it directly without that env var) gets no
 * watchdog at all, unchanged from before this existed — there is no ambient "parent" to watch in
 * that case, and none is invented.
 *
 * Does not fight the legitimate long-lived case it might look like it conflicts with: `npm run
 * dev`'s `tsx watch src/index.ts` intentionally kills and restarts the API process on every source
 * change, and a fresh daemon is spawned fresh for the fresh process each time. On a NORMAL
 * restart, the OLD `index.ts` process receives a real, catchable signal, and ITS `reap()` already
 * kills this process directly — this watchdog is redundant on that path, not in conflict with it;
 * a process already mid-exit tolerates an overlapping second kill/self-exit with no ill effect.
 * This function only ever does something on the path `reap()` cannot reach: when it never runs.
 */
function startParentWatchdog(): void {
  const raw = process.env.TOVU_PARENT_PID;
  if (raw === undefined) return;
  const parentPid = Number(raw);
  if (!Number.isInteger(parentPid) || parentPid <= 0) {
    console.error(`[agent-daemon] TOVU_PARENT_PID="${raw}" is not a valid pid — parent watchdog disabled`);
    return;
  }

  // 3s: fast enough that a leaked port closes long before it could collide with a LATER boot
  // attempt (the EADDRINUSE/degraded-boot failure mode this exists to prevent — see this file's
  // module doc), slow enough that a background liveness poll costs nothing meaningful against a
  // process that spends most of its time idle between real requests. Not `.unref()`'d: unlike
  // `development/scripts/dev.mjs`'s own shutdown timer (which legitimately wants to stop blocking
  // an exit already in progress), this interval's entire job is to keep this process alive and
  // watching for as long as its parent is — letting it fall out of the event loop on its own would
  // undermine the one thing it exists to do.
  const POLL_INTERVAL_MS = 3_000;
  setInterval(() => {
    try {
      // Signal `0` sends nothing; it is the standard Node/POSIX idiom for "does this pid still
      // exist", with no side effect on the target process either way.
      process.kill(parentPid, 0);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ESRCH") {
        // Anything other than "no such process" (e.g. a transient EPERM) is inconclusive, not a
        // confirmed death — skip this poll rather than risk a false-positive self-kill on a parent
        // that is actually still alive.
        return;
      }
      console.error(
        `[agent-daemon] parent process ${parentPid} is gone and reap() never reached this process — self-terminating`,
      );
      process.exit(1);
    }
  }, POLL_INTERVAL_MS);
}
// Armed as early as possible — before any of the slower boot work below (SQLite open, MCP
// federation, `createDiskAttachmentStore`) — so a parent death during THIS process's own boot is
// caught too, not only once it has reached steady state.
startParentWatchdog();

// Fixes a live-found crash (2026-08-16, source-control/commit-site.ts's own header has the full
// account): an unhandled async rejection anywhere beneath a route/tool handler in THIS process used
// to take the whole daemon down, not just the one call that triggered it — same Express-4-catches-
// nothing shape `process-error-guards.ts`'s own header documents for `index.ts`'s main process,
// just reached here via a tool handler instead of an HTTP route. Placed immediately after the
// watchdog above, before any real I/O (opening this process's own SQLite connection, federating MCP
// tools) — same "as early as possible" rationale, and the same placement `index.ts`'s `main()` uses
// for its own call to this function.
//
// This process needs its OWN guard, not merely inherited coverage from `index.ts`'s: it is a
// SEPARATE OS process (`daemon-supervisor.ts`'s `child_process.spawn`). CORRECTED 2026-08-16: this
// used to say a crash here has no restart path at all — that stopped being true the day
// `daemon-supervisor.ts` shipped automatic respawn with backoff, so leaving the old claim would
// have been exactly the kind of stale, provably-false comment this codebase has already been
// burned by once (see `verifyPublishCredentialById`'s "never throws" incident). What's still true,
// and is the actual reason this guard remains load-bearing: a crash here is never free. Every
// unhandled rejection still means a real gap in assistant availability while the supervisor's
// backoff runs (escalating up to 30s between attempts), and a REPEATED crash from the same
// unguarded code path will burn through the supervisor's crash-loop cap and give up retrying
// altogether — at which point the assistant stays down for every workspace until an operator uses
// the manual restart seam (`restartAssistantDaemon`) or notices and restarts Tovu by hand. Closing
// today's one known unguarded path (`commit-site.ts`'s `resolveDefaultForSourceControl` call) fixes
// today's incident; this guard is the same "fleet-wide" backstop `process-error-guards.ts`'s header
// argues for on the main process, applied here for the identical reason — this codebase has no lint
// rule or type check that would catch the NEXT unguarded decrypt/async call in some future
// tool-registration handler.
installUnhandledRejectionGuard();

/**
 * Root directory the chat composer's staged image/file uploads land in before a run claims them
 * (`@jini-ai/http-kit`'s `createDiskAttachmentStore`) — deliberately NOT `process.cwd()`.
 *
 * The resolution itself moved to `chat-attachment-directory.ts` (see that file for the full
 * anchoring rationale and its disclosed residual risk) and is UNCHANGED by the move — same
 * `TOVU_CHAT_ATTACHMENTS_DIR` override, same `dirname(defaultContentDbPath())` fallback. It is a
 * shared function rather than this file's private constant for one reason: the API process now
 * reads these same uploads back over HTTP (`modules/assistant.ts`'s
 * `registerAdminChatAttachmentReadRoute`), and two copies of a path expression in two processes is
 * exactly the "one call site drifts" defect this repo keeps finding.
 */
const ATTACHMENT_UPLOAD_DIRECTORY = resolveChatAttachmentUploadDirectory();

/**
 * Total bytes one composer turn's staged attachments may sum to (`createDiskAttachmentStore`'s
 * `maxBatchBytes`, `@jini-ai/http-kit`'s own default is 20 MB). Kept at twice
 * {@link TOVU_MAX_UPLOAD_BYTES} (below) — the daemon's own per-file cap — rather than left equal to
 * it, so a turn with one file at the cap still has room for a second small one; that default's own
 * doc says the per-file cap "should be at or below" this value, and an exact match would leave zero
 * headroom for any additional attachment in the same turn. Owner-directed (2026-09-21): the
 * per-file cap rose to 50 MiB alongside the media upload cap it mirrors, so this rose to 100 MiB to
 * keep that headroom.
 */
const ATTACHMENT_MAX_BATCH_BYTES = TOVU_MAX_UPLOAD_BYTES * 2;

/**
 * Opt-in-only diagnostic gate for the base system overlay's Bash-prohibition instrument — see
 * `assistant-system-overlay.ts`'s `resolveBashProhibitionEnabled` for the full rationale (why this
 * exists, why it defaults OFF, and why it is not a security control). Read once here, at module
 * scope like `ATTACHMENT_UPLOAD_DIRECTORY` above, rather than per-call inside `systemOverlay()`:
 * this is a boot-time operator choice, not a per-run condition.
 */
const bashProhibitionEnabled = resolveBashProhibitionEnabled();

/**
 * A spawned agent CLI has no TTY to answer an interactive permission prompt, so "restricted"
 * here means every permission-gated action (including MCP tool use) silently stalls rather than
 * executing — confirmed live (2026-07-30) that `identity_user_create` and every other agent-tool
 * call hangs on an unanswerable "requested permission... but you haven't granted it yet" prompt
 * without an explicit bypass.
 *
 * `TOVU_AGENT_PERMISSION_MODE` still wins when set explicitly, either direction. With no
 * override, this follows `resolveRuntimeMode()`'s own safe-default philosophy (SPEC-022 INV-04:
 * anything not explicitly `TOVU_RUNTIME_MODE=production` resolves to the permissive/local case) —
 * bypass unless running in production. A fresh clone with no env vars at all (`git clone && npm
 * install && npm run dev`) gets a working assistant with no setup step to discover, regardless of
 * which script or command actually launches this process; a real production deployment stays
 * restricted-by-default unless an operator explicitly opts into bypass.
 */
function resolvePermissionMode(): "bypass" | "restricted" {
  if (process.env.TOVU_AGENT_PERMISSION_MODE === "bypass") return "bypass";
  if (process.env.TOVU_AGENT_PERMISSION_MODE === "restricted") return "restricted";
  return resolveRuntimeMode() === "production" ? "restricted" : "bypass";
}

// Mirrors `src/index.ts`'s own `useMemory` branch exactly — see this file's module doc on why
// memory mode gives this process a disconnected store rather than sharing Tovu's.
//
// D10 fix: `TOVU_WORKSPACE`, when present, is the main process's own already-resolved
// `deps.workspaceId` (`daemon-supervisor.ts`'s `spawnRealDaemonProcessFor` sets it from the SAME
// value `index.ts` passed to `startAssistantDaemon`, on every spawn including every automatic
// respawn) — binding this process to that exact workspace instead of letting it
// independently re-resolve `resolveWorkspace`'s default. Irrelevant in memory mode: each process
// gets its own disconnected in-memory store regardless (see module doc above), so there is no
// second process to agree with.
//
// Outbox (2026-09-14): that branch now lives in `agent-daemon-deps.ts`, which also makes this
// process's outbox enqueue-only. This process shares `content.db` with the serving process but not
// its bus or subscribers, so a drain here (the post tools drain after every write) marked rows
// delivered that the serving process never saw. The serving process's background drainer
// (`serving-app.ts`) delivers them instead.
const routeDeps = createAgentDaemonRouteDeps({ env: process.env });
// P0b fix (hooks v2 plan, 2026-09-23): this process's hook registry is built once, here, from a
// snapshot of the activation table — an enable/disable through the admin process afterwards never
// reaches it on its own. See `agent-daemon-deps.ts`'s own header for why polling, not an outbox
// event, is this lane's chosen mechanism.
startPluginActivationPolling(routeDeps);

const eventLog = createInMemoryEventLog();
const lifecycle = createRunLifecycle({ eventLog });
lifecycle.rehydrate().catch((error: unknown) => {
  console.error("[agent-daemon] lifecycle.rehydrate() failed", error);
});

// `createRouteDeps()`/`createSqliteRouteDeps()` do not construct `magicLinkPerEmailLimiter` — it is
// built per-boot inside `server/app.ts`'s `registerAdminRoutes` and spread into a local
// `membersDeps`, never onto the object those factories return (ADR-PIPE-013 §2-3, C-015: one
// counter per email). This process is a separate boot that never runs that code, so it must build
// its own, exactly as `server/app.ts:566` does.
//
// Until the tool-registration deps types were narrowed, `buildMembersRegistrations` cast its way
// past this with `routeDeps as MembersRouteDeps`, so the field was simply `undefined` here and
// `members_request_magic_link` would have thrown `Cannot read properties of undefined (reading
// 'check')` the first time it was invoked through the daemon. The cast was hiding a real crash;
// removing it surfaced this, and this is the fix rather than a re-widening.
const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });

/**
 * The parked-call store backing the single-call MCP-UI return path (ADR-055 Decision 1).
 *
 * Created here, at the composition root, because exactly two things must share ONE instance and they
 * are wired ~300 lines apart: the tool registrations below (whose handlers park) and
 * `registerMcpUiToolCallsRoute` (which delivers the human's answer into a park). Two instances would
 * not fail loudly — every delivery would 409 while the agent sat blocked until its TTL expired.
 */
const surfaceExchanges = createSurfaceExchangeStore();

// Must run before `buildAssistantToolRegistrations` below: that function reads whatever the
// registry currently holds, and the registry starts empty every process boot (it is ordinary
// module-level state in `assistant/tool-contribution-registry.ts`, not populated as a side effect
// of any import). See `tool-catalog-manifest.ts`'s own header for why this call lives here and in
// `assistant-byok.ts`, and nowhere else.
installFirstPartyToolContributors();

const registry = createToolRegistry();
// Captured (not looped-and-discarded) so `media_promote_chat_attachment` below can find and delegate
// to the already-built `media_upload_asset` registration — see `promote-chat-attachment.ts`'s own
// header for why reusing that handler, rather than re-implementing its gate, is the whole design.
const assistantRegistrations = buildAssistantToolRegistrations(
  // `listCatalogTools` is `site_describe_capabilities`' reader over THIS registry, the one the
  // `search_tools`/`describe_tool` routes below snapshot. A thunk, read when the tool runs, so it
  // also lists the agent-plugin, skill and federated tools `start()` registers after this line.
  { ...routeDeps, magicLinkPerEmailLimiter, listCatalogTools: () => listToolCatalogEntries(registry) },
  { surfaceExchanges },
);
for (const registration of assistantRegistrations) {
  registry.register(registration);
}

/**
 * `media_promote_chat_attachment` — the chat-attachment -> media-library bridge (see
 * `promote-chat-attachment.ts`'s own header for the full design/authorization rationale). Registered
 * directly here, alongside `frontendControl.toolRegistrations` below, rather than through the generic
 * per-workspace tool-contribution registry: both are daemon-only capabilities with no meaning in a
 * process that does not also run this file's `attachmentStore`/frontend-binding state.
 *
 * Silently skipped (not thrown) when `media_upload_asset` is somehow unwired: this bridge is strictly
 * additive to that tool and must never be the reason the whole daemon fails to boot.
 */
const mediaUploadAssetRegistration = assistantRegistrations.find(
  (registration) => registration.descriptor.id === "media_upload_asset",
);
if (mediaUploadAssetRegistration) {
  registry.register(
    buildPromoteChatAttachmentTool({
      // A thunk, not `attachmentStore` itself: this line runs before `start()` assigns it (see that
      // binding's own doc) — the closure must read the CURRENT value at call time, not now.
      getStore: () => attachmentStore,
      mediaUploadHandler: mediaUploadAssetRegistration.handler,
      readFile,
    }),
  );
} else {
  console.error(
    `[agent-daemon] '${MEDIA_PROMOTE_CHAT_ATTACHMENT_TOOL_ID}' not registered: 'media_upload_asset' is not wired`,
  );
}

/**
 * `chat_list_pending_attachments` — the discovery half of the chat-attachment bridge (see
 * `list-pending-chat-attachments.ts`'s own header for the full design/scoping rationale). Registered
 * unconditionally (unlike the promote tool above, it delegates to no other registration) alongside
 * it, for the same "daemon-only capability with no meaning elsewhere" reasoning.
 */
registry.register(
  buildListPendingChatAttachmentsTool({
    // A thunk, not `attachmentStore` itself — same reasoning as `buildPromoteChatAttachmentTool`'s
    // own `getStore` just above: this line runs before `start()` assigns it.
    getStore: () => attachmentStore,
  }),
);

/**
 * Agent-driven control of the admin's own browser tab and chat pane — `page.navigate`,
 * `page.scroll_to`, `page.find_elements`, `chat.send_message`, `admin.capture_screenshot`, and the
 * rest of {@link FRONTEND_CONTROL_CAPABILITIES} (`page.*` plus all seven of `chat.*`'s verbs — as
 * of 2026-09-24 `chat.reset_conversation` is included too, via a Tovu-owned clone; see that
 * module's own doc for why — plus Tovu's own `admin.*` additions).
 *
 * `createFrontendControl` assembles the three parts (session registry, gated tool registrations,
 * the stream/response routes) and deliberately never hands back the registry — its `invoke`
 * executes a capability on a real admin's real screen with no policy check, no timeout and no
 * audit record, and is safe only because the one thing that can reach it is a `ToolHandler`
 * `ToolExecutor` has already gated.
 *
 * `FRONTEND_CONTROL_CAPABILITIES` is imported rather than restated so the manifest the daemon
 * gates and the manifest `apps/admin` executes are the same array — the two cannot drift into a
 * state where an agent is offered a verb the page/chat pane does not implement, or vice versa.
 */
const frontendControl = createFrontendControl({
  capabilities: FRONTEND_CONTROL_CAPABILITIES,
  /**
   * Which tab this run may drive. Tovu's own `contextRef` envelope carries it, put there by the
   * admin's `FrontendSessionBridge` (`apps/admin/src/lib/assistant-transport.ts`) and passed
   * through untouched by the proxy.
   *
   * `undefined` is normal, not an error — a run with no originating surface (a future CLI or
   * scheduled trigger) is still legitimate; it simply has no screen, and each `page.*` call it
   * makes is refused by name rather than hanging. A malformed envelope is treated the same way:
   * `onStarted` below already reports and fails the run for that, so throwing here as well would
   * turn one diagnosable error into two.
   */
  resolveBindToken: (request) => {
    try {
      const parsed = JSON.parse(request.contextRef) as { frontendBindToken?: unknown };
      return typeof parsed.frontendBindToken === "string" && parsed.frontendBindToken.length > 0
        ? parsed.frontendBindToken
        : undefined;
    } catch {
      return undefined;
    }
  },
  // Pass-through `allow`, matching ADR-021 §2 and every other Tovu registration (see
  // `tool-registration-kit.ts`). It is not a missing check: these verbs carry no Tovu permission
  // of their own, and the authorization that matters already happened twice before a call gets
  // here — Tovu's proxy required an admin session to start the run at all, and the daemon will
  // only route the invocation to the one surface bound to THAT run. An agent therefore cannot
  // reach a tab other than the one whose own admin started it.
  policy: { authorize: () => "allow" },
  // Page text is untrusted input to whatever model reads the result back. `page.find_elements`
  // returns labels and values written by the page itself, so bound what one call can return.
  maxOutputBytes: 64 * 1024,
  onBindError: ({ runId, error }) => {
    console.error(`[agent-daemon] run ${runId}: could not bind to a frontend surface`, error);
  },
});
// `withPageNavigateErrorRewrap` (Tovu-side, `assistant/rewrap-page-navigate-error.ts`) rewraps ONLY
// `page.navigate`'s registration so its "not a published page" refusal (`@jini-ai/agentic`'s
// `page-executor.ts:414`) cannot be misread as this codebase's own, unrelated
// `PostRecord.status === "published"` CMS-content concept — see that module's own header for the
// full rationale. Every other registration passes through unchanged.
for (const registration of withPageNavigateErrorRewrap(frontendControl.toolRegistrations)) {
  registry.register(registration);
}
// Wrapped, not bare: `@jini-ai/daemon`'s executor keeps its audit records in an in-process `Map`
// and mints them only AFTER authorization resolves, so an unknown tool id or a throwing
// authorization leaves no trace at all, and everything else is lost on restart. The decorator
// appends a `requested` row before delegating, which is the only ordering under which those cases
// are recorded. Audit is observation — a sink failure can never change a tool call's outcome.
// See `tool-executor-audit.ts`.
// Read off `routeDeps` rather than hand-built here (2026-09-06). This process IS a composition
// root, so constructing a sink here was legitimate — but `routeDeps` above is already the product
// of one of the two real roots, chosen on the SAME `TOVU_DB === "memory"` branch this const used to
// repeat, so the field it now carries (`RouteDeps.toolAttemptAuditSink`) is that same choice made
// once instead of twice. Same rows, same database: the sqlite branch's
// `createSqliteRouteDepsForWorkspace(...)` defaults its `dbPath` to `defaultContentDbPath()`, the
// exact path the deleted `openContentDb(defaultContentDbPath())` call opened — the only difference
// an operator can observe is that this process no longer opens a SECOND connection to that file
// (and no longer runs `openContentDb`'s unconditional `migrate()` a second time) at boot.
const auditSink = routeDeps.toolAttemptAuditSink;
// The decorator order — and in particular why the read-only gate is innermost — lives in
// `tool-executor-stack.ts` alongside the composition itself, so it is exercisable by a test that does
// not have to boot this whole module.
//
// Wrapped a second time, OUTERMOST, by `withFederatedRefusalDiagnosis`: a call naming a federated
// tool id this boot refused would otherwise throw `unknown tool "<id>"` (the id is never registered)
// straight past every decorator above and into `@jini-ai/http-kit`'s SEC-005 redaction, reaching the
// model as an opaque `INTERNAL_ERROR` that names neither the tool nor the reason. This layer catches
// exactly that throw and, only when the id matches a refusal in `federationAdmissionReports`, returns
// a real result naming the tool, the server, and the fix instead. See that file's own header.
const toolExecutor = withFederatedRefusalDiagnosis(
  createAssistantToolExecutor({
    registry,
    surfaceExchanges,
    toolAttemptAudit: { sink: auditSink, workspaceId: routeDeps.workspaceId },
  }),
  () => federationAdmissionReports,
);

/**
 * The admin Instructions tab's system-prompt seam (`core.instructions.custom`) — see
 * `custom-instructions.ts`'s module doc for why this is a refreshable cache rather than a direct
 * ledger read: `PromptAugmenter.systemOverlay()` below is called synchronously, and the cross-process
 * cache the ledger's own `getEffective` keeps would otherwise go stale forever after this process's
 * first read. `onStarted` calls `.refresh()` before every run; `assistantPromptAugmenter.
 * systemOverlay()` reads the result synchronously.
 */
const customInstructionsCache = createCustomInstructionsCache(
  {
    settingsRepo: routeDeps.settingsRepo,
    settingsReady: routeDeps.settingsUiTabsReady,
    getEffective: routeDeps.getEffective,
    instructionsNamespace: routeDeps.instructionsNamespace,
  },
  { workspaceId: routeDeps.workspaceId },
);

/**
 * Live-tested 2026-07-30: given a bare natural-language admin request with a matching registered
 * tool (a DB health check, user creation, role listing, form creation), the spawned CLI reliably
 * used its own native Bash/curl instead of `search_tools`/`execute_delegated_tool` — in the worst
 * case, self-authenticating as the seeded site owner via the raw admin login route rather than
 * going through the tool catalog's authorization/risk-classification/audit-log system. The BM25
 * tool-catalog backend itself is not the problem (confirmed healthy via direct query); nothing
 * upstream of it ever told the CLI these tools exist and should be preferred. This overlay is that
 * missing instruction — see `ADS-memory/reports/architecture/ai-workflow-testing-findings.md`.
 */
const assistantPromptAugmenter: PromptAugmenter = {
  contextKinds: () => [],
  augmentUserRequest: ({ basePrompt }) => basePrompt,
  systemOverlay: () => {
    // Base overlay text lives in `assistant-system-overlay.ts` now — see that file's own doc for
    // why this had to move (direct unit-testability without booting this whole daemon process) and
    // `bashProhibitionEnabled`'s doc above for the one thing about it that is conditional.
    const baseOverlay = buildBaseSystemOverlay(bashProhibitionEnabled);
    // Appended, not replaced: the tool-catalog protocol above is load-bearing for every run
    // regardless of what an operator writes in the Instructions tab, and an operator's custom text
    // should not be able to silently drop it. `readOverlay()` is `null` for an unset/cleared tab
    // (see `custom-instructions.ts`), so a workspace with no custom instructions gets exactly the
    // base overlay this returned before that tab had any consumer at all.
    const customOverlay = customInstructionsCache.readOverlay();
    return customOverlay === null ? baseOverlay : `${baseOverlay}\n\n${customOverlay}`;
  },
};

const agentExecutor = createAgentExecutor({
  lifecycle,
  mcpJsonInjection: resolveMcpJsonInjection(daemonUrl),
  promptAugmenter: assistantPromptAugmenter,
  // `claudeConfigDirIsolationEnabled` deliberately left at its `@jini-ai/daemon` default (`false`) —
  // see `CreateAgentExecutorOptions.claudeConfigDirIsolationEnabled`'s own doc (Jini) for the full
  // reasoning. Short version: `@jini-ai/daemon`'s Finding-1 fix (2026-09-07) staged an isolated,
  // mkdtemp'd `CLAUDE_CONFIG_DIR` for every spawned `claude` run to stop it reading the operator's
  // real `~/.claude` (skills, plugins, memory index, a 40-tool personal grant). On macOS that
  // isolated dir reports `loggedIn: false` — Claude Code keys its Keychain entry to
  // `CLAUDE_CONFIG_DIR` — and this assistant's default Local CLI runtime supplies no
  // `credentialEnv` (no `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`; the operator has declined
  // `claude setup-token`), so an isolated child always ran unauthenticated and every Local CLI run
  // failed with "Not logged in · Please run /login". Leaving this flag off knowingly REOPENS that
  // personal-config leak so the default runtime can log in at all — the tool-restriction gate below
  // (`ASSISTANT_DISALLOWED_TOOLS`) is a separate mechanism and stays fully enforced either way (see
  // its own test, `__tests__/agent-executor.test.ts`'s "still applies disallowedTools ... when
  // CLAUDE_CONFIG_DIR isolation is left at its default" in the daemon package). Flip this back to
  // `true` once a host-provisioned `credentialEnv` exists for this runtime (outranks Keychain login
  // in Claude Code's own auth precedence, so an isolated child would still authenticate).
  claudeConfigDirIsolationEnabled: false,
});

/** Populated by `onStarted`, read by `resolveDelegatedPrincipal` — see module doc. Deleted on
 * terminal transition on purpose: the exempt `/api/delegated-tool-calls` route's remaining defence
 * is that a `runId` only resolves while its run is in flight (`daemon-auth.ts`). */
const principalByRunId = new Map<string, Principal>();

/**
 * Assigned once, inside `start()`, before `app.listen()` ever binds the port — `onStarted` cannot
 * be invoked by a real request until then, so every call site below sees this populated. Typed
 * `| undefined` anyway (not asserted non-null) because `onStarted`'s own contract is "never throw
 * synchronously past the point a run is already durably started" — a theoretically-unreachable
 * `undefined` here should still fail the one run it affects, not crash the process.
 */
let attachmentStore: AttachmentStore | undefined;

/**
 * The federation refusal notice this boot's admission pass produced, prepended to every run's
 * prompt below. `""` — the overwhelmingly common case — costs nothing and adds nothing.
 *
 * Assigned once inside `start()`, on the same snapshot `registerFederationAdmissionsRoute` is
 * handed, so the operator's view (`GET /api/federation/admissions`) and the model's view can never
 * disagree about what was withheld. A module-level `let` for the same reason `attachmentStore` is
 * one: `onStarted` is registered at module scope, long before `start()` runs, and reads this at
 * request time.
 *
 * Why the model needs this AT ALL, given the route already exists: a refused tool is never
 * registered, so it is absent from `search_tools` and `describe_tool` — indistinguishable from a
 * capability Tovu simply does not have. Asked why it could not generate an image, the assistant
 * invented a cause, because there was nothing anywhere it could read that said "this exists and was
 * withheld." See `mcp-federation/refusal-notice.ts`.
 */
let federationRefusalPrefix = "";

/**
 * The SAME boot admission snapshot `federationRefusalPrefix` above is built from, kept around for
 * `toolExecutor`'s `withFederatedRefusalDiagnosis` wrap below to read at CALL time rather than boot
 * time. A module-level `let` for the identical reason `federationRefusalPrefix` is one: `toolExecutor`
 * is constructed at module scope, long before `start()` resolves `attachFederatedMcpTools`, so the
 * decorator closes over this binding (`() => federationAdmissionReports`) rather than a value that
 * would forever see the empty pre-boot array. See `federated-refusal-diagnosis.ts`.
 *
 * Typed by deriving `attachFederatedMcpTools`'s own return shape (`Awaited<ReturnType<...>>`) rather
 * than restating it or reusing `refusal-notice.ts`'s deliberately narrower
 * `FederationAdmissionSnapshotEntry` (which structurally omits `isPreset` on purpose, per that
 * file's own doc): `registerFederationAdmissionsRoute` below needs the FULL shape, `isPreset`
 * included, and a narrower annotation here would satisfy the other two readers
 * (`buildFederatedRefusalPrefix`, `withFederatedRefusalDiagnosis`) while breaking that one.
 */
let federationAdmissionReports: Awaited<ReturnType<typeof attachFederatedMcpTools>>["reports"] = [];

/** The same fact with the opposite lifetime — a finished run is still readable, so its owner must
 * stay known. See `run-ownership.ts` for why the two maps are not redundant. */
const runOwners = createRunOwnerRegistry();
/** `@jini-ai/daemon`'s `DEFAULT_TERMINAL_RETENTION_MS` (24 h, not exported), which `lifecycle` (above)
 *  runs with: how long a terminal run stays readable, and so how long its owner must stay known. */
const RUN_OWNER_RETENTION_MS = 24 * 60 * 60 * 1000;

/** H2 fix — see `agent-run-concurrency.ts`'s own doc. One instance for this process's whole
 * lifetime, registered/unregistered per run inside `onStarted` below. */
const liveRunTracker = createLiveRunTracker();

/** Defect 1 fix (2026-09-11) — see `conversation-start-lock.ts`'s own doc. One instance for this
 * process's whole lifetime; `onStarted` runs its read-decide-write session-binding section through
 * it so two near-simultaneous turns on one conversation cannot both mint a session. */
const conversationStartLock = createConversationStartLock();

/**
 * Claims `attachmentIds` against `attachmentStore` and resolves the extra `AgentExecutor.run()`
 * fields the claimed batch contributes (`imagePaths`/`extraAllowedDirs`/`uploadRoot`). Returns
 * `null` when the run should be aborted instead — this function has already called
 * `runLifecycle.finish({status: "failed", ...})` and logged why in that case, mirroring the
 * severity {@link onStarted}'s malformed-`contextRef` branch already gives a failure this early.
 * A no-op ({} fields) when `attachmentIds` is empty — the common case, no store round trip needed.
 */
async function resolveAttachmentRunFields(
  run: OnStartedContext["run"],
  attachmentIds: readonly string[],
  runLifecycle: OnStartedContext["lifecycle"],
): Promise<{ imagePaths?: readonly string[]; extraAllowedDirs?: readonly string[]; uploadRoot?: string } | null> {
  if (attachmentIds.length === 0) return {};

  if (!attachmentStore) {
    // Structurally unreachable (see `attachmentStore`'s own doc) but fails only this run, not the
    // process, if it somehow is.
    void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
    console.error(`[agent-daemon] run ${run.id}: attachment claim requested before the attachment store was ready`);
    return null;
  }

  try {
    // Only `.path` (the opaque capability id) is ever read by `claim()` — it looks up its own
    // internal registry by that id and re-derives `name`/`kind`/`size` from what `register()`
    // recorded at upload time, never from a caller-supplied value. The placeholder `name`/`kind`
    // below satisfy `StoredAttachment`'s shape without asserting anything the store would actually
    // trust.
    const refs: StoredAttachment[] = attachmentIds.map((id) => ({ path: id, name: "", kind: "file" }));
    const claimed = await attachmentStore.claim(refs, run.id);
    if (claimed.batchDirectory === undefined) return {};
    return {
      // Deliberately NOT `.filter((attachment) => attachment.kind === "image")` — that used to be
      // here, matching `attachments.ts`'s own doc-comment example usage, and it silently broke
      // non-image attachments: `extraAllowedDirs` below already grants the agent read access to
      // every claimed file regardless of kind, but a filtered `imagePaths` meant a `.md` (or any
      // `kind: "file"` upload) was claimed, readable, and then never named to the agent at all —
      // `image-prompt-delivery.ts` only narrates paths it is actually given. `imagePaths` (the
      // field name here) and the "image" wording in that module's prompt text are now both
      // inaccurate for a non-image path — known, deliberate, and left as-is: fixing the naming is a
      // Jini change (`packages/daemon/src/image-prompt-delivery.ts`'s prompt copy, and the
      // `AgentExecutor.run()` option name itself), and Jini's tree currently carries uncommitted
      // work from other sessions that a rebuild would republish. Tovu-Runner's
      // `fleet-chat-transport.ts#buildChatStartPayload` made the same call for the same reason.
      imagePaths: claimed.attachments.map((attachment) => attachment.path),
      extraAllowedDirs: [claimed.batchDirectory],
      uploadRoot: claimed.batchDirectory,
    };
  } catch (error) {
    // Fails the run outright rather than silently continuing without the image: the same severity
    // this handler already gives a malformed `contextRef` above. A user who attached a screenshot
    // and gets a run that never saw it (already-claimed, expired past `retentionMs`, or an
    // integrity check failure) would otherwise get a confusing answer about content the agent never
    // looked at, with nothing explaining why.
    const message = error instanceof Error ? error.message : String(error);
    void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
    console.error(`[agent-daemon] run ${run.id}: attachment claim failed`, message);
    return null;
  }
}

const onStarted: RunStartHandler = ({ request, run, lifecycle: runLifecycle }) => {
  let prompt: string;
  let principal: Principal;
  let attachmentIds: readonly string[] = [];
  let pluginRefIds: readonly string[] = [];
  let model: string | undefined;
  let reasoning: string | undefined;
  let conversationId: string | undefined;
  // H1 fix: set once `storedSessionId` is resolved below, read by the stream subscription's
  // `shouldClearSessionOnFailedResume` check — `null` (unchanged) means this run never attempted a
  // resume in the first place, so a failed/no-sessionRef end event has nothing stale to clear.
  let attemptedResumeSessionId: string | null = null;
  try {
    // `frontendBindToken` also rides in this envelope but is deliberately not read here —
    // `createFrontendControl`'s own `resolveBindToken` above owns that field, so there is exactly
    // one place that decides which tab a run may drive.
    const decoded = parseRunStartContextRef(request.contextRef);
    // `<<SUBAGENT_DISPATCH>>` is AGENTS.md's own documented marker (Mandatory Startup section,
    // detection priority 1) for "skip the whole AI-Dev-Shop startup ceremony — this is a
    // dispatched subagent receiving a task prompt, not an interactive human session." Without it,
    // every chat-pane run re-runs the full dev-tooling bootstrap (reads AGENTS.md, prints the
    // startup banner, offers to install slash commands) before touching the user's actual request
    // — confirmed live, burning real turns on a product-facing feature that has nothing to do with
    // this repo's own AI-Dev-Shop pipeline.
    // The admin screen this message was sent from goes AFTER the marker (the marker only works as
    // the prompt's first line) and directly before the operator's words, so "this page" has
    // something to refer to — see `run-page-context.ts`. `""` (no context) leaves the prompt as is.
    prompt = `<<SUBAGENT_DISPATCH>>\n\n${assemblePromptWithPluginPrefix(decoded.prompt, buildPageContextPromptBlock(decoded.pageContext))}`;
    principal = { id: decoded.principalId };
    attachmentIds = decoded.attachmentIds;
    pluginRefIds = decoded.pluginRefIds;
    model = decoded.model;
    reasoning = decoded.reasoning;
    conversationId = decoded.conversationId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
    console.error(`[agent-daemon] run ${run.id}: malformed contextRef`, message);
    return;
  }

  principalByRunId.set(run.id, principal);
  runOwners.record(run.id, principal.id);
  // H2 fix (`agent-run-concurrency.ts`): registered synchronously, in this same
  // never-`await`-ed-yet prefix, so a second `onStarted` call for the same conversation — however
  // close together the two requests arrive — is guaranteed to observe this run as already live.
  // A no-op when `conversationId` is absent, matching the stream subscription below: there is
  // nothing to key concurrency by for a daemon client other than the admin chat pane.
  if (conversationId !== undefined) liveRunTracker.register(conversationId, run.id);
  void runLifecycle.waitForTerminal(run.id).finally(() => {
    principalByRunId.delete(run.id);
    // The owner must outlive the run's end (a finished run is still read and replayed), but not the
    // lifecycle's own terminal record, or this map grows for the daemon's lifetime. Once forgotten,
    // a still-present run is denied to everyone (`requireRunOwnership` fails closed), never opened.
    setTimeout(() => runOwners.forget(run.id), RUN_OWNER_RETENTION_MS).unref();
    if (conversationId !== undefined) liveRunTracker.unregister(conversationId, run.id);
    // Safe to call even for a run that claimed nothing (`AttachmentStore.cleanupRun`'s own
    // contract) — always wired, not only when `attachmentIds` was non-empty, so a run that failed
    // before reaching the claim step below still releases anything a *retry* of the same run id
    // could theoretically have claimed. Best-effort: a cleanup failure must not resurface as a run
    // failure this late in the run's life, and the store's own `retentionMs`/`pruneExpired` is the
    // backstop if this never runs at all (process crash, etc.).
    void attachmentStore?.cleanupRun(run.id).catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id}: attachment cleanup failed`, error);
    });
  });

  // Session-resume capture (Gap 5, `RunEndPayload.sessionRef` — `@jini-ai/protocol`'s doc on that
  // field): watches this run's own event stream for its terminal `end` event and persists whatever
  // agent-CLI session id it reports, so the NEXT turn in this conversation can resume it instead of
  // spawning cold (`agent-session-resume.ts`). A no-op subscription when `conversationId` is absent
  // — any daemon client other than the admin chat pane, today — since there is nowhere to key the
  // stored id by. Subscribed here, before `agentExecutor.run()` is ever called below, so a run that
  // fails immediately after spawn still has its `end` event observed (`stream()`'s own contract:
  // subscribe-before-replay never loses an event to timing).
  if (conversationId !== undefined) {
    const resolvedConversationId = conversationId;
    const resolvedAgentId = request.agentId ?? DEFAULT_AGENT_ID;
    void runLifecycle.stream(run.id, (event) => {
      // Terminal-outcome log line (2026-09-06 chat-death investigation). This subscription already
      // exists, already sees every `end` event, and already has `run.id` in scope — so this is the
      // cheapest possible place to write down HOW a run ended. Until now nothing did: the daemon
      // logged a run that `failed to start` (see the `.catch` at the bottom of this function) but
      // said nothing at all about a run that started fine and then died, which is exactly the case
      // an operator cannot otherwise diagnose. `@jini-ai/daemon`'s `finish()` emits this `end` event
      // as the ONLY record of the terminal status, the event log backing it is in-memory
      // (`createInMemoryEventLog()` above), and the admin client discards the status — so without
      // this line the exit code exists nowhere durable and nowhere visible.
      if (event.kind === "end") {
        const endPayload = event.payload as { status?: unknown; code?: unknown; signal?: unknown; resumable?: unknown };
        const line = `[agent-daemon] run ${run.id} ended: ${String(endPayload.status ?? "unknown")} (code=${String(endPayload.code ?? "none")}, signal=${String(endPayload.signal ?? "none")}, resumable=${String(endPayload.resumable ?? false)}, agent=${resolvedAgentId}, conversation=${resolvedConversationId}, resumeAttempted=${attemptedResumeSessionId !== null})`;
        if (endPayload.status === "succeeded") console.log(line);
        else console.error(line);
      }
      const sessionRef = extractSessionRefFromEndEvent(event);
      if (sessionRef !== undefined) {
        void routeDeps.agentSessions.setSessionId(resolvedConversationId, resolvedAgentId, sessionRef).catch((error: unknown) => {
          console.error(`[agent-daemon] run ${run.id}: failed to persist agent session id`, error);
        });
        return;
      }
      // H1 fix: this run attempted `--resume <attemptedResumeSessionId>` and reached its terminal
      // `end` event without the CLI ever reconfirming a session id — the stored id is unconfirmed
      // at best, and per this repo's own daemon-restarted-from-a-different-cwd hazard, frequently
      // dead. Clear it so the NEXT turn falls back to a cold start instead of retrying the same
      // dead id forever. See `shouldClearSessionOnFailedResume`'s own doc for the full condition.
      if (shouldClearSessionOnFailedResume(event, attemptedResumeSessionId)) {
        void routeDeps.agentSessions.clearSessionId(resolvedConversationId, resolvedAgentId).catch((error: unknown) => {
          console.error(`[agent-daemon] run ${run.id}: failed to clear dead agent session id`, error);
        });
      }
    });
  }

  // Bind this run to the tab that started it, so `page.*` calls have an addressee. A run has
  // exactly one originating surface, which is what makes the routing unambiguous with several
  // admin tabs open — there is no heuristic that could pick a window nobody is watching.
  //
  // A failed bind never fails the run (see `onBindError` above): the agent simply cannot drive the
  // page and says so on each attempt, where killing an otherwise-working session over one optional
  // channel would turn a degraded run into no run at all. The facade also releases the binding on
  // terminal, so a long-lived tab does not accumulate bindings for runs that ended.
  frontendControl.bindOnStarted({ request, run, lifecycle: runLifecycle });

  // Refresh the custom-instructions cache before starting the agent, not concurrently with it: this
  // is the one point in a run's lifecycle before `systemOverlay()` is called (synchronously, inside
  // `run()`'s own argv-building step) where an `await` is still possible. Sequencing here — rather
  // than racing the refresh against `run()` and hoping the internal timing works out — makes the
  // guarantee independent of `@jini-ai/daemon`'s internal ordering. `refresh()` never rejects (see
  // `custom-instructions.ts`), so this adds no new failure path before `run()` is even reached.
  void customInstructionsCache
    .refresh()
    .then(async () => {
      // `imagePaths`/`extraAllowedDirs`/`uploadRoot` are pre-existing `AgentExecutor.run()` options
      // (`packages/daemon/src/agent-executor.ts`) — this only ever produces real values for them.
      // Deliberately NOT touching `prompt` here: a second agent owns making the CLI agent actually
      // look at `imagePaths` (per-def prompt augmentation / delivery mode), and augmenting it here
      // too would deliver the same image twice for whichever defs it lands on. This handler's job
      // ends at handing `run()` correct paths.
      const attachmentRunFields = await resolveAttachmentRunFields(run, attachmentIds, runLifecycle);
      if (!attachmentRunFields) return;

      // Resolved AFTER attachments, BEFORE `run()`: prepending to `prompt` (unlike the attachment
      // fields above, which are separate `AgentExecutor.run()` options) means this must land before
      // `prompt` is read below, and there is no ordering dependency on the attachment claim either
      // way — the two resolve independently.
      // Experimental delivery-mechanism measurement (see capability-manifest-prefix.ts's own header) —
      // resolved and prepended BEFORE the plugin prefix, same "resolved before run(), no ordering
      // dependency either way" reasoning as attachments vs. plugin prefix above. Off by default; a
      // no-op unless a probe sets `TOVU_CAPABILITY_MANIFEST_ARM` for this process.
      const capabilityManifestPrefix = buildCapabilityManifestPrefix(resolveCapabilityManifestArm());
      prompt = assemblePromptWithPluginPrefix(prompt, capabilityManifestPrefix);

      // What this boot REFUSED to admit from external MCP servers, in the one channel a model does
      // not have to go looking for. Not a tool, deliberately: a model that does not know it is
      // missing anything never calls the tool that would tell it — see `refusal-notice.ts`. `""`
      // on a clean boot, in which case `assemblePromptWithPluginPrefix` is a no-op.
      prompt = assemblePromptWithPluginPrefix(prompt, federationRefusalPrefix);

      const pluginPromptPrefix = await resolveAgentPluginPromptPrefix(run, pluginRefIds, runLifecycle, routeDeps.workspaceId);
      if (pluginPromptPrefix === null) return;
      prompt = assemblePromptWithPluginPrefix(prompt, pluginPromptPrefix);

      /*
       * This run's entire session-binding decision, in ONE function so it can be handed to
       * `conversationStartLock` as a single critical section (Defect 1, 2026-09-11). It reads the
       * stored id, applies the H2 concurrency gate, refuses the run when starting cold would
       * silently drop history, mints and persists a fresh id when this is a genuine cold start, and
       * returns the `AgentExecutor.run()` session fields that decision produces — `null` meaning
       * "refused, the run is already finished as failed, stop."
       *
       * Extracted as its own function originally for complexity (2026-09-03 — this handler's async
       * continuation was at cyclomatic 11 against this repo's 9 ceiling) so `onStarted`'s own branch
       * count reflects sequencing, not this decision's own branches. Declared and called right here,
       * inline, rather than hoisted to module scope: this file's own wiring tests
       * (`agent-daemon-server.session-resume-wiring.unit.test.ts` and
       * `agent-daemon-server.session-binding-wiring.unit.test.ts`, which prove ordering by reading
       * this file's raw SOURCE rather than importing it — see their docs for why) assert that
       * `routeDeps.agentSessions.getSessionId(`/`liveRunTracker.hasConcurrentLiveRun(`/
       * `routeDeps.agentSessions.setSessionId(` appear, in this relative order, strictly before
       * `agentExecutor.run` below; keeping this body here preserves that ordering byte-for-byte.
       */
      async function resolveSessionBinding(): Promise<{
        readonly agentId: string;
        readonly sessionFields: { resumeSessionId?: string; newSessionId?: string };
      } | null> {
        const agentId = request.agentId ?? DEFAULT_AGENT_ID;
        // Resolved AFTER attachments/prompt, same "no ordering dependency either way" reasoning as
        // the plugin prefix above. Looked up unconditionally (unlike before the H2-context-loss fix
        // below, which needs to know whether a session exists even when `hasConcurrentLiveRun` will
        // refuse to use it) — `null` (no conversationId at all, or nothing on record yet) is what
        // makes `resolveResumeSessionField` a no-op below, so this run starts cold. Since the
        // Defect 1 fix a cold start is no longer id-less: `resolveHostMintedSessionId` below mints
        // one and persists it before the CLI is spawned, which is what this comment used to say was
        // deliberately NOT happening.
        const storedSessionId =
          conversationId !== undefined ? await routeDeps.agentSessions.getSessionId(conversationId, agentId) : null;
        // The H2 fix: refusing to resume when another run for this conversation is already live
        // means at most one process ever holds `--resume <id>` for that CLI session at a time,
        // closing the two-live-`--resume`-processes-on-one-transcript-file hazard even though the
        // two runs' `end` events can still race each other for the store's last write — see
        // `agent-run-concurrency.ts`'s own module doc for the full reasoning and why an in-process
        // tracker needs no special handling across a daemon restart.
        const hasConcurrentLiveRun = conversationId !== undefined && liveRunTracker.hasConcurrentLiveRun(conversationId, run.id);

        // H2-context-loss fix: H2 alone silently drops conversation history for a
        // `carriesOwnMemory` agent — see `wouldForcedColdStartLoseConversationContext`'s own doc for
        // the full mechanism. The client already sent only the bare latest message trusting this run
        // to resume; forcing it cold here would answer with none of the conversation `storedSessionId`
        // proves actually exists. Refuse the run outright (same "fail loud, not silently degrade"
        // precedent as the attachment-claim-failure branch above) rather than let the CLI answer
        // blind.
        if (
          wouldForcedColdStartLoseConversationContext({
            storedSessionId,
            hasConcurrentLiveRun,
            carriesOwnMemory: agentCarriesOwnMemory(agentId),
          })
        ) {
          void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
          console.error(
            `[agent-daemon] run ${run.id}: refused — conversation "${conversationId}" has a live concurrent run holding agent "${agentId}"'s resumable session, and this agent carries its own memory; starting cold would silently drop conversation history`,
          );
          return null;
        }

        const effectiveResumeSessionId = hasConcurrentLiveRun ? null : storedSessionId;
        attemptedResumeSessionId = effectiveResumeSessionId;

        /*
         * Defect 1 fix (2026-09-11). BEHAVIOR CHANGE, stated explicitly: a cold start for a def
         * that accepts a host-minted session id now spawns the CLI under an id THIS process chose
         * and wrote down first, instead of letting the CLI choose one and hoping the run survives
         * long enough to report it back on its terminal `end` event.
         *
         * Why the old shape lost conversations: `extractSessionRefFromEndEvent` (the only writer
         * before this) can only run if an `end` event actually arrives. A run killed by a daemon
         * respawn, or one that fails in its first few hundred milliseconds, never produces one —
         * so the conversation stayed unbound even though the CLI had already created a real
         * session, and the NEXT turn started cold and answered with none of the history.
         *
         * The residual risk, disclosed rather than hidden: if the CLI dies before creating its own
         * session file, the id persisted here names a session that does not exist, and the next
         * turn's `--resume` fails. That failure is visible (the run ends failed) and self-healing
         * — `shouldClearSessionOnFailedResume` clears the dead id, so the turn after starts cold.
         * That is a strictly better failure than the silent, permanent history loss it replaces.
         */
        const hostMintedSessionId = resolveHostMintedSessionId({
          conversationId,
          effectiveResumeSessionId,
          acceptsHostMintedSessionId: agentAcceptsHostMintedSessionId(agentId),
          mint: randomUUID,
        });
        if (conversationId !== undefined && hostMintedSessionId !== null) {
          // Awaited, and inside the conversation lock: the whole point is that the binding is
          // durable BEFORE the CLI is spawned. A failure here is logged and the run continues —
          // losing resumability for one conversation is the pre-fix behavior, where failing the
          // run outright would cost the user a turn over a bookkeeping write.
          await routeDeps.agentSessions.setSessionId(conversationId, agentId, hostMintedSessionId).catch((error: unknown) => {
            console.error(`[agent-daemon] run ${run.id}: failed to persist minted agent session id at dispatch`, error);
          });
        }

        return {
          agentId,
          sessionFields: { ...resolveResumeSessionField(effectiveResumeSessionId), ...resolveNewSessionField(hostMintedSessionId) },
        };
      }
      // Serialized per conversation (`conversation-start-lock.ts`): `resolveSessionBinding` is a
      // read-modify-write over `assistant_agent_sessions` with an `await` in the middle, so two
      // near-simultaneous turns on one conversation could otherwise both observe an empty session
      // slot and both mint — forking the conversation exactly the way the terminal-event-only write
      // did. Deliberately does NOT cover `agentExecutor.run` below: holding the lock across a whole
      // agent run would queue a second tab's turn behind it for minutes with no feedback.
      const sessionBinding = await conversationStartLock.run(conversationId, resolveSessionBinding);
      if (sessionBinding === null) return;

      await agentExecutor.run({
        runId: run.id,
        agentId: sessionBinding.agentId,
        prompt,
        cwd: process.env.TOVU_AGENT_CWD ?? process.cwd(),
        permissionMode: resolvePermissionMode(),
        // Finding 2 (SEC-assistant-env-isolation-2026-09-07): the actual, enforced tool-grant
        // restriction — see ASSISTANT_DISALLOWED_TOOLS's own doc for the evidence behind this exact
        // list. Unconditional, unlike resolveBashProhibitionEnabled()'s prompt-only diagnostic above.
        disallowedTools: ASSISTANT_DISALLOWED_TOOLS,
        ...(model !== undefined ? { model } : {}),
        // Same spread shape as `model` immediately above: `AgentExecutor.run()` passes it into the
        // def's own `buildArgs` options, which is where it becomes real argv.
        ...(reasoning !== undefined ? { reasoning } : {}),
        ...attachmentRunFields,
        // Both session fields at once — `resolveResumeSessionField(effectiveResumeSessionId)` for a
        // resumed turn and `resolveNewSessionField(hostMintedSessionId)` for a cold one. They are
        // mutually exclusive by construction (`resolveHostMintedSessionId` mints only when there is
        // nothing to resume), and both are empty objects when they do not apply, so exactly one key
        // ever reaches `AgentExecutor.run()`. Assembled inside `resolveSessionBinding` above so the
        // id that was persisted and the id handed to the CLI can never drift apart.
        ...sessionBinding.sessionFields,
      });
    })
    // `AgentExecutor.run()` already transitions the run to `'failed'` via `lifecycle.finish()` on
    // every failure path before it rejects — this catch only guards against an unhandled rejection.
    // (The attachment-claim failure branch above finishes the run itself and returns before ever
    // reaching `run()`, so it does not rely on this catch for that.)
    .catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id} failed to start`, error);
    });
};

/** Fails closed: an untracked `runId` throws rather than fabricating a principal — see
 * `src/server/modules/assistant.ts`'s identical guard for the full rationale.
 *
 * A `requireReadOnly` request (the wire flag `@jini-ai/mcp`'s `execute_readonly_delegated_tool`
 * sets, and which `@jini-ai/http-kit` hands to this host-owned resolver verbatim) resolves to an
 * ATTENUATED principal instead of the tracked one. That is what carries the constraint past this
 * route and into the execution itself, where `withReadOnlyToolConstraint` enforces it on every
 * dispatch rather than only on the id the caller named — the route's own check answers for that one
 * id, and a decorator can dispatch another. See `read-only-tool-constraint.ts`. */
const resolvePrincipal = (request: DelegatedToolExecuteRequest): Principal => {
  const principal = principalByRunId.get(request.runId);
  if (!principal) throw new Error(`no principal is tracked for run "${request.runId}"`);
  return request.requireReadOnly === true ? constrainPrincipalToReadOnlyTools(principal) : principal;
};

const app = express();
// FIRST, and before `express.json()` — an unauthenticated caller's body is never parsed. See this
// file's module doc and `daemon-auth.ts` for the fail-closed contract. The single exempt path is
// `/api/delegated-tool-calls`, whose only legitimate caller is this run's own spawned `jini-mcp`
// subprocess — a process `@jini-ai/daemon` hands `JINI_RUN_ID`/`JINI_DAEMON_URL` and nothing else,
// and which sends no `Authorization` header. Gating it would break tool execution outright; it is
// instead covered by `resolvePrincipal`'s fail-closed live-`runId` check below. Full rationale and
// residual-risk statement: `daemon-auth.ts`'s `DELEGATED_TOOL_CALLS_PATH`.
app.use(requireAgentDaemonToken({ exemptPaths: [DELEGATED_TOOL_CALLS_PATH] }));
// Default (100kb) is too small for `admin.capture_screenshot`'s answer: a base64-encoded JPEG of an
// admin viewport, posted back to `/api/frontend-sessions/:id/responses`
// (`frontend-session-bridge.ts`'s `respond()`), routinely exceeds it even after
// `agent-screenshot.ts`'s own quality/size retries — a silent 413 would look like a capture bug
// rather than the transport limit it actually is. Raised, not removed: this still bounds the worst
// case for every route mounted below (all of them, since this is `app.use` with no path), and every
// caller reaching them is already past `requireAgentDaemonToken` above, so this is not a new
// unauthenticated attack surface, only a larger authenticated one.
app.use(express.json({ limit: "6mb" }));
const adapter: AdapterContext = { resolvedPortRef: { current: port } };

// Per-run authorization, mounted between the bearer gate and the run routes it protects. The gate
// above proves the caller is Tovu's proxy; these two prove *which admin* the proxy is speaking for,
// which is the question neither the gate nor the proxy's own session check can answer. Both must
// precede `registerRunRoutes`: the middleware so it runs first, and the list handler so it shadows
// http-kit's unscoped `runListRoute` under Express's first-match-wins routing. See
// `run-ownership.ts` for the ownership model and the 404-not-403 rationale.
app.use("/api/runs/:runId", requireRunOwnership(runOwners, lifecycle));
app.get("/api/runs", createOwnedRunListHandler({ lifecycle, registry: runOwners }));

registerRunRoutes(app, { lifecycle, onStarted }, adapter);
// `rescanAgents` wired explicitly (not left to fall back to `listAgents`, `@jini-ai/http-kit`'s own
// default): `listAssistantAgents` is now cached (see `agents.ts`'s module doc — this file's own
// gap was the fallback silently serving the same stale cache `POST /api/agents/rescan` exists to
// bypass). `rescanAssistantAgents` is the one path that actually forces a fresh PATH probe.
registerAgentRoutes(app, { listAgents: listAssistantAgents, rescanAgents: rescanAssistantAgents }, adapter);
// `toolRegistry` is what lets a `requireReadOnly` call be CHECKED. Without it the read-only
// gateway does not weaken to a pass-through -- it fails closed and refuses every call -- so
// omitting it silently disables the gateway rather than silently widening it.
registerDelegatedToolRoutes(app, { lifecycle, toolExecutor, resolvePrincipal, toolRegistry: registry }, adapter);
// The MCP-UI callback endpoint. Two shapes reach it: an exchange delivery, where a form's OR
// content_post_delete's answer resolves an agent tool call still waiting on it (ADR-055 Decision 1
// for forms, Decision 2 for the destructive delete), and the legacy confirmation redemption shape
// (ADR-053 Decision 3), which no wired tool currently uses — `content_post_delete` was the only
// tool that ever took it, and it moved to the exchange shape above.
// Same non-exemption reasoning as `frontendControl.httpExtension` just below: the
// browser reaches this through Tovu's session-authenticated proxy, which attaches the bearer token
// like every other forwarded route, so no `exemptPaths` entry is needed or wanted. See
// `mcp-ui-tool-calls-route.ts` for why this must live in THIS process (it is the one holding the
// `ToolExecutor`/`SurfaceExchangeStore` an exchange delivery actually needs) and
// `src/server/modules/assistant.ts` for the proxy half.
registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
// A2UI's own inbound channel (ADR-055 Decision 1, generalized) — a rendered surface's `action`/
// `functionResponse`/`error` re-entering the process that holds the exchange it answers. Unlike
// the MCP-UI route above, this never touches `toolExecutor` at all (there is no tool-call shape to
// fall back to for A2UI) — see `a2ui-actions-route.ts`'s own module doc. Same non-exemption
// reasoning: reached only through Tovu's session-authenticated proxy, which attaches the bearer
// token like every other forwarded route.
registerA2uiActionsRoute(app, { surfaceExchanges });
// The browser half of the `page.*` channel: an SSE stream that carries invocations down to the
// admin tab, and a POST that carries its answers back. Deliberately NOT added to the bearer gate's
// `exemptPaths` — unlike `/api/delegated-tool-calls` (whose caller is a spawned `jini-mcp`
// subprocess that holds no token), these two are reached by the browser through Tovu's own
// session-authenticated proxy, which attaches the bearer like every other forwarded route. See
// `src/server/modules/assistant.ts`.
frontendControl.httpExtension(app, { adapter });

/**
 * OUTBOUND MCP federation — the reverse direction from `mcp-injection.ts`. Tovu connects OUT to a
 * site owner's configured external MCP server and registers whatever clears
 * `mcp-federation/trust.ts`'s separate, more restricted trust tier.
 *
 * The MECHANISM is core (`mcp-federation/`); which VENDORS exist is not. Each vendor preset is a
 * first-party plugin module that registers itself through `mcp-federation/presets.ts`, and this
 * function is the composition root that installs the default-included ones — today just Supabase,
 * the same wiring posture `store-plugin.ts` has. A second vendor is one more `register*Preset()`
 * call here plus its own module; core federation never learns any vendor's name.
 *
 * Registration is not activation. Off unless configured: with no `TOVU_SUPABASE_MCP_ENABLED` the
 * Supabase resolver returns `null`, `attachFederatedMcpTools` resolves zero connections, and this
 * boot is byte-for-byte the one that ran before the capability existed. It never rejects — a third
 * party's server must not be able to stop Tovu's daemon booting — so there is no failure branch to
 * handle here; see `mcp-federation/bootstrap.ts` for the fail-open rationale and why it is the
 * opposite of `daemon-auth.ts`'s fail-closed posture.
 *
 * Ordering is load-bearing, which is why the last two registrars moved inside this async start:
 * `buildToolCatalogQuery` snapshots `registry.list()` into a one-shot FTS index, so a federated tool
 * registered after it would be executable but invisible to `search_tools`/`describe_tool` — exactly
 * the half-wired state `tool-catalog-query.ts`'s own header records finding on 2026-07-30. Route
 * order is otherwise unchanged: the catalog routes were already registered last.
 */
/**
 * Reads the operator-editable roster (Settings → External MCP) into federation's connection shape.
 *
 * Boot-time only, and that is the DESIGN, not a limitation left unfinished: the admitted tool set is
 * frozen at connect (`trust.ts` R5), which is what closes the rug-pull where a server advertises a
 * benign surface while an operator picks an allowlist and swaps it afterwards. Re-reading this
 * roster mid-process would have to re-establish that guarantee deliberately. The tab therefore tells
 * the operator a restart is required rather than implying a saved row is already live.
 *
 * Fail-open on every path, matching `bootstrap.ts`: an unreadable roster must not stop the daemon
 * booting, because the assistant's own native catalog does not depend on it.
 *
 * @returns The stored connections, or an empty list if none are usable.
 * @complexity O(n) in the enabled server count.
 * @overallScore 100
 */
/**
 * This process's OWN OAuth service — a SECOND `ExternalMcpOAuthService` instance, not
 * `routeDeps.externalMcpOAuth` reused directly.
 *
 * Not because `routeDeps.externalMcpOAuth` "lives in the web server" — it does not; `routeDeps`
 * above is built by THIS process's own `createSqliteRouteDepsForWorkspace`/`createRouteDeps` call
 * (this file is its own composition root, same as the main web server is its), so that field is
 * every bit as much a daemon-process object as this one. The real reason for a second instance is
 * narrower: `resolveStoredExternalMcpConnections`/`onAuthFailed` below need a token
 * resolver/`reportAuthFailure` bound to THIS boot's federation setup, and building that inline here
 * is simpler than threading a second construction parameter through `createSqliteRouteDeps` for a
 * concern only the daemon has. The two instances share the only thing they must: the database row,
 * which is where the sealed token, the plaintext expiry, and the cross-process refresh lease all
 * live — `tryClaimOAuthRefreshLease` is what keeps the two from redeeming one single-use rotating
 * refresh token twice.
 *
 * `pending`/`devices` below are `routeDeps.externalMcpOAuthPending`/`externalMcpOAuthDevices` —
 * the SAME two stores `routeDeps.externalMcpOAuth` was built with, not a second pair. They are
 * still, in practice, unreachable through THIS instance specifically: `resolveStoredExternalMcpConnections`
 * only reads `.tokenResolver`, and `onAuthFailed` only calls `.reportAuthFailure` — neither reaches
 * `beginConnect`/`completeAuthorizationCallback`/`pollDeviceAuthorization`, which is where a
 * handshake actually touches them. The assistant tool that DOES start a handshake from this process
 * (`external_mcp_oauth_connect`, wired against `routeDeps.externalMcpOAuth` in
 * `features/external-mcp/tool-registrations.ts`) uses the OTHER instance — and reusing the same
 * store objects here rather than building a redundant in-memory pair is what keeps this file's own
 * doc accurate instead of quietly wrong the next time something is wired through this local.
 */
const externalMcpOAuth = createExternalMcpOAuthService({
  workspaceId: routeDeps.workspaceId,
  repo: routeDeps.externalMcpServerRepo,
  sealer: routeDeps.siteAssistantSecretSealer,
  keyring: routeDeps.siteAssistantSecretKeyring,
  clock: routeDeps.clock,
  // Falls back to a fresh in-memory pair only if some future narrower `RouteDeps` builder leaves
  // these unset (see `routes/types.ts`'s doc on both fields) — every real composition root sets them.
  pending: routeDeps.externalMcpOAuthPending ?? createPendingAuthorizationStore({ clock: routeDeps.clock }),
  devices: routeDeps.externalMcpOAuthDevices ?? createDeviceAuthorizationStore(),
});

/**
 * Boot-time (and every reload pass's) accounting of which SAVED external-MCP rows could not even be
 * resolved into a connection attempt — e.g. a sealed env block that failed to decrypt because the
 * site token is not available. `resolveStoredExternalMcpConnections` reassigns this on every call
 * (boot, plus every `reloadFederatedConnections` pass), REPLACING rather than accumulating: unlike
 * `federationAdmissionReports` (a connection, once admitted, stays admitted forever per `trust.ts`
 * R5), a config-resolution failure is not permanent — fixing the site token and triggering a reload
 * can make the SAME serverId resolve cleanly on a later call, and the stale failure must disappear
 * from this list rather than linger next to a since-succeeded connection.
 *
 * Read through a closure (`registerFederationAdmissionsRoute` below), matching
 * `federationAdmissionReports`'s own module-level-`let` reasoning: this binding is declared before
 * `start()` ever runs, so the route must close over the BINDING, not a value snapshot that would
 * forever see the empty pre-boot array.
 */
let externalMcpConfigFailures: readonly { readonly connectionId: string; readonly reason: string }[] = [];

async function resolveStoredExternalMcpConnections(): Promise<ResolvedFederatedConnection[]> {
  try {
    const { configs, failures } = await readEnabledExternalMcpConfigs(
      {
        repo: routeDeps.externalMcpServerRepo,
        sealer: routeDeps.siteAssistantSecretSealer,
        // Resolves (and refreshes, if due) the access token for an `authMode: "oauth"` row before
        // its child process is launched with it. A row that needs re-authorization is reported in
        // `failures` below rather than launched credential-free.
        oauth: externalMcpOAuth.tokenResolver,
      },
      routeDeps.workspaceId,
    );
    for (const failure of failures) {
      console.warn(`[agent-daemon] mcp-federation: stored server '${failure.serverId}' skipped — ${failure.reason}`);
    }
    // Replaces, not appends — see `externalMcpConfigFailures`'s own doc on why this list tracks the
    // most recent resolution attempt rather than every attempt this process has ever made.
    externalMcpConfigFailures = failures.map((failure) => ({ connectionId: failure.serverId, reason: failure.reason }));
    return toResolvedFederatedConnections(configs);
  } catch (error) {
    console.warn(
      `[agent-daemon] mcp-federation: the stored external-MCP roster could not be read, continuing without it — ${error instanceof Error ? error.message : String(error)}`,
    );
    // The whole read failed before any per-row failure could be attributed — a stale per-row failure
    // from an earlier, partially-successful read must not survive next to a total read outage.
    externalMcpConfigFailures = [];
    return [];
  }
}

async function start(): Promise<void> {
  registerSupabaseMcpPreset();

  // Shared by the boot admission pass below AND every federation-reload pass
  // (`reloadFederatedConnections`, defined further down): the SAME gate/failure-reporting wiring
  // must back both, or a connection admitted by a reload could be held to different liveness
  // behaviour than one admitted at boot for no reason other than which pass happened to register it.
  const federationDeps: FederationDeps = {
    authorize: routeDeps.authorize,
    workspaceId: routeDeps.workspaceId,
    // Nothing here unregisters a federated tool once it is in the FTS index, so a connection whose
    // authorization dies mid-run, or that an operator turns off, deletes, narrows or disconnects,
    // stays discoverable and selectable. The gate is what stops the model looping on it: every call
    // to a `needs_reauth`, or now operator-revoked, connection returns one terminal, explicitly
    // non-retryable message instead of a transient-looking transport error. See
    // `mcp-federation/registrations.ts`'s `assertConnectionUsable` doc.
    assertConnectionUsable: createExternalMcpConnectionGate({
      workspaceId: routeDeps.workspaceId,
      repo: routeDeps.externalMcpServerRepo,
    }),
    // The gate above only catches a connection ALREADY known dead. A token valid at admission can
    // still die mid-session — there is no periodic refresh — so this is what discovers that: on a
    // live 401/403 it records `needs_reauth` (so the gate catches the NEXT call cheaply) and
    // replaces the transport-shaped error with the same terminal message the gate throws.
    onAuthFailed: (connectionId, error) => externalMcpOAuth.reportAuthFailure(connectionId, error),
  };

  // Reassigns the module-scope `let` declared above (not a fresh local `const`): `toolExecutor`'s
  // `withFederatedRefusalDiagnosis` wrap already closed over that binding before this line ever
  // runs, and only a reassignment — not a same-named local shadowing it — is visible through that
  // closure. Same reasoning as `federationRefusalPrefix` a few lines down.
  federationAdmissionReports = (await attachFederatedMcpTools({
    registry,
    deps: federationDeps,
    extraConnections: await resolveStoredExternalMcpConnections(),
  })).reports;

  // What this process has admitted so far, over HTTP — see `federation-admissions-route.ts`'s own
  // doc for why `reports` is a LIVE getter (not a snapshot handed in once) and
  // `daemon-auth.ts`'s gate (already mounted above, before any route) for why this needs no auth
  // logic of its own: the path is not in that gate's `exemptPaths`, so it is covered like every
  // other route in this process.
  registerFederationAdmissionsRoute(app, {
    reports: () => federationAdmissionReports,
    // See `externalMcpConfigFailures`'s own doc: a boot-time (or reload-time) decrypt/config failure
    // for a saved row that never even reached `attachFederatedMcpTools`, so it has no admission
    // report at all and would otherwise be invisible to this route.
    configFailures: () => externalMcpConfigFailures,
  });

  // The same accounting, for the OTHER party that never heard the refusal. Rebuilt (not merely
  // reassigned) after every reload pass that admits something new — see `reloadFederatedConnections`
  // below — because a connection admitted mid-process should stop being reported as withheld in
  // every NEW run's prompt, even though `trust.ts` R5 still means the admitted set for any ONE
  // connection, once decided, never changes again.
  federationRefusalPrefix = buildFederatedRefusalPrefix(federationAdmissionReports);
  if (federationRefusalPrefix !== "") {
    console.warn(
      `[agent-daemon] mcp-federation: ${federationRefusalPrefix.split("\n").filter((line) => line.startsWith("- ")).length} withheld external tool(s) will be reported to the model in every run's prompt`,
    );
  }

  /**
   * Owns "which connectionIds has THIS process admitted so far" and serializes every reload attempt
   * — see `mcp-federation/reload.ts`'s own header for the full concurrency/R5 argument, not repeated
   * here. Seeded from the boot pass immediately above, so the first reload only ever considers
   * connections that did not exist (or were not yet authorized) at boot.
   */
  const federationReloadCoordinator = createFederationReloadCoordinator(
    { registry, deps: federationDeps, resolveConnections: resolveStoredExternalMcpConnections },
    federationAdmissionReports.map((entry) => entry.connectionId),
  );

  /**
   * Runs one reload pass and, only when it actually admitted something new, propagates the result
   * into every OTHER piece of process state that a boot-time admission also updates: the merged
   * accounting `GET /api/federation/admissions` (registered above) now serves live, the refusal
   * prefix future runs' prompts carry, and — the discovery-side fix, see
   * `tool-catalog-live-query.ts` — the `search_tools`/`describe_tool` snapshot, rebuilt from
   * `registry.list()` and rebound into the SAME object identity `registerToolCatalogRoutes` was
   * handed below (`liveToolCatalog`, defined a few lines down).
   *
   * A no-op reload (nothing new in the roster) intentionally skips all of this — rebuilding an
   * unchanged FTS snapshot would cost real work for zero benefit, and would also, if a bug ever
   * changed the rebuild to compute a stale result, be the SORT of no-op that becomes hard to notice
   * precisely because nothing appeared to happen.
   */
  async function reloadFederatedConnections(): Promise<FederationReloadResult> {
    const result = await federationReloadCoordinator.reload();
    if (result.newlyAdmittedConnectionIds.length === 0) return result;

    federationAdmissionReports = [...federationAdmissionReports, ...result.reports];
    federationRefusalPrefix = buildFederatedRefusalPrefix(federationAdmissionReports);
    liveToolCatalog.rebind(
      withToolCatalogAudit(buildToolCatalogQuery(registry), auditSink, {
        workspaceId: routeDeps.workspaceId,
        runId: UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID,
        principalId: UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID,
      }),
    );
    console.log(
      `[agent-daemon] mcp-federation: reload admitted ${result.newlyAdmittedConnectionIds.length} new connection(s): ${result.newlyAdmittedConnectionIds.join(", ")}`,
    );
    return result;
  }

  registerFederationReloadRoute(app, { reload: reloadFederatedConnections });

  /**
   * Registers every installed Agent Plugin, installed Agent Skill, and enabled plugin-runtime
   * capability tool (Word Count today) as real tools, so a plain `search_tools` reaches them the same
   * way it already reaches the native tools — the structural half of the capability-discovery work,
   * complementing the prompt-side `TOVU_CAPABILITY_MANIFEST_ARM` affordance rather than replacing it.
   * Bench measurement (agent plugins): #1 for 6 of 7 held-out design queries, and it FREED native
   * tools rather than crowding them (`theme_read_file` #10 -> #4 on "design guidance"). Capability
   * tools are the fix for the 2026-08-26 registration-gap audit: Word Count was live, valid, and
   * computing real data, but no tool anywhere ever exposed it.
   *
   * Moved into `registerInstalledExtensionTools` (`assistant/installed-extension-tools.ts`), which
   * `byok-tool-surface.ts` now calls too, so BYOK mode sees the identical three families through the
   * identical ordering/fail-open registrar rather than a second hand-written copy — see that
   * function's own header for the full ordering/fail-open rationale, unchanged from the three blocks
   * this call replaces. Placed here — inside `start()`, immediately before `buildToolCatalogQuery` —
   * because that call snapshots `registry.list()` into a one-shot FTS index: a tool registered after
   * it is executable but INVISIBLE to `search_tools`. Awaited for the same reason: each family reads
   * its own tree off disk, and an un-awaited promise would let the snapshot win the race on a cold
   * cache.
   */
  await registerInstalledExtensionTools(registry, routeDeps, "[agent-daemon]");

  // Backs `@jini-ai/mcp`'s `search_tools`/`describe_tool` — was never mounted before 2026-07-30,
  // so both 404'd for every spawned CLI despite the registry itself being fully populated. See
  // `tool-catalog-query.ts`.
  //
  // Wrapped in `withToolCatalogAudit` so every call lands in the same durable `agent_tool_attempts`
  // trail as a real tool execution — neither route ever reaches `ToolExecutor`/`withToolAttemptAudit`
  // above, since `registerToolCatalogRoutes` is "deliberately not routed through ToolExecutor" (that
  // route module's own doc). Fixed `runId`/`principalId` rather than the daemon's real per-run
  // values: `toolCatalogSearchRoute`/`toolCatalogDescribeRoute`'s `handle(input, deps)` carries no
  // per-request identity at all (v0 scope, `@jini-ai/http-kit`'s own doc) — see `tool-catalog-audit.ts`
  // for the full disclosure.
  //
  // Wrapped a SECOND time in `createLiveToolCatalogQuery` (federation hot-reload, 2026-09-11):
  // `registerToolCatalogRoutes` captures whatever object `.catalog` points to here ONCE, at this
  // call, so a later `attachFederatedMcpTools` call (`reloadFederatedConnections` above) that
  // registers new tools into `registry` would otherwise be invisible to `search_tools`/`describe_tool`
  // forever — executable via `execute_delegated_tool` (which resolves against the live `registry`
  // directly, see `@jini-ai/daemon`'s `ToolExecutor.execute`) but undiscoverable, the exact half-wired
  // state `tool-catalog-query.ts`'s own header records finding on 2026-07-30 for a different reason.
  // `liveToolCatalog.query`'s object identity never changes; `reloadFederatedConnections` calls
  // `.rebind(...)` with a freshly reseeded snapshot instead.
  const liveToolCatalog = createLiveToolCatalogQuery(
    withToolCatalogAudit(buildToolCatalogQuery(registry), auditSink, {
      workspaceId: routeDeps.workspaceId,
      runId: UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID,
      principalId: UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID,
    }),
  );
  registerToolCatalogRoutes(app, { catalog: liveToolCatalog.query }, adapter);

  // Backs `@jini-ai/mcp`'s `search_components`/`describe_component` — same route-registration gap
  // `tool-catalog-query.ts`'s own history warns about, avoided here by mounting alongside it from
  // the start rather than adding it later. See `component-catalog-query.ts`.
  registerComponentCatalogRoutes(app, { catalog: buildComponentCatalogQuery() }, adapter);

  // `createDiskAttachmentStore` is async (it reconciles `uploadDirectory` against the previous
  // process on construction — see its own doc), so it cannot be a module-scope `const` the way
  // `agentExecutor`/`toolExecutor` are. Assigned into the module-scope `attachmentStore` binding
  // `onStarted` reads, and awaited here — before `app.listen()` a few lines down — so no request
  // can ever reach this process while `attachmentStore` is still unset (`onStarted`'s own doc
  // explains why that matters).
  //
  // `retainAcrossRestarts` is NOT optional for this host, and the reason is specific to how this
  // process is started. The daemon is a `spawn()` child of `src/index.ts`, which dev runs under
  // `tsx watch` — so every save anywhere in `apps/website/src` kills and respawns it (see
  // `agent-daemon-supervisor.ts`). Without this option the store empties `uploadDirectory` on each
  // of those constructions, which means an unrelated source edit silently destroys every chat
  // attachment a user has staged but not yet sent. That is not a hypothetical: an upload was
  // observed erased by an API reload ~90 seconds later. The store's default is deliberately the
  // conservative one for hosts whose process lifetime really does bound an upload's; this host is
  // not one of them.
  //
  // Adoption is authenticated, not blind — a file that changed between processes is rejected by the
  // same integrity gate `claim()` applies, and anything unaccounted for is swept. Reverting to the
  // previous behavior is deleting this one option.
  attachmentStore = await createDiskAttachmentStore({
    uploadDirectory: ATTACHMENT_UPLOAD_DIRECTORY,
    retainAcrossRestarts: true,
    maxBatchBytes: ATTACHMENT_MAX_BATCH_BYTES,
  });
  // Registered ahead of `express.json()` in spirit (see `attachments.ts`'s own "mount before any
  // global body parser" note) even though call order here is necessarily after it (`express.json()`
  // is synchronous module-scope code above; this file's own body-parser-skip behavior for a
  // non-JSON `content-type` is what actually protects the upload route — see
  // `src/server/modules/assistant.ts#forwardAttachmentUpload`'s doc for the full trace of why an
  // `application/octet-stream` POST survives `express.json()` regardless of registration order).
  registerAttachmentRoutes(
    app,
    {
      store: attachmentStore,
      // The trusted-downstream-of-the-bearer-gate header `forwardAttachmentUpload`
      // (`server/runtime/composition/modules/assistant.ts`) now stamps from the uploading admin's
      // OWN session — see that function's doc. This is what `chat_list_pending_attachments`
      // (`list-pending-chat-attachments.ts`) scopes its listing by.
      resolveOwnerId: (req) => req.get(RUN_PRINCIPAL_HEADER) ?? undefined,
      // Without this, `@jini-ai/http-kit`'s own default (20 MB) silently undercuts
      // `TOVU_MAX_UPLOAD_BYTES` for the one media path that reaches it (a chat attachment promoted
      // to the library, `promote-chat-attachment.ts`) — this route's hard, streaming-enforced byte
      // cap, not just the client's own pre-check (`AssistantDock.hooks.tsx`'s
      // `useAttachmentUploader`, which must independently match this so a rejection surfaces before
      // the bytes are ever sent, not just after).
      maxAttachmentBytes: TOVU_MAX_UPLOAD_BYTES,
    },
    adapter,
  );

  const server = app.listen(port, "127.0.0.1", () => {
    if (!isDaemonLifecycleLogQuiet()) console.log(`[agent-daemon] listening on ${daemonUrl}`);
  });

  /**
   * Without this, a bind failure is an UNHANDLED `error` event on the `http.Server` `app.listen()`
   * returns — Node has no default listener for that, so it rethrows as an uncaught exception: the
   * process still crashes, but with a generic stack trace and Node's default exit code `1`, giving
   * `index.ts`'s `child.on("exit", ...)` nothing to report beyond "exited unexpectedly (code 1)".
   * That is exactly the "reads like unexplained flake" shape this repo's own e2e history spent
   * three sessions chasing (`ADS-memory/reports/analysis/2026-08-05-symmetric-watchdog.md`).
   *
   * `EADDRINUSE` gets its own distinct exit code (`AGENT_DAEMON_EXIT_CODE.PORT_IN_USE`, shared with
   * `index.ts` via `daemon-exit-codes.ts`) specifically so the parent can report the real reason —
   * "address already in use" — instead of a number it has to guess at. Any OTHER bind error (e.g. a
   * permissions failure on a privileged port) still exits non-zero, just without the specific code,
   * since it is not the failure mode this repo has actually hit.
   */
  server.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(`[agent-daemon] could not bind 127.0.0.1:${port} — address already in use`);
      process.exit(AGENT_DAEMON_EXIT_CODE.PORT_IN_USE);
      return;
    }
    console.error(`[agent-daemon] failed to bind 127.0.0.1:${port}`, error);
    process.exit(1);
  });
}

void start();
