Programmer(Direct): Programmer persona loaded for the existing theme controllers and page-authoring tools; no new visual direction is needed.

ITEM 279: NOT DONE (kUInetic upstream repository is outside the two permitted search roots).
ITEM 281: DONE (page reads expose the resolved active theme's actual default tokens and light overrides; both writers require that read in their guidance).
ITEM 323: DONE (agent additions/removals and existing theme preview notifications reconcile the Explore file list without replacing dirty text).
ITEM 1341: NOT DONE (needs a shared filesystem observation owner and process lifecycle; existing notification sources still miss arbitrary external edits).
ITEM 670: NOT DONE (needs a shared annotation/enforcement policy; prompt guidance remains the only action-tagging path).
ITEM 350: NOT DONE (kUInetic upstream repository is outside the two permitted search roots).

CHANGED FILES:

- `apps/website/src/features/pages/agent-tools.ts`
- `apps/website/src/features/pages/tool-registrations.ts`
- `apps/website/src/features/pages/__tests__/theme-colour-contract.test.ts`
- `apps/website/src/features/pages/__tests__/tool-registrations.test.ts`
- `apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts`
- `apps/admin/src/features/themes/__tests__/use-theme-explore.hooks.unit.test.ts`
- This handoff.

NOT DONE:

- **279 / s1-127 and 350 / s1-161:** Original `development/todos.md:279` and `:350` explicitly require fixes in kUInetic. The triage rows at `TRIAGE.md:85` and `:102` confirm upstream work remains. No upstream repository exists in the allowed Tovu/Jini source scope. No downstream CSS workaround was added. Next assignee: kUInetic owner with its repository in scope.
- **1341 / s4-27 — Coordinator decision:** `features/theme/theme-roster-sync.ts:21` describes marker revision plus root/engine-folder mtimes; `:55` implements exactly that fingerprint. `features/theme/preview-refresh.ts:55` reads only the durable marker, and `:70` supplies the existing polling feed. Neither notices arbitrary edits to files inside a theme. A shared watcher needs an owner, start/stop wiring for served sites, handling of directory replacement, and a notification bridge into this existing feed. No matching owner was found in Tovu's theme/lifecycle sources or Jini packages. A reusable watcher belongs in Jini under the dispatch's generic-code rule; this session's writable roots do not include `/Users/la/Programming/Jini`. Scope/owner resolution must precede implementation. Item 323 subscribes to the existing feed so it can consume that future signal.
- **670 / s2-41 — Coordinator decision:** The current page contract at `features/pages/agent-tools.ts:127` requires WebMCP action tags and preserves native form contracts; the original todo's older site-handle convention is superseded there. `features/theme/validation/webmcp-markup.ts:29` explicitly validates annotations that exist without requiring every action to be exposed. Jini's `agentic/src/core/webmcp.ts` registers supplied capabilities; it does not annotate authored HTML. No shared post-save authoring pass was found. Decide between a reusable annotator and a page-write rejection policy, including treatment of existing untagged pages, secret/file forms, nonlocal links and native submit controls. A generic annotator would belong in Jini, which is read-only in this session. No new parallel annotation owner was introduced.

Inputs: the six original todo entries and TRIAGE rows s1-127, s1-128, s1-141, s4-27, s2-41, s1-161; governing bootstrap, Programmer persona, architecture sections 13/14, project memory and governance ADR index. Graph MCP tools were unavailable; discovery used targeted `rg` searches and source reads within Tovu/Jini.

Implemented behavior:

- **281:** `readPageTheme` (`pages/tool-registrations.ts:376`) uses the injected host active-theme resolver, existing roster sync and public renderer's `resolveActiveTheme`. Both authored and empty page reads include `{ id, tokens, tokensLight }`, or `null` for no theme/standalone consumers. A theme switch is resolved on each read. Missing configured themes use the renderer's fallback rather than a second selection rule. Host failures propagate. Store-only callers retain optional theme inputs; live host wiring already supplies the fields (`server/runtime/composition/app.ts:1535`, `deps.ts:2497`). No filesystem paths or full theme source enter the response.
- **323:** The existing modified-state refresh can also reconcile the complete list (`use-theme-explore.hooks.ts:1154`). Both the content bus and durable theme feed use it. Text refresh follows the listing so deleted paths are not fetched. Removing a clean selected file selects the ordinary default and updates its URL; removing a dirty file keeps its buffer and leave guard, and Save requires a still-listed readable file. Successful local copy/rename/delete/save-original operations invalidate older background reads before their own refetch. Unmount invalidates pending list/text reads and unsubscribes from the feed. The existing no-blank-flash and dirty-text adoption predicates remain in use for files that still exist.

Reuse: active-theme vocabulary; searched page tools, presentation, assistant, theme APIs and Jini CMS for tokens/tokensLight; inspected `active-theme.ts`, `theme-roster-sync.ts`, the host resolver closures and `site-export/route-manifest.ts`; reused the host resolver and Theme public API. The new response projection is Tovu CMS page-specific.

Reuse: Explore external file reconciliation; searched theme hooks, refresh buses, preview SSE and Jini UI settlement/fetch-query mechanisms; inspected `refreshModifiedState`, `withServerModifiedState`, `refreshOpenFileText`, `defaultSelectedPath`, `writeThemeExploreSelectionToUrl` and `subscribeThemePreviewRefresh`; extended the existing controller refresh and settlement generation. No new bus, timer, dependency or generic watcher was added.

Validation: **PARTIAL — runtime verification intentionally not run.** Added page-tool tests for `--ink`/`--line` versus `--fg`/`--border`, light overrides, empty/authored pages, theme switching, deliberate no-theme, missing-theme fallback, absent host inputs, no installed themes and settings failures. Updated the old fixed-token prompt tests for the dynamic vocabulary contract; the starter-skeleton token assertions remain. Added six hook regressions for external addition/removal, durable feed delivery, clean-selection removal, dirty-buffer retention/save refusal, a stale background read overtaken by a local copy, and unsubscribe on unmount. Existing dirty-buffer, no-flash and stale-theme tests remain intact.

Fresh evidence: inspected final diffs and ran `git diff --check` restricted to the six code/test files; exit 0, no output. No tests, typecheck, builds, servers, benchmarks, network commands, commits or pushes were run. Test pass/fail counts and coverage are unavailable by instruction.

Architecture review: **PASS for the implemented scope, by source inspection.** Tovu-specific page/theme integration stays behind existing injected host inputs and public feature APIs; state logic stays in `.hooks.ts`; no `.tsx` implementation changes, new dependencies, durable write chokepoints or generic parallel owners were added. GOV-ADR-001 is not triggered by the read projection or UI reconciliation; existing page writes retain their store/version/permission paths. Arbitrary file watching and annotation ownership are explicitly deferred rather than implemented across an unapproved boundary.

Function quality review:

| Unit | Disposition | Findings / local action |
|---|---|---|
| `readPageTheme` and page-read response wiring | NO_RECORDED_FINDINGS | Existing selection owner, explicit host inputs, O(t) selection over themes plus existing roster sync; direct output tests added. |
| `refreshModifiedState` | NO_RECORDED_FINDINGS | One detail load, O(f + s) reconciliation in file count/text length; current-theme and settlement guards, dirty-buffer preservation; hook regressions added. |
| `refreshFromContentBus` and subscriptions | NO_RECORDED_FINDINGS | Reuses one refresh path, lists before fetching text, unsubscribes/invalidate on unmount. |
| Local mutation invalidation and Save guard | NO_RECORDED_FINDINGS | Reuses settlement owner; invalidates after successful mutation, retains prior reads on failure; removed files cannot be recreated by Save. |

Second-pass skepticism: checked stale background results against successful local mutations, changed themes, removed clean/dirty selections, absent theme inputs and theme fallback. Variable names describe actual values (`serverFiles`, `selectedStillExists`, `hasUnsavedText`); no misleading metric or inverted-state names found. Runtime confidence remains limited until the unrun tests are executed. Existing rationale comments were retained or updated with the behavior they explain.

Pre-completion: reread item sources; reviewed only the six assigned code/test files; whitespace check clean; no certified tests were weakened for a green run (none was run); obsolete fixed-vocabulary expectations were replaced with dynamic tool-output coverage. No prohibited/shared files were edited. Next routing: Coordinator for 670/1341 ownership and kUInetic access; TestRunner for the written regressions when execution is allowed.
