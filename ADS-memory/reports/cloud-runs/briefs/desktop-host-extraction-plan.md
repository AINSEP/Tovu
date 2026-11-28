# Extraction plan — one embedded assistant host in Jini

**Extract the app-wide assistant into `@jini-ai/daemon/host`, and make it share the run-service assembly already used by Jini’s standalone daemon. Leave Tovu’s site-assistant child supervisor alone.** The embedded host owns run orchestration, the tool registry, and the authenticated MCP callback surface. Tovu and Help Me! own their server adapters, product policies, persistence bindings, and desktop lifecycles.

There is an important baseline correction. Tovu `main` contains and tests the app-wide chat composition, but Electron does not call it. The sites-home boot registers throwing runner stubs, and `renderer/App.tsx:246–265` deliberately has no workspace assistant pane. The live site assistant uses `desktop-agent-service.ts`, a separate, on-demand child supervisor. The extraction should land without changing that release behavior. A subsequent, explicit activation step below gives Tovu a single app-lifetime host without replacing the site assistant.

This plan is based on local reads of Tovu `main` (`49ba87ad`) and Jini `main` (`2c2961d5`). No files were changed, and no tests, builds, or network requests were run.

## A. Inventory and duplicate check

### What already exists in Jini

| Existing mechanism | Decision |
| --- | --- |
| `server/src/create-local-node-daemon.ts` → `compose-jini-kernel.ts` → `kernel-base.ts` | **Extend the existing assembly.** Move the registry/tool-executor pairing and agent-executor binding out of `kernel-base.ts` into daemon-owned run services. Make both the existing kernel and the embedded host use those services. Retain standalone feature activation, Express, discovery, SQLite run journals, and native-runtime ownership in `server`. The current `composeJiniKernel`, even in `security.mode: 'host'`, still takes Express. |
| `core/src/daemon.ts` `createDaemon` | Keep the existing pack/token composition used by the standalone kernel. It neither owns run execution nor provides a listening assistant host. Do not extend it with desktop or HTTP policy. |
| `daemon/src/run-credentials.ts`, `http/tool-catalog.ts`, `http/delegated-tools.ts`, `delegated-tool-bridge.ts`, `core/tool-gaps.ts` | Reuse the existing credentials, route lists, execution path, and audit collector. Extend the credential module with a **run-only** entry point sharing its bearer and caller checks. Put the delegated run-binding check on the matched route, not in a second URL classifier. |
| `registry/src/tool-catalog-builder` | Extend its existing query builder with an injected, in-memory backing store that preserves Tovu’s substring ranking. Do not ship a separate catalog implementation in the host or require SQLite for three bridge routes. |
| `agent-runtime/src/runtime-port-bindings.ts`, executor launch/ACP dispatch, and `mcp/src/bin/serve.ts` | Keep the existing runtime binding, provider adapters, ACP and stdio dispatch, and MCP executable. No second provider switch, child launcher, or tool protocol. |
| `examples/reference-desktop`, `examples/reference-web`, `examples/minimal-host`, `@jini-ai/desktop-host`, `@jini-ai/sidecar/supervisor` | The reference desktop connects to the reference web daemon. The minimal host and reference web use `createLocalNodeDaemon`. `desktop-host` owns shell surfaces, and `sidecar` owns child supervision, which Tovu already uses. None provides the required in-process, framework-neutral bridge host. |

### Tovu `apps/desktop/src`

The classifications cover the named declarations in the five requested modules. Returned methods and important closures are included with their owners.

| File and symbols | Classification and destination |
| --- | --- |
| `desktop-agent.ts:63–67` `nodeFileLock`, `nodeAtomicWriter`, `nodeProcessControl`, `desktopDaemonRuntimePorts` | **ELECTRON-SPECIFIC binding.** Use existing Node-adapter factories over platform functions and the app’s env snapshot. Inject the resulting executor ports. The implementations are already generic in Jini. |
| `:70–76` `DESKTOP_OPERATOR`, `DESKTOP_CHAT_CONTEXT_REF` | **TOVU-SPECIFIC.** Inject the frozen owner principal and opaque app context label. |
| `:76` `DELEGATED_TOOL_CALLS_PATH` | **GENERIC.** Remove the desktop literal. The existing delegated route declaration owns its path, method, and matching. |
| `:79–129` `DesktopTurnInput`, `DesktopTurnOptions`, `DesktopAgentRuntime`, `DesktopAgentRuntimeRequired`, `DesktopAgentRuntimeOptions`, `ToolGapStore` | **GENERIC shape.** Replace with the host contracts below. Parameterize scope and message type. Tovu supplies `TurnAddressee`, approved attachment inputs, and its own policy. Test-only executor substitution remains an explicit factory seam. |
| `:137` `authorizeOperatorOnly` | **GENERIC.** The audit-list registration compares against the injected principal ID. No literal desktop identity in Jini. |
| `:145–163` `DESKTOP_SYSTEM_OVERLAY`, `turnPrompt` | **TOVU-SPECIFIC.** Retain the product copy and tracked-site wording in a Tovu turn-policy binding. Inject the resulting prompt and overlay per turn. |
| `:169–199` `bearerToken`, `AuthDecision`, `authorizeBridgeRequest` | **GENERIC.** Consolidate into `daemon/run-credentials` and the existing delegated/catalog routes. Preserve the local response contract where it is intentional. |
| `:206–224` `registryCatalog` and `entries` | **GENERIC.** Put substring ranking in the registry’s in-memory catalog backend. Inject `"desktop"` as the source label and keep authored descriptions and schema visibility. |
| `:237–242` `loadDaemonToolRegistryFactory` | **GENERIC problem, workaround deleted.** Construct the registry and executor together inside daemon, with a normal static core import. No dynamic registry resolution, duplicate factory, or alias. |
| `:245–253`, `:389–412` `listenOnLoopback`, `startBridgeServer` | **SPLIT.** Express creation, body limit, origin host, dispatch, binding and socket close remain **ELECTRON-SPECIFIC binding**. Picking the bridge routes and composing their credentials/executor is **GENERIC**. |
| `:256–259`, `:272–274` `defaultMcpServeScript`, `desktopBridgeLaunch` | **ELECTRON-SPECIFIC.** The shell resolves its installed bridge entry and injects the launch spec with `ELECTRON_RUN_AS_NODE`. No Electron env key in Jini host code. |
| `:262–269` `desktopAttachmentOptions` | **TOVU-SPECIFIC boundary.** Replace raw path-to-directory promotion with trusted attachment preparation. Jini forwards existing executor attachment fields without inferring grants. |
| `:277–281` `prepareDesktopConnector` | **SPLIT.** Before-run sequencing is **GENERIC**. The runtime definition check and call to existing `installOwnedJsonAgent` bind the product’s permission, home, platform, filesystem ports, and static bridge spec. That binding stays **ELECTRON-SPECIFIC**. |
| `:303–326` `defaultAgentExecutor` | **SPLIT.** One executor, run credentials, and bridge envelope are **GENERIC**. Runtime binding, Claude login/isolation choice, and prompt policy are injected. Replace the `AsyncLocalStorage` overlay workaround with an explicit per-run executor field. |
| `:336–355`, `:446` `resolveDesktopTurnAccess`, `DesktopLog`, `TurnAccess` | Access resolution is **TOVU-SPECIFIC**. Keep fresh owner settings, hosted locks, env filtering, and deny-list selection. Replace the log/access types with injected diagnostics and executor-native run options. |
| `:357–369`, `:372–386` `TurnContext`, `createDesktopRegistry` | **GENERIC.** Use the shared run services and per-run state. Product tool registrations, principal, audit description, and catalog source are inputs. |
| `:415–486` `collectToolGaps`, `recoverFailedStart`, `executeTurn`, `startDesktopTurn` | **GENERIC orchestration.** Reuse lifecycle and collector. Inject policy, redaction, audit site/chat labels, and public failure copy. Keep the stream subscription and terminal cleanup under one owner. |
| `:496–535` `createDesktopAgentRuntime`, `liveRuns`, `addresseeOf`, `credentials`, `gapStore`, `reporter`, `fullCliContext`, returned `toolIds/startTurn/close` | Host lifecycle, registry, credential and scope lookup are **GENERIC**. Filesystem and process effects, reporter construction, and store are injected. Remove ALS and the implicit second conversation-store construction. Delete the file and its export lists. |
| `desktop-agent-tools.ts` `DESKTOP_TOOL_PREFIX`, `TurnAddressee`, `SiteToolSummary`, `SiteToolGateway`, `DesktopAgentToolDeps`, `OPERATOR_POLICY`, `NAVIGABLE_SECTIONS`, `sharedDesktopTools`, `navigateTool`, `noActiveSiteText`, `activeSiteTools`, `buildDesktopAgentTools`, `UNBUILT_SITE_TOOL_GATEWAY` | **TOVU-SPECIFIC.** These are tracked sites, app navigation, and the product’s shared MCP table. Inject the tool builder and give it the generic run-scope lookup. `navigate` itself is an **ELECTRON-SPECIFIC** broadcast port. Existing site tools still execute at the site. |
| `desktop-host-signals.ts` `resolveDesktopHostSignals`, `resourcesPath`, `pathExists`, `resolveSignals`, `sourceRoot`, `payload`, `bundledSourceRoot` getter | **ELECTRON-SPECIFIC binding** over **TOVU-SPECIFIC** manifests, paths, and fallback facts. Keep `@jini-ai/agent-plugins/site/host-signals` as the existing reader. Inject a signals reader and policy into the host. |
| `workspace-conversation-store.ts` `StoredConversation`, `ConversationStore`, `ConversationStorePorts`, `summarize`, `titleFrom`, `createConversationReader`, `createToolGapReader`, `createConversationStore`, `load`, `readGaps`, `save`, `locked`, `mutate` | **GENERIC.** Move the JSON transcript/audit adapter and its CRUD, upsert, locking and retention semantics. Inject file, clock, and ID ports. Keep the filename, store location, Electron channels, and Tovu notices at the shell. Delete the old file rather than forwarding its exports. |
| `desktop-agent-service.ts` `nodeAtomicWriter`, `nodeProcessControl`, `DesktopAgentServiceOptions`, `daemonOutputSink`, `buildDaemonSpawnEnv`, `daemonLaunch`, `createDaemonPorts`, `createDesktopSupervisor`, `Channel`, `Supervisor` | **ELECTRON-SPECIFIC binding for the site daemon.** Reuses Jini sidecar, process, filesystem, and diagnostics adapters already. Env allowlist, entry script, IPC handoff, stream redaction, exit classification, and parking are for Tovu’s site child. No move in this extraction. |
| Same file `assertSiteDirectory`, `siteControlRefusal`, `siteScopeKey`, `ScopedSite`, `Site`, `ServiceState`, `ServiceContext`, `SiteBinding`, `assertSiteBinding`, `hasServerExited`, `assertDemandAllowed`, `withdrawStaleBinding`, `refreshSiteHost`, `ensureSite`, `ensureSiteReady`, `demandSite`, `withdrawSite`, `ControlArgs`, `BoundSiteRequest`, `handleBoundSiteControl`, `handleSiteControl`, `handleSiteControlOrRefuse`, `stopSiteIfIdle`, `bindOwnedServer`, `createDesktopAgentService`, `DesktopAgentService` | **TOVU-SPECIFIC.** Site directory identity, boot binding, registration/withdrawal, readiness, and idle stop stay put. Nested `spawn/isReady`, `notify/dispose/setIdentity/stopIfIdle`, and returned `demand/withdraw/bindServer/shutdown` stay with that service. Its Node child wiring does not become a dependency of the embedded host. |

### Import boundaries and contract decisions

- **Express path.** `website/src/platform/express/jini-routes.ts` already wraps Jini’s Node dispatcher. Keep `mountJiniRoutes`, `daemonRouteHost`, `NO_OPERATION_TRACKING`, request facts, and reporter integration on the Tovu side. The in-place route writers, timing-safe adapter, and timers stay where they are. Reuse the existing website-shared staging mechanism for imports from Electron.
- **Composition path.** Keep `error-reporter.ts` and its diagnostics-redaction and tracker bindings in Tovu. Keep `build-constants.ts` → `build-release.ts`/`product-root` in Tovu, and reuse the generic `ErrorReporterPorts["versions"]` type. Keep `site-paths.ts` → `product-root` for bundled agent plugins, plus `bundled-contribution-sources.ts` and its retired catalog, in Tovu. No site path resolver, manifest reader, tracker, or Express code crosses into the daemon host.
- **Node and provider path.** Tovu supplies `platform/fs`, `platform/process`, `platform/system`, `platform/child-environment`, `node-adapters/fs`, `node-adapters/process`, and the explicit credential crypto adapter. Tovu constructs the native runtime once, calls `createAgentRuntimeBindings`, and supplies the resulting `AgentRuntimePort`. Inventory and execution share that runtime. Jini host does not read ambient `process.env`, resolve home or package paths, or import Electron.

| `@tovu/contracts` dependency | Decision |
| --- | --- |
| `assistant-subagents-policy` (`AssistantCliPermissions`, `AssistantCliCapability`, `AssistantCliAgentPermissions`, schema parity/keys and settings constants) | **Stays.** These model Tovu’s persisted owner settings and labels. The host receives the projected `NativeCapabilities` already in `@jini-ai/core/contracts/agents`, plus existing executor options including `subagentStartContext`. No second permission DTO in core. |
| `assistant-native-fallbacks` (`assistantCliPermissions`, `resolveFullCliAccess`, `resolveAssistantCliPermissions`, `isHostedAssistantRuntime`, `resolveAssistantDisallowedTools`, `TOOLS_FIRST_RULE`) | **Stays.** These interpret Tovu env/settings and encode Tovu tooling and file policy. Inject their results. Reuse the already-extracted `agent-runtime/native-permissions` helpers under them. |
| `host-signals` (`HostSignals`, `HostSignal`, `HostSignalDeclaration`, `HostSignalOptions`, selection/evaluation and fallback values) | **Stays.** The embedded host is generic over the supplied signal snapshot and does not interpret it. Tovu’s declarations and production fallback never become global Jini policy. |
| `secret-redaction` (`TOVU_ERROR_REDACTION_OPTIONS`, `redactSecretShapes`), `diagnostics-redaction` (`redactTovuLocalText`, `redactedTovuError`) | **Stay.** Inject a bound reporter and text redactor, including product patterns. Reuse Jini’s existing redaction primitives underneath. |
| `site-scope-key` (`SiteScopeKey`), `daemon-connection` (`DaemonSiteRegistration`, schemas for control, endpoint and idle stop), `daemon-exit-codes` (`AGENT_DAEMON_EXIT_CODE`) | **Stay.** These belong only to the Tovu site supervisor and its child protocol. They are not embedded-host inputs. |

No `@tovu/contracts` declaration needs to move into core. The neutral executor, server, runtime, and reporter types already exist there. The new conversation and app-binding ports are owned by the daemon host. Tovu’s local `contracts/workspace-conversations.ts` keeps the IPC channels and input DTOs. Consumers that only need the summary shape import `ConversationSummary` directly as a type from Jini.

## B. Target API

Use `packages/daemon/src/host/index.ts` for the factory, `host/ports.ts` for the app and turn ports, and `host/conversation-store.ts` for the store types. Add `./host` to `packages/daemon/package.json`, with `types`, `import`, `default`, and `jini.entries` following adjacent Node entries. This is the lowest package that owns the run lifecycle, executor, credentials, and bridge routes. No new top-level orchestration package. No new Express dependency.

`createDaemonRunServices` lives at `daemon/src/run-services.ts`, exported on the existing daemon `"."` surface for `server/src/kernel-base.ts`. It takes an already-configured `RunLifecycle` and tool-executor options, returns the paired `registry` and `toolExecutor`, and exposes `bindAgentExecutor(required, optional)` with that lifecycle bound. The standalone kernel keeps its existing lifecycle/rehydration/tracing sequence, then calls the shared factory. The embedded host creates its lifecycle over the injected event log and calls the same factory. Neither accepts a product-built `ToolRegistry`.

The following signatures use existing Jini types. `Pad` is `Record<string, never>`. Implement empty second arguments as `_optional: Pad = {}`. All public factories and port calls take object bags, apart from existing dependency APIs whose signatures are not being changed.

```ts
type Awaitable<T> = T | Promise<T>;
type ExecutorOptions = NonNullable<Parameters<typeof createAgentExecutor>[1]>;
type RunOptions = NonNullable<Parameters<AgentExecutor["run"]>[1]>;
type LifecycleOptions = NonNullable<Parameters<typeof createRunLifecycle>[1]>;
type ToolOptions = NonNullable<Parameters<typeof createToolExecutor>[1]>;
type TurnInput = { prompt: string; agentId: string };
type ApprovedAttachments = Pick<RunOptions,
  "imagePaths" | "imageContents" | "extraAllowedDirs" | "readOnlyExtraDirs" | "uploadRoot">;
type TurnOptions<Scope> = {
  scope?: Scope | null; conversationId?: string; model?: string; reasoning?: string;
  attachments?: ApprovedAttachments;
};
type ScopeLookup<Scope> = (r: { runId: string }, o?: Pad) => Scope | null;
type TurnPlan = {
  prompt: string; cwd: string; auditLocation: string;
  runOptions: Omit<RunOptions, keyof ApprovedAttachments | "model" | "reasoning">;
  allowPersonalMcpSetup: boolean;
};

interface AssistantBridgeAppPort {
  prepare(r: {
    reporter: ErrorReporter;
    authenticate: (r: { authorization: string | undefined }, o?: Pad) => BridgeAuthDecision;
  }, o?: Pad): Awaitable<{
    routeHost: DaemonRouteHost;
    mount(r: { routes: readonly ServerRoute[] }, o?: Pad): void;
    listen(r: { host: "127.0.0.1"; port: 0 }, o?: Pad): Promise<{
      url: string;
      close(r: Pad, o?: { signal?: AbortSignal }): Promise<void>;
    }>;
  }>;
}

interface AssistantHostRequired<Scope, Signals, Message> {
  app: AssistantBridgeAppPort;
  identity: { principal: Principal; contextRef: string; auditWorkspaceId: string };
  run: {
    workDir: string;
    ensureDirectory(r: { path: string }, o?: Pad): Awaitable<void>;
    eventLog: EventLog;
    lifecycleOptions: LifecycleOptions;
    hostEnv: Readonly<Record<string, string | undefined>>;
    runtime: AgentExecutorRuntimePorts;
    agentRuntime: AgentRuntimePort;
    executorOptions: Omit<ExecutorOptions, "mcpJsonInjection">;
  };
  tools: {
    build(r: { scopeOf: ScopeLookup<Scope> }, o?: Pad): readonly ToolRegistration[];
    catalog(r: { registry: Pick<ToolRegistry, "list"> }, o?: Pad): ToolCatalogQuery;
    executorOptions: ToolOptions;
    auditListDescription: string;
  };
  conversations: ConversationStorePort<Message>;
  credentials: Pick<CredentialCryptoPort, "mintToken" | "digest">;
  mcp: {
    launch: Pick<NonNullable<ExecutorOptions["mcpJsonInjection"]>, "command" | "args" | "env">;
    prepare(r: { agentId: string; allowed: boolean }, o?: Pad): Awaitable<void>;
  };
  turn: {
    snapshotScope(r: { scope: Scope | null }, o?: Pad): Scope | null;
    readSignals(r: { agentId: string; scope: Scope | null }, o?: Pad): Awaitable<Signals>;
    plan(r: {
      input: TurnInput; scope: Scope | null; signals: Signals; workDir: string;
    }, o?: Pad): Awaitable<TurnPlan>;
  };
  diagnostics: {
    versions: ErrorReporterPorts["versions"];
    createReporter(r: { versions: ErrorReporterPorts["versions"] }, o?: Pad): ErrorReporter;
    redact(r: { text: string }, o?: Pad): string;
    startFailureMessage: string;
  };
  shutdown: {
    deadline(r: Pad, o?: Pad): { signal: AbortSignal; dispose(r: Pad, o?: Pad): void };
  };
}

interface AssistantHost<Scope> {
  readonly daemonUrl: string;
  readonly lifecycle: Pick<RunLifecycle, "get" | "stream" | "cancel" | "waitForTerminal">;
  scopeOf: ScopeLookup<Scope>;
  toolIds(r: Pad, o?: Pad): readonly string[];
  startTurn(r: TurnInput, o?: TurnOptions<Scope>): Promise<{ runId: string }>;
  close(r: Pad, o?: Pad): Promise<void>;
}

declare function createAssistantHost<Scope, Signals, Message>(
  required: AssistantHostRequired<Scope, Signals, Message>,
  optional?: { makeAgentExecutor?: typeof createAgentExecutor },
): Promise<AssistantHost<Scope>>;
```

`RunOptions` acquires **one** optional field, `systemPromptOverlay?: string`, on the existing daemon executor surface. The existing early overlay resolver uses the per-run value when supplied and otherwise uses `promptAugmenter`. Explicit `""` suppresses the fallback. Keep the existing argv/file/stdin/ACP delivery, resume suppression, and filesystem-notice handling. That removes ALS without flattening system instructions into a user prompt.

**Host behavior and ownership**

- Prepare the work directory, reporter, one lifecycle, credentials, registry, audit tool, and catalog. Configure the injected app and mount only the existing search, describe, and delegated-call routes. Bind ephemeral IPv4 loopback and validate the returned URL before handing it to MCP. When `listen` rejects, the adapter owns any partial bind. After it resolves, the host owns the listener lease and releases it if executor binding fails.
- Authenticate before the server’s bounded JSON parser. The matched delegated route rechecks the live bearer and validates the parsed `runId` before any run lookup, tool lookup, or handler invocation. Both checks reuse `daemon/run-credentials`. No fallback proxy token, caller-supplied identity, or implicit bypass for loopback. Keep the existing same-origin checks. Catalog discovery is explicitly unscoped only because the host has one injected principal.
- Snapshot scope before the first await. Resolve fresh signals and per-provider policy, then finish static connector preparation before creating a run. Check that the host is still open after each preflight. Stream audit events before dispatch, use existing `createToolGapCollector` and `decodeToolGapEntry`, then launch using the provider ID already accepted by `AgentRuntimePort`. The browser/IPC layer cannot supply trusted executor options directly.
- Treat `close` as idempotent. Stop admission immediately, revoke bridge access, and cancel live runs through `RunLifecycle` and its existing executor listeners. Wait for terminal events, flush audits, unsubscribe, and close the listener within the injected deadline. If terminalization or draining fails, forget associated scope and credentials, report once through the injected reporter, and still release the listener. The shell closes its native runtime and any database it owns **after** host close, including on failure. Do not claim that `run()` resolving means the provider exited.
- Keep product prompts, UI authorization, file grants, browser tools, and vault policy outside the host. Help Me! should inject explicit file and browser grants and use the existing tool-executor confirmation delegate for consequential writes. Provider credentials come from its vault as narrowly scoped run inputs, never as global env, launch-spec fields, audit rows, or readable tool output.

**Tovu binding after extraction** — pseudocode, 24 lines. The named policy, Express, and IPC bindings below are shell-side implementations, not new Jini frameworks.

```ts
import { createAssistantHost } from "@jini-ai/daemon/host";
import { createJsonConversationStore } from "@jini-ai/daemon/host/store/json";

const conversations = createJsonConversationStore<ChatMessage>({
  file: desktopJsonFile({ filePath: join(userData, "desktop-chat-conversations.json") }),
  now: desktopClock, newId: desktopIds,
});
const runtime = createAssistantHost({
  app: tovuExpressBridge({ hostEnv: ownedRuntime.hostEnv }),
  identity: { principal: DESKTOP_OPERATOR, contextRef: "desktop-chat", auditWorkspaceId: "desktop-chat" },
  run: bindTovuDesktopRunPorts({ ownedRuntime, workDir: join(userData, "desktop-agent") }),
  tools: {
    build: ({ scopeOf }) => buildDesktopAgentTools({ ...toolDeps, addresseeOf: scopeOf }),
    catalog: desktopCatalog, executorOptions: { now: desktopClock.nowMs },
    auditListDescription: TOVU_GAP_DESCRIPTION,
  },
  conversations, credentials: createNodeCredentialCrypto({}),
  mcp: bindTovuMcp({ ownedRuntime, launch: electronMcpLaunch }),
  turn: bindTovuTurnPolicy({ ownedRuntime, readFullCliAccess }),
  diagnostics: tovuDiagnostics, shutdown: desktopShutdown,
});
registerWorkspaceChatIpc({ runtime, conversations, ipcMain, allowedSender,
  resolveAddressee, listAgents: inventoryOf({ runtime: ownedRuntime }), pickDirectory });
```

**Help Me! binding** — pseudocode, 18 lines. `nodeHttpBridge` uses the existing Node dispatcher over `node:http`, without Express. The SQLite and desktop-shell functions are Help Me! adapter work, not new factories promised by this extraction.

```ts
const db = openHelpMeDatabase({ filePath: profileDb });
const conversations = bindHelpMeSqliteConversations({ db, owner, clock, ids });
const native = createNativeAgentRuntime({ env: approvedHostEnv });
const host = await createAssistantHost({
  app: nodeHttpBridge({ originPolicy: localOriginPolicy }),
  identity: { principal: owner, contextRef: "help-me", auditWorkspaceId: profileId },
  run: bindHelpMeRunPorts({ native, workDir, eventLog: createInMemoryEventLog({}) }),
  tools: {
    build: ({ scopeOf }) => helpMeTools({ scopeOf, files, browser, vault }),
    catalog: helpMeCatalog, executorOptions: { delegate: windowApproval, now: clock.nowMs },
    auditListDescription: "List this profile’s redacted tool-gap history.",
  },
  conversations, credentials: createNodeCredentialCrypto({}),
  mcp: { launch: nodeMcpLaunch, prepare: approvedConnectorSetup },
  turn: helpMePolicy, diagnostics: helpMeDiagnostics, shutdown: helpMeShutdown,
});
openMainAssistantWindow({ host, conversations, inventory: inventoryOf({ runtime: native }),
  onQuit: () => closeHelpMe({ host, native, db }) });
```

## C. Ordered landing plan

Each step below is independently green before merge. Write the specified tests before changing production behavior. For a preserved behavior, first capture a passing existing-path characterization, then add the same assertion on the new path before implementing it. For a bug, record the failing regression before fixing it. Do not batch both repositories into one unshippable dependency change.

Commands are for the executor. From Jini root, `J <package> <file...>` below means `pnpm --filter @jini-ai/<package> exec vitest run <file...>`. From `Tovu/apps/desktop`, `T <file...>` means `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test <file...>`. Use Node 24, the repos’ lockfiles, and the approved release job. Follow the repository’s cloud checkpoint rules separately from green merge gates.

| Step | Files and test-first sequence | Executor verification |
| --- | --- | --- |
| **0. Baseline and approval** | Jini: add `packages/daemon/docs/embedded-assistant-host.md` for the spec and `docs/decisions/embedded-assistant-host.md` for the shared assembly decision and rollback. Tovu: no changes. Record both actual SHAs and baseline gates. In the implementation handoff, distinguish current Tovu sites-home stubs from the live site child. | Jini: `pnpm --filter @jini-ai/server... run build`, then `J server src/__tests__/kernel-base.test.ts src/__tests__/compose-jini-kernel.test.ts src/__tests__/create-local-node-daemon.test.ts`. Tovu: from root `npm run build --prefix packages/contracts`; from desktop `T src/desktop-agent.test.ts src/desktop-agent-runtime.test.ts src/desktop-agent-service.test.ts src/desktop-agent-tools.test.ts src/desktop-host-signals.test.ts src/workspace-conversation-store.test.ts src/workspace-conversation-gaps.test.ts src/desktop-chat-main.test.ts src/workspace-chat-ipc.test.ts`. |
| **1. Extract shared run services; adopt in existing Jini server** | Jini: add `daemon/src/__tests__/run-services.test.ts` exercising real registered-tool execution, registration after executor creation, and shared lifecycle identity. Extend `server/src/__tests__/kernel-base.test.ts` for constructor failure after storage acquisition and verify owned runtime/log cleanup preserves the original error. Add `daemon/src/run-services.ts`, update `daemon/src/index.ts`, and replace the matching block in `server/src/kernel-base.ts`. Do not change server feature policy or public signatures. Tovu: none. | `J daemon src/__tests__/run-services.test.ts`; rebuild daemon, then `J server src/__tests__/kernel-base.test.ts src/__tests__/compose-jini-kernel.test.ts src/__tests__/create-local-node-daemon.test.ts`; `pnpm --filter @jini-ai/server typecheck`. |
| **2. Extend the existing credentials and delegated routes** | Jini: extend `daemon/src/__tests__/run-credentials.test.ts` and add `daemon/src/http/__tests__/delegated-tools-run-bearer.test.ts`. Pin unauthenticated, revoked, live, and run-mismatch outcomes, including equivalent dispatcher matches and no downstream effects on refusal. Edit `daemon/src/run-credentials.ts` and `daemon/src/http/delegated-tools.ts`. Reuse the existing JSON route authentication/result seam so the body is read once and the matched route enforces its run binding. Keep standalone proxy mode and existing callers unchanged. Tovu: none. | `J daemon src/__tests__/run-credentials.test.ts src/__tests__/run-credentials.characterization.test.ts src/http/__tests__/delegated-tools-run-bearer.test.ts src/http/__tests__/delegated-tools.test.ts src/http/__tests__/tool-catalog-principal.test.ts`. |
| **3. Add explicit per-run overlays** | Jini: extend `daemon/src/agent-executor/__tests__/launch-defaults-and-staging.test.ts` and the ACP case in `agent-executor.test.ts`. Assert separate overlays under interleaved starts, fallback when omitted, explicit empty suppression, and unchanged resume behavior. Edit `agent-executor/contracts.ts` and `launch.ts`. No new prompt-delivery branch or runtime dependency. Tovu: none. | `J daemon src/agent-executor/__tests__/launch-defaults-and-staging.test.ts src/agent-executor/__tests__/agent-executor.test.ts`; `pnpm --filter @jini-ai/daemon typecheck`. |
| **4. Add a memory backend to the existing catalog** | Jini: add `registry/src/tool-catalog-builder/__tests__/memory.test.ts` with Tovu’s rank/limit/empty-query/describe assertions from `desktop-agent.test.ts:64–83`. Pin tie order, source injection, and schema on describe only. Add `registry/src/tool-catalog-builder/memory.ts` and expose `createMemoryCatalogStoreFactory` from the existing `./tool-catalog-builder` entry. Use `buildToolCatalogQuery` with identity authored text and enrichment disabled for Tovu. Tovu: none. | `J registry src/tool-catalog-builder/__tests__/memory.test.ts`; `pnpm --filter @jini-ai/registry run test`. |
| **5. Extract the store independently** | Jini: add `daemon/src/host/conversation-store.ts`, `host/store/json.ts`, and `host/__tests__/json-conversation-store.test.ts`. Port Tovu’s six JSON tests and gap-revision preservation test as characterizations. First add the failed-read/no-overwrite regression. Split read, mutation, and audit helpers to meet size/complexity limits. Add `./host/store/json` to daemon exports and runtime-entry metadata. Tovu: none until step 8. | `J daemon src/host/__tests__/json-conversation-store.test.ts`; `pnpm --filter @jini-ai/daemon run build`. |
| **6. Compose the embedded host** | Jini: add `daemon/src/host/{index,ports,bridge,turn,tool-gaps,shutdown}.ts` and `host/__tests__/{host,bridge,shutdown}.test.ts` plus a small fixture module. Start with the fake-port boot/run/close test and a second adapter using the existing Node dispatcher, no Express. Port generic assertions from `desktop-agent.test.ts`: registration, owner audit, source/scope isolation, recovery races, redaction, provider options, credential revocation, and real executor refusing an unknown agent. Add failed bind, rejected executor construction, audit subscription failure, failed terminal write, late preflight and double-close tests. Test switching provider IDs on successive turns with no rebuilt host, and exercise an existing ACP fixture. Update daemon `./host` entry. Tovu: none. | `J daemon src/host/__tests__/host.test.ts src/host/__tests__/bridge.test.ts src/host/__tests__/shutdown.test.ts`; `pnpm --filter @jini-ai/daemon run build`; `pnpm guard && pnpm check:complexity && pnpm check:size`. |
| **7. Release the reusable API before switching Tovu** | Jini: add `.changeset/embedded-assistant-host.md` covering daemon, registry, and the server adoption as appropriate. Update only affected `api-baseline/` files. In the package-surface test, load the new public subpaths from built output, inspect the dependency path for framework/product imports, and verify a registry created inside daemon executes without a consumer-supplied core instance. No `file:` or source-links in Tovu release inputs. | `pnpm api:update` and `pnpm api:check`; `pnpm exec tsx scripts/publish-pending.ts --plan`. Run the normal approved release workflow, then verify installed package exports before the Tovu cutover. |
| **8. Switch Tovu composition and delete the old host** | Tovu: update `package.json` and `package-lock.json` at root and under `apps/desktop` for the registry/daemon release actually consumed; add the desktop’s direct registry dependency. Add `desktop-agent-turn-policy.ts` and `desktop-agent-express.ts`, with corresponding tests. Edit `desktop-chat-main.ts`, `workspace-chat-ipc.ts`, `contracts/workspace-conversations.ts`, and `desktop-chat-main.test.ts` to import Jini directly. Delete `desktop-agent.ts` and `workspace-conversation-store.ts`. Retain a narrow real-Express/JSON integration test in `desktop-agent.test.ts` and a real-file adapter test in `workspace-conversation-store.test.ts`. Remove `workspace-conversation-gaps.test.ts` after its test lands in Jini. Keep Tovu-specific access, Electron launch env, same origin and limits, reporter, and installer assertions from `desktop-agent-runtime.test.ts` and `desktop-agent.test.ts`. Add a failing per-provider permissions test before fixing the missing `agentId`. Reconcile paths in `development/env-read-debt.json` and exact-path gates only where actually affected. Leave site service and renderer untouched. | `T src/desktop-agent.test.ts src/desktop-agent-runtime.test.ts src/desktop-agent-express.test.ts src/desktop-agent-turn-policy.test.ts src/desktop-chat-main.test.ts src/workspace-conversation-store.test.ts src/workspace-chat-ipc.test.ts src/desktop-agent-service.test.ts src/desktop-agent-tools.test.ts src/desktop-host-signals.test.ts`; `npm run typecheck && npm run gates` from desktop; from root `node development/scripts/check-no-linked-jini.mjs`. |
| **9. Prove Tovu can activate the host without changing release defaults** | Tovu: first harden `workspace-chat-ipc.ts` and `workspace-chat-ipc.test.ts` with failing tests for sender admission, subscription ownership, unapproved paths, and honest readiness. Remove the direct renderer-path forwarding. In `main/index.ts`, `main/boot/boot-sequence.ts`, `runner-ipc-stubs.ts` and their wiring/stub tests, add an explicit sites-home boot selection that wires **either** the real handlers **or** the stubs, exactly once. Keep `runner:chat-attachments:save` stubbed until a trusted implementation exists. Use the existing quit tracker and order host close before app-runtime disposal. Keep the opt-in off for shipping and attach mode, and test it on without changing the renderer. Add a packaged smoke fixture for the embedded path. The current `smoke:packaged-chat` tests the **site** path and is not evidence for this one. | `T src/main-agent-runtime-wiring.test.ts src/main/boot/boot-sequence.test.ts src/runner-ipc-stubs.test.ts src/workspace-chat-ipc.test.ts src/desktop-chat-main.test.ts`; `npm run typecheck && npm run gates`. At release, run the existing ASAR/staged closure checks and the new embedded smoke on a packaged build: one host, all three bridge routes, app quit drains it, site smoke still passes separately. |

If step 8 needs rollback, revert the Tovu cutover and both lockfile updates together. Step 9 can be disabled independently with the boot selection. Never run two app-wide hosts as a fallback. No new UI or custom React hook is needed for these steps. When the owner approves the Tovu pane, put it in shell chrome, not over the site FAB, and pass custom hooks as props into the existing conversation pane.

## D. Conversation store

The JSON file remains at its current Tovu `userData` path and keeps the same on-disk keys. It is a transcript and audit store, not the `RunLifecycle` event log. A conversation may outlive its runs, and deleting it must not cancel a run or delete unrelated audit rows.

```ts
interface ConversationSummary {
  id: string; title: string | null; messageCount: number;
  createdAt: number; updatedAt: number;
}
interface ConversationStorePort<Message> {
  list(r: Pad, o?: Pad): Awaitable<readonly ConversationSummary[]>;
  create(r: Pad, o?: Pad): Awaitable<ConversationSummary>;
  rename(r: { id: string; title: string }, o?: Pad): Awaitable<void>;
  remove(r: { id: string }, o?: Pad): Awaitable<void>;
  loadMessages(r: { conversationId: string }, o?: Pad): Awaitable<readonly Message[]>;
  saveMessage(r: { conversationId: string; message: Message }, o?: Pad): Awaitable<void>;
  appendToolGap(r: { entry: ToolGapEntry }, o?: Pad): Awaitable<void>;
  listToolGaps(r: Pad, o?: { limit?: number }): Awaitable<readonly ToolGapEntry[]>;
}
declare function createJsonConversationStore<
  Message extends { id: string; role: string; content: string }
>(
  required: { file: JsonConversationFilePort; now: Clock["nowMs"]; newId: ConversationIdPort },
  _optional?: Pad,
): ConversationStorePort<Message>;
```

`JsonConversationFilePort` is the `read`, `write`, and `withLock` slice of Jini’s existing durable-JSON file contract. `ConversationIdPort` takes two object bags and returns a string. Use the existing `ToolGapEntry` from core’s `./contracts/site/daemon-tool-audit`. The host only calls the two audit operations. The UI adapter calls the six transcript operations on the **same instance**. Keep newest-first summaries, insertion-ordered messages with upsert by ID, first-user-line title capped at 60 characters, missing-row semantics, and audit revision replacement with a 1,000-entry cap. Default the audit list to 100 and bound it to 1–200. Lock the entire read/modify/write and preserve both collections. Tovu’s file-notification adapter still owns user-facing corruption and lock notices.

**Build the SQLite binding later, in the first Help Me! vertical slice.** Jini already ships owner-scoped `@jini-ai/chat/store` and `@jini-ai/chat/store/sqlite`. Adapt their `list/create/rename/delete/messages/appendMessage` operations and keep audit metadata in a separate bounded projection on the app-owned database. Do not write a second transcript schema if the current chat store fits. Before landing the adapter, run the same store contract against JSON and temporary SQLite, including manual title preservation, upsert, owner isolation, audit retention, and reopen. Preserve the full `ChatMessage` as supported by the existing SQLite codec. If a field fails round-trip, extend that codec test-first. Do not migrate Tovu’s JSON as part of the host extraction, and do not put vault records in either transcript or audit storage.

## E. Bugs, risks, and owner decisions

### Source findings and first tests

| Evidence | Why it matters and what to pin first |
| --- | --- |
| Tovu `desktop-agent.ts:186–198`, `:407–408`; Jini `core/src/contracts/server/route-table.ts:31–42` | The desktop gate checks one raw path spelling, while the Express-compatible dispatcher recognizes equivalent matches. Run binding must attach to the matched delegated route. First assert that every accepted route spelling enforces the same run binding and that refusal never reaches tool execution. Step 2. |
| Tovu `desktop-agent.ts:336–352`, `:471–476`; `packages/contracts/src/assistant-native-fallbacks.ts:77–82` | The desktop projection never passes `agentId`, so persisted `byAgent` restrictions are ignored. First prove two agents get different decisions from the same settings, including connector consent and login-env behavior. Step 8. |
| Tovu `desktop-agent.ts:429–430`, `:477–485`, `:515–529` | Failed audit subscription can leave a created run live. Boot can leak a bound server if executor construction throws. Close currently flushes but neither cancels active runs nor reports a close error. First pin each failure, including revocation even when fallback terminal persistence fails. Steps 5–6. |
| Tovu `workspace-conversation-store.ts:84–101`, `:123–139` | Non-OK reads are treated like missing data on mutation. A read failure followed by a successful write can replace existing history with an empty projection. First inject an unreadable result and assert no write and unchanged bytes. Preserve successful reads and genuinely absent-file creation. Step 5. |
| Tovu `workspace-chat-ipc.ts:90–91`, `:137–182`, `:187–214`; `desktop-agent.ts:262–267` | The dormant IPC accepts any top frame on some channels and lacks a frame check on others. Subscription IDs are process-global and duplicate attaches can leave an untracked listener. Renderer attachment paths are forwarded into an additional directory grant. First prove only the designated shell sender can use each channel, a second sender cannot detach or replace a first sender’s subscription, and unapproved paths never reach the executor. Step 9, before activation. |
| Tovu `desktop-chat-main.ts:71`, `workspace-chat-ipc.ts:167–170` | Boot failure is logged as a raw exception, and `daemonOnline` reports true even if binding failed. First script a rejected boot and assert a safe reporter record and offline status. Steps 8–9. |
| Jini `server/src/kernel-base.ts:241–258` | After storage acquisition, native-runtime or executor construction can fail before any caller has a close handle. First assert that a construction failure after storage acquisition closes every already-owned handle. Step 1. |

### Owner decisions

1. **Tovu activation.** Approve the extraction and opt-in boot proof now. Recommend leaving the shipping pane off until sender admission, attachment handling, and the embedded packaged smoke pass. Keep the site assistant as it is.
2. **Meaning of “Gemini.”** Jini explicitly retired `gemini` in `agent-runtime/src/registry.ts`, and `defs/__tests__/gemini.test.ts` pins its absence. Recommend **Antigravity**, clearly labeled as such, if the requirement is access to Google models through today’s runtime. If literal Gemini CLI is required, approve a separate Jini provider-adapter project. Do not alias it or claim parity.
3. **OpenCode and ACP.** Ship the registered `opencode` definition plus already-supported ACP providers. `opencode-acp` is an exported definition pilot, not in `BASE_AGENT_DEFS`. Require its existing parity gate before exposing it as an OpenCode mode. Never assume that Claude Code, Codex, or every registered provider uses ACP.
4. **Help Me! authority.** Default to selected file roots, scoped browser access, explicit approvals, and no raw vault retrieval by the model. Approve any broader computer-wide grant separately. Preserve Tovu’s existing local/hosted policy rather than sharing its defaults with Help Me!.
5. **Site tools in the Tovu pane.** The default `UNBUILT_SITE_TOOL_GATEWAY` is a real boundary, not something the new host fills in. Recommend releasing a desktop-only surface when ready and exposing site tools only after a separately verified gateway is bound.
6. **SQLite and history continuity.** Use SQLite from Help Me!’s first persistent release. Keep Tovu JSON in place, and store provider-native continuation, if later added, by `(conversationId, agentId)`. Recommend initially replaying the durable transcript on a provider switch instead of trying to resume another provider’s session.

## F. Size estimate

| Repository | Estimated change |
| --- | --- |
| **Tovu** | Remove **680 production lines** outright from the old host and JSON store, plus roughly **280–430 test lines** relocated or replaced. Add **190–290 production lines** of product and Electron bindings including opt-in boot and IPC hardening. Net production reduction **390–490 lines**. Expect **19–24 files** touched, including manifests, lockfiles, tests, and staging or gate updates if needed. |
| **Jini** | Add **580–790 production lines** across daemon, registry, and the existing server seam, and **420–650 test lines** plus docs and release metadata. Expect **24–31 files** touched. No new package, SQLite migration, provider adapter, or renderer. |

**Acceptance:** the standalone Jini daemon and both Tovu site paths still pass their existing checks. Tovu’s Express binding and the non-Express fixture both execute a real registered tool through the same authenticated route and executor. Provider selection changes per turn without reconstructing the host. Shutdown leaves no listener, live credential, or orphaned audit subscription. Tovu reads its existing history unchanged, and the release uses only published Jini exports.
