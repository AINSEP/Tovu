# Local CLI model dropdown wired into the run + persisted — DONE

Date: 2026-08-05
Agent: `Prog-DropdownWire` (Programmer persona, Sonnet 5), dispatched by Coordinator
Commits: **`77cebc2`** (hop 3), **`7c42dc8`** (hop 4), **`95fb79a`** (hops 1+2 + persistence)
Status: **COMPLETE.** All four hops landed, persistence landed, per-file negative verification done.

Closes the user's report: *"the dropdown to choose the model doesnt work in Tovu. i changed it to
sonnet and it just says its opus 5. did we ever wire that up?"* — answer was **no, never**. Root-cause
trace: `Jini/ADS-memory/reports/chat-pane-model-dropdown-not-wired-2026-08-05.md`. Prepared patch:
`ADS-memory/reports/local-cli-model-dropdown-fix-patch-2026-08-05.md`.

## What landed

| Commit | Hop | Change |
|---|---|---|
| `77cebc2` | 3 | `apps/admin/src/lib/assistant-transport.ts` — `startRun`'s Local CLI branch reads `input.context?.model` into `contextRef.model`, same "read by name, omit when absent" convention as `frontendBindToken`. |
| `7c42dc8` | 4 | `src/assistant/agent-daemon-server.ts` + new `src/assistant/run-start-context.ts` — `onStarted` decodes `model` from `contextRef` and spreads it into `agentExecutor.run()`. |
| `95fb79a` | 1+2 + Part B | `apps/admin/src/components/AssistantDock.tsx` + one-line export in `execution-settings.ts` — `resolveRunContext` accepts/forwards `model`; new `useLocalCliSelection` hook owns the picker's agent+model as a controlled `ChatPane` `selection`/`onSelectionChange` pair, hydrated once from `executionConfig.localCli`, persisted via the same `saveExecutionConfig` chokepoint `useByokRuntime` uses. |

Hop 5 (Jini `agent-executor.ts` + `defs/claude.ts` `buildArgs`) was already correct and was not touched.

## TWO PIECES OF KNOWLEDGE THAT EXIST NOWHERE ELSE

### 1. The empty-string model sentinel is safe ONLY because every def guards truthily

Reverting a model pick to "default" for the currently-selected agent writes
`modelByAgentId[agentId] = ""` rather than deleting the key. Deleting it would mean a revert never
persists — a stale non-default value would silently un-revert on the next reload. This introduces a
**second** falsy sentinel alongside `DEFAULT_MODEL_OPTION` (`'default'`), while the design forwards
`model` **opaque and unfiltered** through three hops.

**Coordinator verified this cannot leak `--model ""` into argv.** Every agent def in
`Jini/packages/agent-runtime/src/defs/` guards with a **truthy** check, not `!== undefined`:

```
if (options.model && options.model !== 'default')      // claude, codex, aider, copilot, opencode,
                                                        // cursor-agent, codebuddy, deepseek, qoder,
                                                        // mimo, qwen, pi
if (options.model && options.model !== DEFAULT_MODEL_OPTION.id)  // grok-build, antigravity
if (options.model && options.model !== 'default' && AMP_MODES.has(options.model))  // amp
```

Checked across **all** defs, not just `claude` — the picker is not claude-only.

> **LATENT COUPLING — READ BEFORE CHANGING ANY DEF'S MODEL GUARD.** If any def is ever changed from
> a truthy guard to `options.model !== undefined`, Tovu's empty-string sentinel starts emitting
> `--model ""` into a real spawn argv for that agent. The coupling is cross-repo and currently
> undocumented on the Jini side. A guard change there is not local.

### 2. `agent-daemon-server.ts` is a process entry point and is UNSAFE TO IMPORT in a test

The prepared patch planned to export `parseRunStartContextRef` directly from
`agent-daemon-server.ts`. That file **ends in an unconditional `void start()`**. Importing it from a
test either binds a real port or, if the port is taken, calls `process.exit()` **mid test-run**.

Discovered empirically, not theorized: the first test run showed 6 tests passing, then
`[agent-daemon] could not bind 127.0.0.1:4319`, with the file reported as failed.

Resolution: the function moved to its own `src/assistant/run-start-context.ts`, matching the
convention `run-ownership.ts` / `custom-instructions.ts` / `daemon-auth.ts` already follow for this
exact reason. **Coordinator confirmed** `agent-daemon-server.ts` is never imported anywhere — its
only references are comments plus a **path string** in `src/index.ts:356` used to spawn it as a
separate OS process. This was a live, previously-undiscovered testability hazard in that file.

## Deviations from the prepared patch (both correct, both flagged before implementation)

1. **Ref → state.** The patch planned a bare `selectionRef` for the transient per-run model.
   Persistence structurally requires `AssistantDock` to hold the selection as real state to feed a
   *controlled* `selection` prop — `initialSelection` is read once at `ChatPane` mount and cannot be
   hydrated after an async ledger GET resolves. A ref on top of that state would be a second source
   of truth. The patch's ref was right for its narrower scope; adding persistence changed the scope.
2. **Extraction target** — see knowledge item 2 above.

**Test runner:** the patch's hop-4 snippet was vitest syntax. `src/assistant/__tests__/` universally
uses `node:test` + `node:assert/strict` (root `package.json`: `node --import tsx --test`); only
`apps/admin` runs vitest. Written in `node:test` style. A vitest-syntax file in that tree is the
failure shape where a test appears present and never asserts.

## Per-file negative verification (revert → confirm THAT file fails → restore → confirm green)

| Hop | Revert result | Restored |
|---|---|---|
| 3 | "carries the model through" failed: `expected undefined to be 'claude-sonnet-5'`. Other 2 new tests correctly stayed green (they pin pre-existing absent-model behavior). | 32/32 green |
| 4 | "forwards a model present" failed: `actual: undefined, expected: 'sonnet'`. Other 5 stayed green. | 6/6 green |
| 1+2 / Part B | Stashed `AssistantDock.tsx` → 16 of 17 new tests failed with real assertion mismatches (old `initialSelection` still present; no `selection`/`onSelectionChange`/model in props; the `useLocalCliSelection` import itself throws pre-fix). 31 pre-existing tests stayed green. | 47/47 green |

**Typecheck:** `apps/admin` clean. Root, filtered to touched files: clean. Two unrelated pre-existing
errors in `src/features/taxonomy/` belong to another concurrent session's in-flight work — not touched.

## Deliberately not done

- **No browser/e2e test.** The four per-hop unit/integration blocks prove the value survives each hop
  independently, matching the root-cause trace's own "prove each hop separately" method. Writing into
  `development/e2e/` would also have collided with a concurrent typecheck-scope change.
- **`reasoning` persistence not touched** (`ChatPaneAgentSelection.reasoning` /
  `LocalCliConfig.reasoningByAgentId`). Part B was scoped to agentId+model. A cheap follow-up using
  the same `useLocalCliSelection` hook if wanted.

## Handoff Contract

- **Inputs used:** the prepared patch report; the five-hop root-cause trace; live source in both repos;
  Coordinator verification of the argv guard across all defs and of the daemon-server import hazard.
- **Output summary:** the Local CLI model picker now reaches the spawn argv and survives reload for
  both agentId and model. Three commits, all negatively verified per-file.
- **Risks:** the cross-repo empty-string/truthy-guard coupling above; `reasoning` remains unpersisted.
- **Suggested next assignee:** none required. Optional follow-up: `reasoning` persistence.
