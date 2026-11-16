Software Architect / Security(Review): **Verdict: needs rework.**

Reviewed Jini `02edbb68`, Tovu `65302ee5`, and the latest size-design branch at `b62acb7e`. Source references below refer to those Git snapshots. No files were edited; builds and tests were not run.

1. **Blocker — The command binding can silently discard every CLI argument.**

   **Design:** `R8-RUNTIME.md:171` binds `command: createCommandInvocation` to core’s `CommandInvocationPort`.

   **Evidence:** Jini `packages/core/src/contracts/runtime/command.ts:86` places `args` in the **second** object. Platform’s `packages/platform/src/command.ts:27` reads `args` from the **first** object and ignores the second. A correctly shaped port call therefore produces an invocation with `args: []`. Structural compatibility does not establish behavioral compatibility here. Dropped arguments can include the requested execution mode and policy flags.

   **Fix:** Use the existing core planner or an explicit host adapter that maps both objects and preserves `ComSpec` fallback behavior. Test the actual host binding with nonempty arguments, Windows quoting, percent expansion, and newline rejection. Daemon tests using a correctly implemented fake would miss this defect.

2. **Major — The worked process binding does not satisfy the landed port.**

   **Design:** `R8-RUNTIME.md:170` assigns `{ listProcessSnapshots, stopProcesses, waitForProcessExit }` directly.

   **Evidence:** Core’s `packages/core/src/contracts/runtime/process.ts:49` requires `stopProcesses({ pids })`; platform’s `packages/platform/src/process.ts:570` accepts an array. Core’s `process.ts:50` requires `waitForProcessExit({ pid }, { timeoutMs })`; platform’s `process.ts:292` accepts positional arguments. The proposed `satisfies AgentExecutorRuntimePorts` cannot pass.

   C5 already supplies the necessary adapters in `untangle/sheets/C5.md:214`.

   **Fix:** Reuse C5’s `runtimePorts.processes`, including its array copy and timeout mapping. Do not duplicate the incompatible direct-reference binding in the other hosts.

3. **Major — `EventLogConnectionOpener` restates the wrong acquisition contract.**

   **Design:** `R8-RUNTIME.md:131` specifies `open: SqliteSyncOpener`, then `:175` says `openSqliteConnection satisfies EventLogConnectionOpener`.

   **Evidence:** Core’s `packages/core/src/contracts/storage/sqlite.ts` defines `SqliteSyncOpener` as `(file, options)`. However, `packages/db/src/sqlite/open.ts:63` requires an `open({ filePath }, options)` callback.

   The current daemon deliberately bridges these shapes at `packages/daemon/src/store/event-log/sqlite.ts:80`. That callback also records the acquired handle **before** pragma application can throw, allowing `:89` to close it.

   **Fix:** Declare the injected connection helper with its real object callback contract. Preserve the existing adaptation and early handle capture. Test pragma failure as well as schema failure; both must close the acquired connection and preserve the original error.

4. **Major — The consumer inventory misses production calls that the breaking changes affect.**

   **Design:** R8 §1.4 omits desktop’s executor factory; step 5 budgets “4 host call sites.” It also lists reference-web’s `mcp-bridge.ts` as an executor caller.

   **Evidence:**

   - Tovu `apps/desktop/src/desktop-agent.ts:276` calls `createAgentExecutor` and passes the options R8 deletes.
   - Tovu `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1622` directly calls `probeMcpBridge`.
   - Daemon `packages/daemon/src/agent-executor/events.ts:757` calls that probe with only `{ entry }`.
   - Reference-web’s `examples/reference-web/src/mcp-bridge.ts:3` merely mentions the executor in a comment.

   **Fix:** Include desktop, its injectable factory contract and tests, the website preflight probe, and the lifecycle diagnostic probe in the same migration units as their signature changes. Specify how the probe receives its required spawn/environment dependencies. Preserve token removal, diagnostic run identity, bounded diagnostics, and unconditional child reaping.

5. **Major — “R8a can start now” includes work whose prerequisites are explicitly absent.**

   **Design:** `R8-RUNTIME.md:263` says step 1 adds exports to the subpath “C6 created”; `:273` places steps 0–5 and 7 before C6.

   **Evidence:** At `02edbb68`, neither `packages/daemon/src/ports/` nor the `./ports` export exists. Core’s agents/AI-trace destinations are also absent.

   Moreover, C6’s sheet already resolves the purported AI-trace uncertainty: `untangle/sheets/C6.md:223` moves both `createAiTraceRecorder` and `normalizeAiUsage` to core. R8 step 7 therefore depends on C6 unless it introduces the unnecessary alternative port.

   The claimed existing Tovu `jini-runtime-ports.ts` binding is absent at `65302ee5`; it exists as a worked design, not landed source.

   **Fix:** Separate landed contracts, unimplemented bindings, and C6-dependent work. Move step 7 behind C6, delete the speculative recorder-factory alternative, and explicitly assign creation of the ports export and host binding.

6. **Major — R8 contradicts C6’s recorded ownership decisions for Codex and Pi configuration.**

   **Design:** `R8-RUNTIME.md:142` retains `piGracefulShutdownMs` and `codexDisablePlugins` as executor options. Its lifecycle table at `:206` says daemon continues passing Pi grace through session options.

   **Evidence:** The real coupling is at `packages/daemon/src/agent-executor/launch.ts:274`, `:280`, and `:1013`. C6 explicitly removes the Codex executor option in `untangle/sheets/C6.md:363` and removes `piGracefulShutdownMs` from both `NativeAgentRuntime` and `createAgentExecutor` in the later ruling at `:437`. Pi configuration belongs to the bound runtime’s definition configuration.

   **Fix:** Publish one reconciled contract following those recorded owners. Remove the stale executor options and Pi wrapper, update hosts/tests together, and pin configuration precedence at the runtime binding.

7. **Major — Phase 0 cannot be implemented as the promised green characterization-only commit.**

   **Design:** R8 §5.1 requires all cases before source changes, through existing override options.

   **Evidence:**

   - R11 requires fake `fileLock` and `writer` implementations. `packages/daemon/src/agent-executor/antigravity/permissions.ts:49` directly calls imported implementations; its public function exposes no such injection.
   - `CreateAgentExecutorOptions`, at `agent-executor/contracts.ts:565`, likewise has no lock/writer seams for R6.
   - R4 requires `releaseStagedResources` once for every early refusal. Native-policy refusal occurs at `launch.ts:1124`, before that function exists at `:1593`. `failBeforeSpawn` at `:1066` cleans filesystem temps, finishes the run, and throws; it does not call `releaseStagedResources`.

   **Fix:** Characterize observable effects available today. Assert no resource acquisition for early refusals and actual release order for failures after acquisition. Add interface-injection tests alongside the commits introducing those interfaces, while retaining baseline characterization coverage.

8. **Major — Removing runtime state requires public helper contract changes that the migration does not specify.**

   **Design:** `R8-RUNTIME.md:275` characterizes the launcher change as deleting defaults and renaming receivers.

   **Evidence:** Runtime state is also consumed outside the resolvers:

   - `launch.ts:212` exposes `selectAgentExecutorHostEnv`, with a `defaultRuntimeState` fallback at `:218`.
   - `launch.ts:600` exposes the overlay capability decision through helpers using state/global capabilities at `:611`.
   - `resolveSystemPromptOverlayDelivery` accepts `{ state }` at `:672`.
   - Existing tests call these contracts directly: `agent-executor/__tests__/host-env-ports.test.ts:30` and `:43`.

   Deleting the resolver and options does not remove these parallel state paths.

   **Fix:** Specify the replacement helper signatures and caller updates. Preserve host-configured environment names, snapshot isolation, and the distinction between explicit `false` and unknown capability state. Read capabilities at the existing execution point rather than capturing stale values during executor construction.

9. **Major — The target retains concrete filesystem effects without an approved exception.**

   **Design:** `R8-RUNTIME.md:58` explicitly keeps direct filesystem calls; INDEX O-7 recommends approving this later.

   **Evidence:** These are consequential effects, including private-directory creation and cleanup in `launch.ts:1049` and `:1157`, and Claude staging in `agent-executor/claude/filesystem.ts:10`. They affect confinement and the lifetime of sensitive staged material.

   The current review brief requires implementations to arrive through typed host ports. A recommendation in an unanswered owner-decision table does not grant an exception. The newest size design also claims filesystem effects are ports, contradicting this target.

   **Fix:** Route the ownership conflict through Coordinator before dispatch. Use existing staging ownership where suitable or define the smallest typed staging boundary. Do not claim DI compliance while retaining these concrete effects under an unapproved exception.

10. **Major — The proposed terminal wiring silently changes native PTY opt-in behavior.**

    **Design:** `R8-RUNTIME.md:185` supplies `loadSpawnPty: () => loadRealSpawnPty({})` in the preset.

    **Evidence:** Today `packages/server/src/builtin-features.ts:400` forwards a loader only when the host supplies one. Without it, `packages/daemon/src/terminal-session.ts:214` installs an inert loader that rejects creation. This behavior is explicitly tested at `__tests__/terminal-session.test.ts:222` and documented by `server/src/create-local-node-daemon.ts:175`.

    Automatically binding the real adapter changes hosts that previously had no native loader.

    **Fix:** Preserve explicit loader opt-in and custom-loader precedence after the move. Specify where every tuning option moves when service construction leaves daemon, and test default-inert boot, custom loaders, tuning, and shutdown.

11. **Major — The test migration cannot leave affected integration tests untouched, and its “fake” may be a real foreign implementation.**

    **Design:** `R8-RUNTIME.md:254` leaves category-(b) tests untouched for another lane. At `:247`, `fakeEventLogOpener` may delegate to a real `@jini-ai/db/testing` driver.

    **Evidence:** `agent-executor/__tests__/launch-defaults-and-staging.test.ts:80` calls the old executor signature. At `:95`, it explicitly tests the real process stopper. These tests cannot remain unchanged once required ports replace defaults.

    There is also an affected host test: `packages/server/src/__tests__/builtin-features.terminal-lifecycle.test.ts:16` mocks daemon and injects shutdown configuration through the manager’s old options at `:21`.

    **Fix:** Include every affected test in the corresponding breaking-change commit. Use interface fakes for unit coverage. A `/testing` path does not make a real implementation a fake under the explicit owner rule; remove that alternative and resolve any required cross-package coverage through its authorized test lane.

12. **Major — The size-design reconciliation removes a file for the wrong reason and follows superseded text.**

    **Design:** `R8-RUNTIME.md:288` and `:293` require deleting `spawn-child.ts` from size design 10 because its foreign imports disappear.

    **Evidence:** `packages/daemon/src/agent-executor/launch.ts:872` contains real synchronous spawn/result behavior that remains after import removal. Removing its concrete imports does not remove its responsibility or justify deleting its destination.

    The latest size design already contains Revision 2’s cleanup ownership correction and a hard R8 prerequisite (`size-designs/10-jini-daemon-agent-executor-launch.md:129`). Its unchanged portions still assign the spawn behavior to `spawn-child.ts`.

    **Fix:** Reconcile against Revision 2. Delete obsolete default-resolution code, but retain or explicitly reassign the synchronous spawn implementation, exports, callers, tests, and timing comments. Complete the declaration-to-destination map before dispatch.

13. **Minor — The positional spawn exception is unsupported and unnecessary.**

    **Design:** `R8-RUNTIME.md:106` declares a three-positional-argument port; `:108` justifies this by synchronous listener timing.

    **Evidence:** The invariant documented at `launch.ts:856` prohibits yielding before listener registration. A synchronous object-argument adapter introduces no yield and preserves that invariant.

    **Fix:** Follow `(required, optional = {})`, adapting to Node’s positional API at the host boundary. Retain the synchronous return type and race test.

Verification limits: C3–C5 contract presence, C6 absence, the origin contract’s remaining mutable-port/env fields, and node-bridge’s presence only on `design-d2` were checked. I did not independently reconstruct every R7 route category or execute its streaming/auth characterization matrix; those claims are not certified by this R8 review.

## Recurring mistake classes

- Compare argument placement and behavior, not just assignable types.
- Distinguish landed implementations from worked examples in design sheets.
- Inventory executable calls, direct helpers, and tests; exclude comment mentions.
- Reconcile the latest overriding decisions before assigning ownership or scheduling work.
- Make characterization assertions match resources actually acquired on each path.
- Preserve opt-in behavior, configuration precedence, and synchronous timing explicitly.
- Removing imports does not remove behavior ownership.
- Treat unresolved exceptions as unresolved; do not count them as compliance.
