### tovu:apps/desktop/src/desktop-agent-service.ts
- **Over:** `createDesktopAgentService` 170 (file 236, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-04
- **Tests:** `apps/desktop/src/desktop-agent-service.test.ts` (desktop main runner)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const entry = path.join(repoRoot, …` + `const args = cliMode === "source" ? [` | daemon launch argv |
| B | `const redact = (text: string) => {` | redact site secrets/paths from daemon output |
| C | `supervisor`'s constant options (`policy`, `now`, `scheduler`, `classifyExit`, `failureReporter`, `logger`) | supervisor policy |
| D | `type ScopedSite`, `type Site`, `hasServerExited`, `assertSiteBinding`, `withdrawStaleBinding` | site-binding guards (no mutable closure state) |
| E | `function bindServer({ child, siteDir }` | bind one site server's IPC control channel |
| F | `let channel/daemonPid/stopWork/stopping`, maps/sets, `processPorts`, `supervisor`, `assertDemandAllowed`, `refreshSiteHost`, `demand`, `withdraw`, return | daemon + site lifecycle (stays; closes over the mutable `let`s) |

- **Splits** (same file, module level, between `siteScopeKey` and `createDesktopAgentService`, in this order):
  1. Lift `type ScopedSite = DaemonSiteRegistration & { scopeKey: SiteScopeKey }` and `type Site = { …; host?: ReturnType<typeof createNodeIpcChannel> | undefined; … }` to module level (replace `typeof channel` with that exact type — identical).
  2. `daemonLaunchArgs({ repoRoot, cliMode }: DaemonLaunchArgsInput): string[]` ← `entry` + `args` statements (returns `args`).
  3. `redactDaemonOutput({ text, sites }: RedactDaemonOutputInput): string` ← body of `redact`; in the function `const redact = (text: string) => redactDaemonOutput({ text, sites });` (keep the "Frame first" comment above it).
  4. `daemonSupervisorPolicy(): Pick<Parameters<typeof createDaemonSupervisor>[0], "policy" | "now" | "scheduler" | "classifyExit" | "failureReporter" | "logger">` ← those six properties of the `createDaemonSupervisor({ … })` literal; the call becomes `createDaemonSupervisor({ ...processPorts, terminateProcess…, ...daemonSupervisorPolicy(), readiness: … }, { parkedExitCodes: … })`. Keep property order as original (spread at the same position where `policy` was).
  5. `hasServerExited({ server }: { server: ChildProcess }): boolean` ← moved as is (drop nothing; keep its `_options = {}` second param). `assertSiteBinding({ site, config, env }: AssertSiteBindingInput): void` ← moved, `env` becomes an input. `withdrawStaleBinding({ config, sites, env }: WithdrawStaleBindingInput): Promise<…>` ← moved (it reads `sites` and calls the two guards). Update the inner call sites (`demand`, `bindServer`) to pass `env`/`sites`.
  6. `bindSiteServer({ child, siteDir, supervisor, env, withdraw, demand, notices, bindings }: BindSiteServerInput): <current return type of bindServer>` ← body of `bindServer` (incl. nested `handleControl`, its locals `workspaceId`/`closed`, comments). In the function: `function bindServer(input: { child: ChildProcess; siteDir: string }, _optional = {}) { return bindSiteServer({ ...input, supervisor, env, withdraw, demand, notices, bindings }); }`. `supervisor` type = `ReturnType<typeof createDaemonSupervisor>`.
- **Importers to update:** none (no export moves).
- **After:** file ~250; `createDesktopAgentService` ~95; `bindSiteServer` ~45.
- **Risks / notes:** `channel`, `daemonPid`, `stopWork`, `stopping` are reassigned `let`s read by `processPorts.spawn`, `readiness`, `refreshSiteHost`, `assertDemandAllowed`, `demand`, `withdraw` — those stay inside the closure; do NOT move them. `bindServer` must not read any of those `let`s (verify with rg in its body before moving; if it does, STOP).
