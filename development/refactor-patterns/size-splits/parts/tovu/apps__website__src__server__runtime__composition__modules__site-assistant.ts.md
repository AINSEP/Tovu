### tovu:apps/website/src/server/runtime/composition/modules/site-assistant.ts
- **Over:** `createSiteAssistantModule` 185 · its `registerRoutes` 147 · nested `handleChat` 105 (file 452, under)
- **Phase:** after-move (MIXED: DEDUPE-AFTER-HARDENING of the BYOK/provider resolution; `MOVE:`-tagged visitor tool budget/rollback pieces) · **Batch:** size-58
- **Tests:** `apps/website/src/server/__tests__/site-assistant-routes.test.ts`, `.../site-assistant-provider-routing.test.ts`, `.../site-assistant-error-report.integration.test.ts`, `.../visitor-assistant-safety.integration.test.ts`, `.../visitor-assistant-readiness.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `CHAT_PATH` … `runSiteAssistantPreflight`, `visitorPageOptions`, `isTerminalVisitorAction`, `visitorRunOutcome`, `visitorConfirmationChannel` | gates, provider resolution, SSE helpers (stay) |
| B | `handleChat`'s `const visitorExecution = env.TOVU_VISITOR_TOOLS_POLICY === "off" ? undefined : {` | build the visitor tool-execution policy for one run |
| C | `async function handleChat(req, res, reportError, secrets)` | one visitor chat turn |
| D | `createSiteAssistantModule` setup + `start` + `registerRoutes` (mount, confirm, body-error handler, `app.post(CHAT_PATH, …)`) | module wiring (stays) |

- **Splits:**
  1. TYPE `interface SiteAssistantChatContext { deps: RouteDeps & { siteAssistantErrorLog?: (entry: SiteAssistantErrorLogEntry) => void }; env: NodeJS.ProcessEnv; resolution: ReturnType<typeof resolveSiteAssistantMode>; frontend: ReturnType<typeof createVisitorFrontendControl>; confirmations: ReturnType<typeof createVisitorConfirmations>; visitorToolBudgets: ReturnType<typeof createVisitorToolBudgets>; pageTargets: ReturnType<typeof createVisitorPageTargets> }` (module level).
  2. HELPER `createVisitorExecution({ deps, env, confirmations, visitorToolBudgets, readPolicy, req, res, logicalRunId, owner, publication, capture, abort, reportError }: CreateVisitorExecutionInput): Promise<…same object type… | undefined>` (module level) ← the `visitorExecution` initializer (~L698-713) with its "MOVE: Rollback returns to t…" comment; it is `async` because the initializer awaits `readPolicy()`. Call site: `const visitorExecution = await createVisitorExecution({ … });` — preserves the await point (policy is read at the same step). Type the object with the parameter type `createSiteCapabilityRegistry` expects for it (export it from its source if not exported — never loosen).
  3. HELPER `handleSiteAssistantChat({ context, req, res, reportError, secrets }: HandleSiteAssistantChatInput): Promise<void>` (module level, after step 2) ← body of `handleChat` (~L661-820); first statement `const { deps, env, resolution, frontend, confirmations, visitorToolBudgets, pageTargets } = context;`; all comments inside (abort-on-close, hard-coded visitor policy, `executeTool` doc) move with it. The `let terminalNavigation` / `let runOutcome` closures stay inside.
  4. `createSiteAssistantModule` adds `const chatContext: SiteAssistantChatContext = { deps, env, resolution, frontend, confirmations, visitorToolBudgets, pageTargets };` after `reporter`; in `registerRoutes`, delete `handleChat` and change `void handleChat(req, res, reportError, secrets).catch(` → `void handleSiteAssistantChat({ context: chatContext, req, res, reportError, secrets }).catch(` (the stream-may-be-open comment stays).
- **Importers to update:** none (no export changes).
- **After:** file ~470; `createSiteAssistantModule` ~82; `registerRoutes` ~44; `handleSiteAssistantChat` ~92; `createVisitorExecution` ~20.
- **Risks / notes:** `visitorExecution` is read by `capabilities` right after; keep the `await` exactly where the initializer's `await readPolicy()` was (a pending await shifts nothing else since the following statements already run after it). `deps` is used 24× in the chat body — it comes from `context`, same object. Verify via rg that `confirmLimiter`/`reporter` are NOT used in `handleChat` (rg over L661-820 found none).
