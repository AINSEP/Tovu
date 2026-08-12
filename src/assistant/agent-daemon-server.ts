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
 * `src/index.ts`'s `main()` and inherited by this process through `spawnAgentDaemon()`'s
 * `child_process.spawn`; `src/server/modules/assistant.ts`'s proxy is the only caller that holds
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
import path from "node:path";

import express from "express";

import { createToolRegistry } from "@jini-ai/core";
import type { Principal } from "@jini-ai/core";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
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

import { registerSupabaseMcpPreset } from "../features/plugins/supabase-mcp/supabase-mcp-plugin";
import { createInMemoryToolAttemptAuditSink } from "../features/tool-audit/repo.memory";
import { SqliteToolAttemptAuditSink } from "../features/tool-audit/repo.sqlite";
import { openContentDb } from "../db/sqlite/content-db";
import { createRouteDeps } from "../server/app";
import { createSqliteRouteDepsForWorkspace, defaultContentDbPath } from "../server/deps";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/core/rate-limit/rate-limit";
import { resolveRuntimeMode } from "../server/runtime-mode";
import { listAssistantAgents, rescanAssistantAgents } from "./agents";
import { createCustomInstructionsCache } from "./custom-instructions";
import { DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "./daemon-auth";
import { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes";
import { FRONTEND_CONTROL_CAPABILITIES } from "./frontend-control-capabilities";
import { attachFederatedMcpTools } from "./mcp-federation/bootstrap";
import type { ResolvedFederatedConnection } from "./mcp-federation/config";
import { readEnabledExternalMcpConfigs, toResolvedFederatedConnections } from "./external-mcp-store";
import { registerA2uiActionsRoute } from "./a2ui-actions-route";
import { registerMcpUiToolCallsRoute } from "./mcp-ui-tool-calls-route";
import { resolveMcpJsonInjection } from "./mcp-injection";
import { createOwnedRunListHandler, createRunOwnerRegistry, requireRunOwnership } from "./run-ownership";
import { parseRunStartContextRef } from "./run-start-context";
import { buildComponentCatalogQuery } from "./component-catalog-query";
import { buildToolCatalogQuery } from "./tool-catalog-query";
import { withToolAttemptAudit } from "./tool-executor-audit";
import { buildAssistantToolRegistrations } from "./tool-registrations";
import { createSurfaceExchangeStore } from "./surface-exchanges";

const port = Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319);
const daemonUrl = `http://127.0.0.1:${port}`;
const DEFAULT_AGENT_ID = "claude";

/**
 * Self-termination watchdog, 2026-08-05 (`ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`).
 *
 * `src/index.ts`'s `spawnAgentDaemon()` puts this process in its own detached process group
 * specifically so it CAN be reaped independently (see that function's own comment) — but that
 * only works if `src/index.ts` gets a chance to run its `reap()`. Confirmed live, twice, two
 * different ways: Playwright's default `webServer` teardown skips straight to an uncatchable
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
 * Why the OS's own `process.ppid` cannot be that signal: `spawnAgentDaemon()`'s dev-mode spawn is
 * a 3-hop `npx -> tsx -> node` chain, and confirmed live via `ps` that none of those three
 * exec-replaces itself — all three stay alive for the whole run. This process's actual `ppid`
 * therefore resolves to the middle `tsx` hop, not to `src/index.ts`'s own process, so watching
 * `ppid` would watch the wrong ancestor. `spawnAgentDaemon()` instead passes the true one
 * explicitly via `TOVU_PARENT_PID`.
 *
 * Opt-in by construction, not by a feature flag: `TOVU_PARENT_PID` is set by exactly one caller
 * (`spawnAgentDaemon()` — confirmed the only spawner of this file). A manual/standalone boot of
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

/**
 * Root directory the chat composer's staged image/file uploads land in before a run claims them
 * (`@jini-ai/http-kit`'s `createDiskAttachmentStore`) — deliberately NOT `process.cwd()`.
 *
 * `TOVU_CONTENT_DB`/`TOVU_MEDIA_UPLOADS_DIR` are this process's own precedent for "resolve against
 * an explicit env var, falling back to something derived rather than a bare `process.cwd()`", and
 * this follows the same shape with its own override (`TOVU_CHAT_ATTACHMENTS_DIR`). It is
 * deliberately NOT anchored the way `mediaUploadsDir()` is (`server/deps.ts` — `TOVU_MEDIA_UPLOADS_DIR
 * ?? join(process.cwd(), "infra", "uploads")`): that fallback is itself `process.cwd()`-relative
 * and this process's own `process.cwd()` is not provably the site install dir (this daemon is a
 * `spawn()` child of `src/index.ts`, inheriting whatever cwd THAT process happened to have — see
 * that file's module doc). Anchoring to `dirname(defaultContentDbPath())`
 * instead ties this to the SAME directory the daemon's own `content.db` connection already resolves
 * against, which is the strongest "the daemon process agrees this is the site's home" signal
 * available here without adding a new resolution path this process doesn't already have.
 *
 * Residual, disclosed rather than silently assumed safe: unlike `cli/commands/serve.ts`'s
 * `resolveInstallDirTarget()`-based boot path (which `serve-command.integration.test.ts`'s CR-R01
 * case exercises under a foreign cwd), this daemon process is never spawned by that CLI path at all
 * — it only exists under `src/index.ts`'s env-var-driven boot, which that regression test does not
 * cover. No foreign-cwd assertion protects this constant specifically; an operator who needs a
 * guaranteed location should set `TOVU_CHAT_ATTACHMENTS_DIR` explicitly, same as
 * `TOVU_CONTENT_DB`/`TOVU_MEDIA_UPLOADS_DIR` today.
 */
const ATTACHMENT_UPLOAD_DIRECTORY =
  process.env.TOVU_CHAT_ATTACHMENTS_DIR ?? path.join(path.dirname(defaultContentDbPath()), "uploads", "chat-attachments");

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
// `deps.workspaceId` (`index.ts`'s `spawnAgentDaemon()` sets it from the SAME value used to build
// its own route deps) — binding this process to that exact workspace instead of letting it
// independently re-resolve `resolveWorkspace`'s default. Irrelevant in memory mode: each process
// gets its own disconnected in-memory store regardless (see module doc above), so there is no
// second process to agree with.
const routeDeps =
  process.env.TOVU_DB === "memory" ? createRouteDeps() : createSqliteRouteDepsForWorkspace(process.env.TOVU_WORKSPACE);

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

const registry = createToolRegistry();
for (const registration of buildAssistantToolRegistrations(
  { ...routeDeps, magicLinkPerEmailLimiter },
  { surfaceExchanges },
)) {
  registry.register(registration);
}

/**
 * Agent-driven control of the admin's own browser tab and chat pane — `page.navigate`,
 * `page.scroll_to`, `page.find_elements`, `chat.send_message`, and the rest of
 * {@link FRONTEND_CONTROL_CAPABILITIES} (`page.*` plus six of `chat.*`'s seven verbs;
 * `chat.reset_conversation` is deliberately excluded — see that module's own doc for why).
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
for (const registration of frontendControl.toolRegistrations) {
  registry.register(registration);
}
// Wrapped, not bare: `@jini-ai/daemon`'s executor keeps its audit records in an in-process `Map`
// and mints them only AFTER authorization resolves, so an unknown tool id or a throwing
// authorization leaves no trace at all, and everything else is lost on restart. The decorator
// appends a `requested` row before delegating, which is the only ordering under which those cases
// are recorded. Audit is observation — a sink failure can never change a tool call's outcome.
// See `tool-executor-audit.ts`.
// A dedicated handle rather than the one `createSqliteRouteDeps()` opened: `RouteDeps` does not
// expose its handle, and widening that widely-faked type for one writer is a worse trade than a
// second connection. `content-db.ts` already documents this shape as expected (its `busy_timeout`
// pragma exists for exactly the "another dedicated handle holds a lock" case), `migrate()` is
// idempotent, and no seed is passed so this connection creates nothing.
const auditSink =
  process.env.TOVU_DB === "memory"
    ? createInMemoryToolAttemptAuditSink()
    : new SqliteToolAttemptAuditSink(openContentDb(defaultContentDbPath()));
const toolExecutor = withToolAttemptAudit(createToolExecutor({ registry }), auditSink, { workspaceId: routeDeps.workspaceId });

/**
 * The admin Instructions tab's system-prompt seam (`core.instructions.custom`) — see
 * `custom-instructions.ts`'s module doc for why this is a refreshable cache rather than a direct
 * ledger read: `PromptAugmenter.systemOverlay()` below is called synchronously, and the cross-process
 * cache the ledger's own `getEffective` keeps would otherwise go stale forever after this process's
 * first read. `onStarted` calls `.refresh()` before every run; `assistantPromptAugmenter.
 * systemOverlay()` reads the result synchronously.
 */
const customInstructionsCache = createCustomInstructionsCache(
  { settingsRepo: routeDeps.settingsRepo, settingsReady: routeDeps.settingsUiTabsReady },
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
    const baseOverlay =
      "You are answering a live administrator's request through Tovu's own admin chat assistant, " +
      "not doing general development work on the Tovu codebase. Tovu exposes a purpose-built, " +
      "audited catalog of tools for every action that touches this site's actual content, users, " +
      "permissions, forms, database state, or configuration. For any such request: call " +
      "search_tools FIRST — phrasing the query as a description of what the tool DOES, the way its " +
      "own documentation would read (name the thing acted on plus the action, with likely synonyms), " +
      "rather than as terse keywords — then describe_tool on the top 1-3 candidates, then " +
      "execute_delegated_tool to perform the action. If none of the returned candidates fit, search " +
      "again with a higher limit (up to 25) or different phrasing before concluding no tool exists: " +
      "on a 130-case blind set the right tool is in the default top 10 98% of the time and in the " +
      "top 20 100% of the time, so a near-miss is almost always ranked just below the cutoff rather " +
      "than absent. Do this before reaching for Bash, curl, or " +
      "direct SQLite/database access — those bypass this site's authorization, risk-classification, " +
      "and audit-log guarantees entirely. Never authenticate as an administrator yourself (e.g. via " +
      "the admin login route) to perform an action a registered tool already exists for. Bash and " +
      "file access remain available for genuinely code-level questions about how Tovu itself works, " +
      "but are not a substitute for the tool catalog when the request is about this site's live " +
      "data or configuration.";
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

/** The same fact with the opposite lifetime — a finished run is still readable, so its owner must
 * stay known. See `run-ownership.ts` for why the two maps are not redundant. */
const runOwners = createRunOwnerRegistry();

const onStarted: RunStartHandler = ({ request, run, lifecycle: runLifecycle }) => {
  let prompt: string;
  let principal: Principal;
  let attachmentIds: readonly string[] = [];
  let model: string | undefined;
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
    prompt = `<<SUBAGENT_DISPATCH>>\n\n${decoded.prompt}`;
    principal = { id: decoded.principalId };
    attachmentIds = decoded.attachmentIds;
    model = decoded.model;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
    console.error(`[agent-daemon] run ${run.id}: malformed contextRef`, message);
    return;
  }

  principalByRunId.set(run.id, principal);
  runOwners.record(run.id, principal.id);
  void runLifecycle.waitForTerminal(run.id).finally(() => {
    principalByRunId.delete(run.id);
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
      let attachmentRunFields: { imagePaths?: readonly string[]; extraAllowedDirs?: readonly string[]; uploadRoot?: string } = {};
      if (attachmentIds.length > 0) {
        if (!attachmentStore) {
          // Structurally unreachable (see `attachmentStore`'s own doc) but fails only this run,
          // not the process, if it somehow is.
          void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
          console.error(`[agent-daemon] run ${run.id}: attachment claim requested before the attachment store was ready`);
          return;
        }
        try {
          // Only `.path` (the opaque capability id) is ever read by `claim()` — it looks up its own
          // internal registry by that id and re-derives `name`/`kind`/`size` from what `register()`
          // recorded at upload time, never from a caller-supplied value. The placeholder
          // `name`/`kind` below satisfy `StoredAttachment`'s shape without asserting anything the
          // store would actually trust.
          const refs: StoredAttachment[] = attachmentIds.map((id) => ({ path: id, name: "", kind: "file" }));
          const claimed = await attachmentStore.claim(refs, run.id);
          if (claimed.batchDirectory !== undefined) {
            attachmentRunFields = {
              imagePaths: claimed.attachments.filter((attachment) => attachment.kind === "image").map((attachment) => attachment.path),
              extraAllowedDirs: [claimed.batchDirectory],
              uploadRoot: claimed.batchDirectory,
            };
          }
        } catch (error) {
          // Fails the run outright rather than silently continuing without the image: the same
          // severity this handler already gives a malformed `contextRef` above. A user who attached
          // a screenshot and gets a run that never saw it (already-claimed, expired past
          // `retentionMs`, or an integrity check failure) would otherwise get a confusing answer
          // about content the agent never looked at, with nothing explaining why.
          const message = error instanceof Error ? error.message : String(error);
          void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
          console.error(`[agent-daemon] run ${run.id}: attachment claim failed`, message);
          return;
        }
      }

      await agentExecutor.run({
        runId: run.id,
        agentId: request.agentId ?? DEFAULT_AGENT_ID,
        prompt,
        cwd: process.env.TOVU_AGENT_CWD ?? process.cwd(),
        permissionMode: resolvePermissionMode(),
        ...(model !== undefined ? { model } : {}),
        ...attachmentRunFields,
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
 * `src/server/modules/assistant.ts`'s identical guard for the full rationale. */
const resolvePrincipal = (request: DelegatedToolExecuteRequest): Principal => {
  const principal = principalByRunId.get(request.runId);
  if (!principal) throw new Error(`no principal is tracked for run "${request.runId}"`);
  return principal;
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
app.use(express.json());
const adapter: AdapterContext = { resolvedPortRef: { current: port } };

// Per-run authorization, mounted between the bearer gate and the run routes it protects. The gate
// above proves the caller is Tovu's proxy; these two prove *which admin* the proxy is speaking for,
// which is the question neither the gate nor the proxy's own session check can answer. Both must
// precede `registerRunRoutes`: the middleware so it runs first, and the list handler so it shadows
// http-kit's unscoped `runListRoute` under Express's first-match-wins routing. See
// `run-ownership.ts` for the ownership model and the 404-not-403 rationale.
app.use("/api/runs/:runId", requireRunOwnership(runOwners));
app.get("/api/runs", createOwnedRunListHandler({ lifecycle, registry: runOwners }));

registerRunRoutes(app, { lifecycle, onStarted }, adapter);
// `rescanAgents` wired explicitly (not left to fall back to `listAgents`, `@jini-ai/http-kit`'s own
// default): `listAssistantAgents` is now cached (see `agents.ts`'s module doc — this file's own
// gap was the fallback silently serving the same stale cache `POST /api/agents/rescan` exists to
// bypass). `rescanAssistantAgents` is the one path that actually forces a fresh PATH probe.
registerAgentRoutes(app, { listAgents: listAssistantAgents, rescanAgents: rescanAssistantAgents }, adapter);
registerDelegatedToolRoutes(app, { lifecycle, toolExecutor, resolvePrincipal }, adapter);
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
async function resolveStoredExternalMcpConnections(): Promise<ResolvedFederatedConnection[]> {
  try {
    const { configs, failures } = await readEnabledExternalMcpConfigs(
      { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer },
      routeDeps.workspaceId,
    );
    for (const failure of failures) {
      console.warn(`[agent-daemon] mcp-federation: stored server '${failure.serverId}' skipped — ${failure.reason}`);
    }
    return toResolvedFederatedConnections(configs);
  } catch (error) {
    console.warn(
      `[agent-daemon] mcp-federation: the stored external-MCP roster could not be read, continuing without it — ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function start(): Promise<void> {
  registerSupabaseMcpPreset();

  await attachFederatedMcpTools({
    registry,
    deps: { authorize: routeDeps.authorize, workspaceId: routeDeps.workspaceId },
    extraConnections: await resolveStoredExternalMcpConnections(),
  });

  // Backs `@jini-ai/mcp`'s `search_tools`/`describe_tool` — was never mounted before 2026-07-30,
  // so both 404'd for every spawned CLI despite the registry itself being fully populated. See
  // `tool-catalog-query.ts`.
  registerToolCatalogRoutes(app, { catalog: buildToolCatalogQuery(registry) }, adapter);

  // Backs `@jini-ai/mcp`'s `search_components`/`describe_component` — same route-registration gap
  // `tool-catalog-query.ts`'s own history warns about, avoided here by mounting alongside it from
  // the start rather than adding it later. See `component-catalog-query.ts`.
  registerComponentCatalogRoutes(app, { catalog: buildComponentCatalogQuery() }, adapter);

  // `createDiskAttachmentStore` is async (it empties `uploadDirectory` on construction — see its
  // own doc), so it cannot be a module-scope `const` the way `agentExecutor`/`toolExecutor` are.
  // Assigned into the module-scope `attachmentStore` binding `onStarted` reads, and awaited here
  // — before `app.listen()` a few lines down — so no request can ever reach this process while
  // `attachmentStore` is still unset (`onStarted`'s own doc explains why that matters).
  attachmentStore = await createDiskAttachmentStore({ uploadDirectory: ATTACHMENT_UPLOAD_DIRECTORY });
  // Registered ahead of `express.json()` in spirit (see `attachments.ts`'s own "mount before any
  // global body parser" note) even though call order here is necessarily after it (`express.json()`
  // is synchronous module-scope code above; this file's own body-parser-skip behavior for a
  // non-JSON `content-type` is what actually protects the upload route — see
  // `src/server/modules/assistant.ts#forwardAttachmentUpload`'s doc for the full trace of why an
  // `application/octet-stream` POST survives `express.json()` regardless of registration order).
  registerAttachmentRoutes(app, { store: attachmentStore }, adapter);

  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`[agent-daemon] listening on ${daemonUrl}`);
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
