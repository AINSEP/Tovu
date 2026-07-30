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
import express from "express";

import { createToolRegistry } from "@jini-ai/core";
import type { Principal } from "@jini-ai/core";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { registerAgentRoutes, registerDelegatedToolRoutes, registerRunRoutes, registerToolCatalogRoutes } from "@jini-ai/http-kit";
import type { AdapterContext, DelegatedToolExecuteRequest, RunStartHandler } from "@jini-ai/http-kit";

import { createInMemoryToolAttemptAuditSink } from "../features/tool-audit/repo.memory";
import { SqliteToolAttemptAuditSink } from "../features/tool-audit/repo.sqlite";
import { openContentDb } from "../infra/sqlite/content-db";
import { createRouteDeps } from "../server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "../server/deps";
import { listAssistantAgents } from "./agents";
import { DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "./daemon-auth";
import { resolveMcpJsonInjection } from "./mcp-injection";
import { createOwnedRunListHandler, createRunOwnerRegistry, requireRunOwnership } from "./run-ownership";
import { buildToolCatalogQuery } from "./tool-catalog-query";
import { withToolAttemptAudit } from "./tool-executor-audit";
import { buildAssistantToolRegistrations } from "./tool-registrations";

const port = Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319);
const daemonUrl = `http://127.0.0.1:${port}`;
const DEFAULT_AGENT_ID = "claude";

function resolvePermissionMode(): "bypass" | "restricted" {
  return process.env.TOVU_AGENT_PERMISSION_MODE === "bypass" ? "bypass" : "restricted";
}

// Mirrors `src/index.ts`'s own `useMemory` branch exactly — see this file's module doc on why
// memory mode gives this process a disconnected store rather than sharing Tovu's.
const routeDeps = process.env.TOVU_DB === "memory" ? createRouteDeps() : createSqliteRouteDeps();

const eventLog = createInMemoryEventLog();
const lifecycle = createRunLifecycle({ eventLog });
lifecycle.rehydrate().catch((error: unknown) => {
  console.error("[agent-daemon] lifecycle.rehydrate() failed", error);
});

const registry = createToolRegistry();
for (const registration of buildAssistantToolRegistrations(routeDeps)) {
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

const agentExecutor = createAgentExecutor({
  lifecycle,
  mcpJsonInjection: resolveMcpJsonInjection(daemonUrl),
});

/** Populated by `onStarted`, read by `resolveDelegatedPrincipal` — see module doc. Deleted on
 * terminal transition on purpose: the exempt `/api/delegated-tool-calls` route's remaining defence
 * is that a `runId` only resolves while its run is in flight (`daemon-auth.ts`). */
const principalByRunId = new Map<string, Principal>();

/** The same fact with the opposite lifetime — a finished run is still readable, so its owner must
 * stay known. See `run-ownership.ts` for why the two maps are not redundant. */
const runOwners = createRunOwnerRegistry();

const onStarted: RunStartHandler = ({ request, run, lifecycle: runLifecycle }) => {
  let prompt: string;
  let principal: Principal;
  try {
    const parsed = JSON.parse(request.contextRef) as { prompt?: unknown; principalId?: unknown };
    if (typeof parsed.prompt !== "string" || parsed.prompt.length === 0) {
      throw new Error("contextRef did not decode to a non-empty 'prompt'");
    }
    if (typeof parsed.principalId !== "string" || parsed.principalId.length === 0) {
      throw new Error("contextRef did not decode to a non-empty 'principalId'");
    }
    // `<<SUBAGENT_DISPATCH>>` is AGENTS.md's own documented marker (Mandatory Startup section,
    // detection priority 1) for "skip the whole AI-Dev-Shop startup ceremony — this is a
    // dispatched subagent receiving a task prompt, not an interactive human session." Without it,
    // every chat-pane run re-runs the full dev-tooling bootstrap (reads AGENTS.md, prints the
    // startup banner, offers to install slash commands) before touching the user's actual request
    // — confirmed live, burning real turns on a product-facing feature that has nothing to do with
    // this repo's own AI-Dev-Shop pipeline.
    prompt = `<<SUBAGENT_DISPATCH>>\n\n${parsed.prompt}`;
    principal = { id: parsed.principalId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
    console.error(`[agent-daemon] run ${run.id}: malformed contextRef`, message);
    return;
  }

  principalByRunId.set(run.id, principal);
  runOwners.record(run.id, principal.id);
  void runLifecycle.waitForTerminal(run.id).finally(() => principalByRunId.delete(run.id));

  void agentExecutor
    .run({
      runId: run.id,
      agentId: request.agentId ?? DEFAULT_AGENT_ID,
      prompt,
      cwd: process.env.TOVU_AGENT_CWD ?? process.cwd(),
      permissionMode: resolvePermissionMode(),
    })
    // `AgentExecutor.run()` already transitions the run to `'failed'` via `lifecycle.finish()` on
    // every failure path before it rejects — this catch only guards against an unhandled rejection.
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
registerAgentRoutes(app, { listAgents: listAssistantAgents }, adapter);
registerDelegatedToolRoutes(app, { lifecycle, toolExecutor, resolvePrincipal }, adapter);
// Backs `@jini-ai/mcp`'s `search_tools`/`describe_tool` — was never mounted before 2026-07-30,
// so both 404'd for every spawned CLI despite the registry itself being fully populated. See
// `tool-catalog-query.ts`.
registerToolCatalogRoutes(app, { catalog: buildToolCatalogQuery(registry) }, adapter);

app.listen(port, "127.0.0.1", () => {
  console.log(`[agent-daemon] listening on ${daemonUrl}`);
});
