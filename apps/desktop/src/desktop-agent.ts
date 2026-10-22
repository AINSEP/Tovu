import { AsyncLocalStorage } from "node:async_hooks";
import { readLoginShellEnvironment } from "@jini-ai/platform/child-environment";
/**
 * @file The desktop app's ONE chat agent: a co-located Jini daemon living in Electron's main process.
 *
 * SPEC-051 REQ-01/REQ-10 and the owner's 2026-10-06 design: one agent for the whole app, never one
 * per site and never tied to a site. Sites keep hosting and executing their own tools; no agent loop
 * runs inside a site for this chat.
 *
 * What is assembled here, all from `@jini-ai/daemon`, none of it re-implemented:
 * - a `RunLifecycle` over an in-memory event log — the IPC layer (`workspace-chat-ipc.ts`) streams,
 *   reattaches, cancels and reads status straight off it;
 * - a `ToolRegistry` + `ToolExecutor` holding `desktop.*` and the `site.*` pair (`desktop-agent-tools.ts`);
 * - an `AgentExecutor` that spawns the operator's chosen agent CLI with Jini's own `jini-mcp` bridge
 *   injected, so the CLI reaches those tools through `search_tools`/`execute_delegated_tool`;
 * - a loopback-only HTTP server carrying exactly the routes that bridge calls back on (tool catalog +
 *   delegated tool calls), every request gated by a run-scoped bearer credential.
 *
 * Why HTTP at all, inside one process: the bridge is a separate child the CLI spawns, and its only
 * way back is the daemon URL it is handed. The listener binds 127.0.0.1 on an ephemeral port, and a
 * credential is valid only while its run is live — the same two properties the site daemon's own
 * delegated route rests on (`run-scoped-credential.ts` there).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Principal, ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";
import type { NativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle, createToolExecutor, type AgentExecutor, type RunLifecycle } from "@jini-ai/daemon";
import { registerDelegatedToolRoutes, registerToolCatalogRoutes, type ToolCatalogQuery } from "@jini-ai/daemon/http";
import { createNodeCredentialCrypto, createRunScopedCredentials, type RunScopedCredentials } from "@jini-ai/daemon/run-credentials";
import type { TurnAddressee } from "./desktop-agent-tools.ts";
import { createToolGapCollector, type ToolGapEntry } from "@jini-ai/daemon/tool-audit";
import { redactSecretShapes } from "../../website/src/contracts/core/secret-redaction.ts";
import { assistantCliPermissions, type AssistantCliPermissions } from "../../website/src/contracts/headless/assistant-subagents-policy.ts";
import { resolveFullCliAccess, resolveAssistantCliPermissions, isHostedAssistantRuntime, TOOLS_FIRST_RULE, resolveAssistantDisallowedTools } from "../../website/src/contracts/core/assistant-native-fallbacks.ts";
import { createConversationStore, type ConversationStore } from "./workspace-conversation-store.ts";

/** The one identity every desktop-agent tool call acts as: the local operator. */
const DESKTOP_OPERATOR: Principal = Object.freeze({ id: "desktop-operator", roles: Object.freeze(["owner"]) });

/** Every run this agent starts carries this context ref — one conversation surface, app-wide. */
const DESKTOP_CHAT_CONTEXT_REF = "desktop-chat";

/** The routes `jini-mcp` calls back on. Everything else on this listener 404s. */
const DELEGATED_TOOL_CALLS_PATH = "/api/delegated-tool-calls";

/** One turn's input, as the IPC layer receives it from the pane. */
interface DesktopTurnInput {
  prompt: string;
  agentId: string;
}

/** Optional per-turn fields. `addressee` is captured ONCE here, at turn start (REQ-05). */
interface DesktopTurnOptions {
  chatId?: string;
  model?: string;
  reasoning?: string;
  addressee?: TurnAddressee | null;
  attachmentPaths?: readonly string[];
}

interface DesktopAgentRuntime {
  readonly lifecycle: RunLifecycle;
  readonly daemonUrl: string;
  /** The site a live run was started against, or `null`. Exposed for the tools and for tests. */
  addresseeOf(runId: string): TurnAddressee | null;
  /** Ids of every registered tool — the set the agent receives (desktop.* + site.* entry points). */
  toolIds(): readonly string[];
  startTurn(required: DesktopTurnInput, optional?: DesktopTurnOptions): Promise<{ runId: string }>;
  close(): Promise<void>;
}

interface DesktopAgentRuntimeRequired {
  /** App-owned runtime shared with inventory; the app disposes it after stopping chat. */
  agentRuntime: NativeAgentRuntime;
  /** The agent CLI's working directory; created if missing. Lives under the app's userData. */
  workDir: string;
  /** Builds the tool table; handed the runtime's own per-run addressee lookup. */
  buildTools: (ports: { addresseeOf: (runId: string) => TurnAddressee | null }) => ToolRegistration[];
}

interface DesktopAgentRuntimeOptions {
  readLoginShellEnvironment?: typeof readLoginShellEnvironment;
  readFullCliAccess?: (required: { addressee: TurnAddressee | null }, optional?: {}) => Promise<boolean | AssistantCliPermissions>;
  toolGapStore?: Pick<ConversationStore, "appendToolGap" | "listToolGaps">;
  /** Test seam: a fake executor so no real CLI is spawned. */
  createAgentExecutor?: (...args: Parameters<typeof createAgentExecutor>) => Pick<AgentExecutor, "run">;
  /** Test seam: the `jini-mcp` entry script. Defaults to the installed `@jini-ai/mcp`'s `bin/serve.js`. */
  mcpServeScript?: string;
  log?: Pick<Console, "error" | "warn">;
}

/**
 * `tool_gaps_list`'s policy: the tool-gap audit is the operator's own record, so only the desktop
 * operator may read it. Every call this runtime routes today resolves to that operator, so the deny
 * arm is defense in depth for any future caller that resolves a different principal.
 * @complexity O(1).
 */
function authorizeOperatorOnly({ principal }: { principal: { id: string } }): "allow" | "deny" {
  return principal.id === DESKTOP_OPERATOR.id ? "allow" : "deny";
}

/**
 * The system overlay every desktop turn carries: who the agent is and how it reaches its tools.
 * Static on purpose — per-turn site context travels in the prompt itself ({@link turnPrompt}).
 */
const DESKTOP_SYSTEM_OVERLAY = [
  "You are the Tovu desktop assistant: one assistant for the operator's whole Tovu desktop app and every website in it.",
  "Your tools are Jini tools reached through the `jini` MCP server: find them with search_tools, read one with describe_tool, run one with execute_delegated_tool.",
  "desktop.* tools act on the desktop app itself (list websites, add an existing one, reveal a folder, switch screens).",
  "site.list_tools and site.call_tool act on the website that was on screen when the current message was sent — and only that one.",
  TOOLS_FIRST_RULE,
].join("\n");

/**
 * The turn's prompt: the pane's flattened transcript, prefixed with which site (if any) is on
 * screen for THIS turn. Pure.
 * @complexity O(n) in the prompt length.
 */
function turnPrompt(prompt: string, addressee: TurnAddressee | null): string {
  const scope = addressee === null
    ? "[Desktop context] No website is on screen. Only desktop.* tools apply this turn."
    : `[Desktop context] On screen: the website "${addressee.name}" (${addressee.siteDir}). site.list_tools / site.call_tool reach it this turn.`;
  return `${scope}\n\n${prompt}`;
}

/**
 * The bearer token a `jini-mcp` child presents, from `Authorization: Bearer <token>`. Pure.
 * @complexity O(n) in the header length.
 */
function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

type AuthDecision = { allowed: true } | { allowed: false; status: 401 | 403; error: string };

/**
 * Deny-by-default gate for every request on the loopback listener. A request passes only with a
 * credential minted for a run that is still live; a delegated tool call must additionally name THAT
 * run in its body, so one run's bridge can never act as another's. Pure, so every branch is tested
 * directly.
 * @complexity O(1) plus the credential lookup.
 */
function authorizeBridgeRequest(
  request: { path: string; authorization: string | undefined; body: unknown },
  credentials: Pick<RunScopedCredentials, "resolveCaller">,
): AuthDecision {
  const token = bearerToken(request.authorization);
  if (token === undefined) return { allowed: false, status: 401, error: "missing bearer credential" };
  const caller = credentials.resolveCaller({ token });
  if (caller === undefined) return { allowed: false, status: 401, error: "credential is not valid for any live run" };
  if (request.path === DELEGATED_TOOL_CALLS_PATH) {
    const bodyRunId = (request.body as { runId?: unknown } | null)?.runId;
    if (bodyRunId !== caller.runId) return { allowed: false, status: 403, error: "credential belongs to a different run" };
  }
  return { allowed: true };
}

/**
 * The tool catalog `search_tools`/`describe_tool` read, over the registry's descriptors. Substring
 * scoring on id + description; the registry is a few dozen tools, so a linear scan is the index.
 * @complexity O(n) per search in the tool count.
 */
function registryCatalog(registry: ToolRegistry): ToolCatalogQuery {
  const entries = (): readonly ToolDescriptor[] => registry.list({});
  return {
    search: ({ query }, optional) => {
      const terms = query.toLowerCase().split(/\s+/).filter((term) => term !== "");
      const scored = entries().map((descriptor) => {
        const haystack = `${descriptor.id} ${descriptor.description ?? ""}`.toLowerCase();
        const score = terms.length === 0 ? 1 : terms.filter((term) => haystack.includes(term)).length;
        return { id: descriptor.id, description: descriptor.description ?? "", source: "desktop", score };
      });
      return scored.filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, optional?.limit ?? 20);
    },
    describe: ({ id }) => {
      const descriptor = entries().find((entry) => entry.id === id);
      if (descriptor === undefined) return null;
      return { id: descriptor.id, description: descriptor.description ?? "", source: "desktop", ...(descriptor.inputSchema === undefined ? {} : { inputSchema: descriptor.inputSchema }) };
    },
  };
}

/**
 * `createToolRegistry` from the SAME `@jini-ai/core` copy `@jini-ai/daemon` resolves — not this app's.
 *
 * Load-bearing: the daemon's `ToolExecutor` authorizes through `@jini-ai/core/composition`, which
 * keeps each registry's entries in module-private state keyed by registry instance. `apps/desktop`
 * pins its own, older `@jini-ai/core` (0.4.0) while the daemon resolves the workspace's (0.4.1), so a
 * registry built from this app's copy is a different module's object: `has()` answers yes and the
 * executor then crashes destructuring an `undefined` authorization (caught live, first test run).
 * Resolving core FROM the daemon's own location keeps both on one module instance.
 * @complexity O(1) — one module resolution and import.
 */
async function loadDaemonToolRegistryFactory(): Promise<(required: Record<string, never>) => ToolRegistry> {
  const daemonEntry = fileURLToPath(import.meta.resolve("@jini-ai/daemon"));
  const corePath = createRequire(daemonEntry).resolve("@jini-ai/core");
  const core = await import(pathToFileURL(corePath).href) as { createToolRegistry: (required: Record<string, never>) => ToolRegistry };
  return core.createToolRegistry;
}

/** Binds the listener on loopback with an ephemeral port. @complexity O(1). */
function listenOnLoopback(app: express.Express): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
    server.once("error", reject);
  });
}

/** `@jini-ai/mcp`'s `bin/serve.js`, resolved from this app's own dependency tree. @complexity O(1). */
function defaultMcpServeScript(): string {
  const entry = fileURLToPath(import.meta.resolve("@jini-ai/mcp"));
  return path.join(path.dirname(entry), "bin", "serve.js");
}

/**
 * The production executor: Jini's own, with the `jini-mcp` bridge injected per run. Inside Electron
 * `execPath` is the app binary, which boots a GUI unless `ELECTRON_RUN_AS_NODE` is set — and Jini's
 * agent env allowlist strips this process's own copy before the CLI spawns the bridge, so it must
 * travel on the bridge entry itself (same fix as the site daemon's `mcp-injection.ts`, 2026-10-01).
 * @param ports The lifecycle, bridge credentials and app-owned Jini runtime.
 * @param optional Bridge script and injectable executor factory.
 * @returns The executor bound to the same runtime as desktop detection. @complexity O(1).
 * @example defaultAgentExecutor({ lifecycle, daemonUrl, credentials, agentRuntime });
 */
function defaultAgentExecutor(
  ports: { lifecycle: RunLifecycle; daemonUrl: string; credentials: RunScopedCredentials; agentRuntime: NativeAgentRuntime; fullCliContext: AsyncLocalStorage<boolean> },
  optional: Pick<DesktopAgentRuntimeOptions, "mcpServeScript" | "createAgentExecutor"> = {},
): Pick<AgentExecutor, "run"> {
  const runtime = ports.agentRuntime;
  return (optional.createAgentExecutor ?? createAgentExecutor)({ lifecycle: ports.lifecycle }, {
    getAgentDef: runtime.getAgentDef,
    resolveAgentLaunch: runtime.resolveAgentLaunch,
    runtimeState: runtime.state,
    hostEnv: runtime.hostEnv,
    codexDisablePlugins: runtime.codexDisablePlugins,
    piGracefulShutdownMs: runtime.piGracefulShutdownMs,
    mcpJsonInjection: {
      command: process.execPath,
      args: [optional.mcpServeScript ?? defaultMcpServeScript()],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      daemonUrl: ports.daemonUrl,
      credential: ({ runId }) => ports.credentials.mint({ runId }),
    },
    promptAugmenter: {
      contextKinds: () => [],
      augmentUserRequest: ({ basePrompt }: { basePrompt: string }) => basePrompt,
      systemOverlay: () => ports.fullCliContext.getStore() ? DESKTOP_SYSTEM_OVERLAY : DESKTOP_SYSTEM_OVERLAY.replace(TOOLS_FIRST_RULE, "Native shell/file tools, agents and workflows are unavailable for this chat. Use the registered catalog tools."),
    },
    // Same reason as the site daemon: an isolated CLAUDE_CONFIG_DIR loses the operator's Keychain
    // login on macOS and every run fails "Not logged in". See `agent-daemon-server.ts`'s own note.
    claudeConfigDirIsolationEnabled: false,
  } as Parameters<typeof createAgentExecutor>[1]);
}

/**
 * Resolves the desktop turn's access snapshot before any run is created, using the shared policy.
 * @param required The captured site addressee and the app-owned runtime's host environment.
 * @param optional Fresh settings and login-shell readers; failures reject the turn unchanged.
 * @returns Native capabilities, their aggregate grant, and the optional login environment.
 * @complexity O(1) policy work plus the login reader's bounded process and environment copy.
 * @example await resolveDesktopTurnAccess({ addressee: null, hostEnv: runtime.hostEnv }, readers);
 */
async function resolveDesktopTurnAccess(
  required: { addressee: TurnAddressee | null; hostEnv: NativeAgentRuntime["hostEnv"] },
  optional: Pick<DesktopAgentRuntimeOptions, "readFullCliAccess" | "readLoginShellEnvironment"> = {},
): Promise<{
  nativeCapabilities: AssistantCliPermissions["capabilities"];
  nativeToolAccess: boolean;
  parityEnv: Record<string, string> | undefined;
}> {
  const setting = resolveFullCliAccess({ isOwner: true, env: required.hostEnv }, {})
    ? await optional.readFullCliAccess?.({ addressee: required.addressee }, {}) : false;
  const settings = typeof setting === "object" ? setting : assistantCliPermissions({ enabled: setting ?? true });
  const { capabilities: nativeCapabilities } = resolveAssistantCliPermissions({ isOwner: true, env: required.hostEnv, settings });
  const nativeToolAccess = Object.values(nativeCapabilities).some(Boolean);
  const parityEnv = nativeCapabilities.loginEnvironment ? await (optional.readLoginShellEnvironment ?? readLoginShellEnvironment)({ baseEnv: required.hostEnv,
    excludedPrefixes: ["TOVU_", "JINI_"], excludedKeys: ["DATABASE_URL"], excludedSuffixes: ["_ROOT_KEY"] }, {}) : undefined;
  return { nativeCapabilities, nativeToolAccess, parityEnv };
}

/**
 * Builds and starts the desktop agent. Resolves once the loopback listener is bound.
 *
 * @param required `workDir` (the CLI's cwd), `buildTools`, and the app-owned `agentRuntime`.
 * @param optional test seams and a logger.
 * @returns the runtime handle; `close()` stops the listener.
 * @complexity O(n) in the tool count at startup.
 */
async function createDesktopAgentRuntime(
  required: DesktopAgentRuntimeRequired,
  optional: DesktopAgentRuntimeOptions = {},
): Promise<DesktopAgentRuntime> {
  const log = optional.log ?? console;
  fs.mkdirSync(required.workDir, { recursive: true });

  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  /** Live runs only — deleted on terminal, which is what expires their bridge credentials. */
  const liveRuns = new Map<string, { addressee: TurnAddressee | null }>();
  const addresseeOf = (runId: string) => liveRuns.get(runId)?.addressee ?? null;
  const credentials = createRunScopedCredentials({
    principalOfLiveRun: ({ runId }) => (liveRuns.has(runId) ? DESKTOP_OPERATOR.id : undefined),
    crypto: createNodeCredentialCrypto({}),
  });

  const registry = (await loadDaemonToolRegistryFactory())({});
  for (const registration of required.buildTools({ addresseeOf })) registry.register(registration);
  const gapStore = optional.toolGapStore ?? createConversationStore({ filePath: path.join(required.workDir, '..', 'desktop-chat-conversations.json') });
  const gapCollectors = new Set<ReturnType<typeof createToolGapCollector>>();
  registry.register({
    descriptor: { id: 'tool_gaps_list', readOnly: true,
      description: 'List recent owner tool gaps and native tool use (type tool_gap or native_tool_used): Bash, file edits, agents, workflows and external MCP, with time, site, chat id, provider, tool, redacted command/path summary and Tool gap line if present. Read-only.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    policy: { authorize: authorizeOperatorOnly },
    handler: async () => ({ entries: gapStore.listToolGaps({}, {}) }),
  });
  const toolExecutor = createToolExecutor({ registry });

  const app = express();
  app.use(express.json({ limit: "4mb" }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const decision = authorizeBridgeRequest({ path: req.path, authorization: req.header("authorization"), body: req.body }, credentials);
    if (decision.allowed) return next();
    res.status(decision.status).json({ error: decision.error });
  });
  const adapter = { resolvedPortRef: { current: 0 }, env: required.agentRuntime.hostEnv, allowedOriginsEnvVar: "JINI_ALLOWED_ORIGINS", webPortEnvVar: "JINI_WEB_PORT", bindHostEnvVar: "JINI_BIND_HOST" };
  registerToolCatalogRoutes({ app, deps: { catalog: registryCatalog(registry) }, adapter });
  registerDelegatedToolRoutes({
    app,
    deps: { lifecycle, toolExecutor, toolRegistry: registry, resolvePrincipal: () => DESKTOP_OPERATOR },
    adapter,
  });
  const { server, url: daemonUrl } = await listenOnLoopback(app);
  adapter.resolvedPortRef.current = (server.address() as AddressInfo).port;

  const fullCliContext = new AsyncLocalStorage<boolean>();
  const executor = defaultAgentExecutor({ lifecycle, daemonUrl, credentials, agentRuntime: required.agentRuntime, fullCliContext }, optional);

  async function startTurn(input: DesktopTurnInput, options: DesktopTurnOptions = {}): Promise<{ runId: string }> {
    const addressee = options.addressee ?? null;
    const { nativeCapabilities, nativeToolAccess, parityEnv } = await resolveDesktopTurnAccess({ addressee, hostEnv: required.agentRuntime.hostEnv }, optional);
    const { run } = await lifecycle.start({ contextRef: DESKTOP_CHAT_CONTEXT_REF }, { agentId: input.agentId });
    liveRuns.set(run.id, { addressee });
    void lifecycle.waitForTerminal({ runId: run.id }).finally(() => {
      liveRuns.delete(run.id);
      credentials.revoke({ runId: run.id });
    });
    const attachments = options.attachmentPaths ?? [];
    const gaps = createToolGapCollector({
      sink: { append: async (_event, detail = {}) => {
        if (detail.detail) gapStore.appendToolGap({ entry: JSON.parse(detail.detail) as ToolGapEntry }, {});
      } },
      workspaceId: DESKTOP_CHAT_CONTEXT_REF, principalId: DESKTOP_OPERATOR.id,
      site: addressee?.siteDir ?? 'desktop', chatId: options.chatId ?? run.id,
      runId: run.id, provider: input.agentId, redact: text => redactSecretShapes({ text }).text,
    }, { onError: () => log.error('[tool-gaps] desktop audit write failed') });
    gapCollectors.add(gaps);
    void lifecycle.waitForTerminal({ runId: run.id }).then(() => gaps.flush()).finally(() => gapCollectors.delete(gaps));
    await lifecycle.stream({ runId: run.id, onEvent: event => gaps.observe({ event }, {}) });
    void fullCliContext.run(nativeToolAccess, () => executor.run(
      { runId: run.id, agentId: input.agentId, prompt: turnPrompt(input.prompt, addressee), cwd: nativeToolAccess ? addressee?.siteDir ?? required.workDir : required.workDir },
      {
        permissionMode: isHostedAssistantRuntime({ env: required.agentRuntime.hostEnv }, {}) ? 'restricted' : 'bypass',
        nativeToolAccess,
        nativeCapabilities,
        cliParity: nativeToolAccess,
        ...(parityEnv ? { env: parityEnv } : {}),
        disallowedTools: resolveAssistantDisallowedTools({ nativeToolAccess }, {}),
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
        ...(attachments.length === 0 ? {} : { imagePaths: attachments, extraAllowedDirs: [...new Set(attachments.map((file) => path.dirname(file)))] }),
      },
    )).catch(async (error: unknown) => {
      // `AgentExecutor.run()` terminalizes the run itself on every failure it knows about; this only
      // covers a rejection before that, so the run (and its credential) never stays live forever.
      log.error(`[desktop-agent] run ${run.id} failed to start`, error);
      const status = await lifecycle.get({ runId: run.id });
      if (status !== undefined && (status.state === "queued" || status.state === "starting" || status.state === "running")) {
        await lifecycle.emit({ runId: run.id, input: { event: "error", data: { message: "The desktop assistant could not start this turn." } } }).catch(() => undefined);
        await lifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false }).catch(() => undefined);
      }
    });
    return { runId: run.id };
  }

  return {
    lifecycle,
    daemonUrl,
    addresseeOf,
    toolIds: () => registry.list({}).map((descriptor) => descriptor.id),
    startTurn,
    close: async () => {
      await Promise.all([...gapCollectors].map(collector => collector.flush()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export { createDesktopAgentRuntime, resolveDesktopTurnAccess, authorizeBridgeRequest, authorizeOperatorOnly, bearerToken, registryCatalog, turnPrompt, DESKTOP_OPERATOR, DESKTOP_SYSTEM_OVERLAY, DELEGATED_TOOL_CALLS_PATH };
export type { DesktopAgentRuntime, DesktopAgentRuntimeOptions, DesktopAgentRuntimeRequired, DesktopTurnInput, DesktopTurnOptions };
