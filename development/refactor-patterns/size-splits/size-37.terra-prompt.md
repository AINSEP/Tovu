# Terra job size-37: split 7 Jini file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.

READY: these files are not reshaped by the Tovu→Jini move.

## Rules
Owner-approved 2026-11-13. These rules are binding for every `size-NN` job and every hard-file plan.
They are inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- A file is over when it has more than **500** counted lines; a function (incl. a React component, hook,
  method, arrow) when it has more than **100**. Counted = non-blank after comments are removed (ESLint
  `max-lines` / `max-lines-per-function` with `skipBlankLines` + `skipComments`). Nested functions count
  on their own, and they also count inside their parent.
- Measure and check with the outline tool (read-only, TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  every top-level declaration (range, counted lines, same-file names it uses) and, for each function over
  100, its body statements with `decl:` (locals it creates) and `uses:` (earlier locals/params it reads).
  `--check <files...>` prints only what is still over and exits 1 if anything is.
- Exempt (never split): `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`, `i18n-common.ts`,
  `*.generated.*`, `migration(s)/`, plus listed entries). `composition/deps.ts` and `composition/app.ts`
  are NOT exempt.

## What a split is
1. **Split by responsibility, never by line number.** Each new module does one job you can name in a few
   words (its file name says it). Each helper does one step you can name. If a piece has no nameable job,
   it stays where it is.
2. **A long function becomes helper functions in the SAME file.** Helpers go at module level directly
   above the function they came from, in the order they run. A step that needs many of the function's
   locals becomes a helper that takes them as one object; for a React hook, a group of state + effects
   becomes a sub-hook `useXxx` in the same file. Only when the file itself is then over 500 do helpers
   move to a sibling file (as the plan says).
3. **A long file splits into sibling modules** in the same folder, named `<original-stem>-<job>.ts(x)`
   (or the name the plan gives). The original file keeps its own name and its main job, and imports
   what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module
   (find them with `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"` across the repo, tests included). The old
   file does NOT re-export moved names — except when the old file is a package entry (a target in a
   `package.json` `exports` map, or an `index.ts` that is one): then it keeps `export { x } from "./new.js"`
   so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it was cut out of. Types both sides need move
   into the new module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, same order, same awaits, same error text, same exports
   from the package. Only what crosses a new boundary changes: locals become parameters / return values.
   Do not "improve" code you move.
7. **"Why" comments move with their code** — word for word, including the comment above a moved
   statement and the file header paragraph that explains a moved part (copy that paragraph into the new
   file's header; keep the original header's other paragraphs).
8. **Arguments: `(required, optional = {})`.** A new helper takes ONE destructured object of required
   inputs and, only if it has optional inputs, a second object defaulting to `{}`:
   `function applyRow({ row, store }: ApplyRowInput, { signal }: ApplyRowOptions = {}): Promise<void>`.
   No new positional primitive parameters. Name the input type `<Helper>Input` (and `<Helper>Options`)
   unless the plan names it. Sub-hooks follow the same rule.
9. **React components take props only.** State, effects, refs, callbacks and data loading live in
   `<Component>.hooks.ts` (or the existing hooks file the plan names). A component split into
   sub-components passes plain props; a sub-component never receives the whole hook result object unless
   the plan says so.
10. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
    `@ts-expect-error`. If a type does not line up after a move, export the existing type from where it
    lives — never loosen it. A pre-existing `eslint-disable-next-line` / `biome-ignore` on a moved line moves
    with that line unchanged (the diff shows it moved, not added); never add a new one.
11. **Tests are not edited**, except an import path of a moved symbol. Before moving an export, run
    `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs of the file>`: if a test mocks the OLD module
    path and the code under test now gets the moved symbol from the NEW module, the mock stops applying —
    move the mock path in that test to the new module (the only other allowed test edit) and say so in the
    report.

## Running checks (no suites, nothing left running)
- Run ONLY the test files the plan lists for each file, one at a time, after that file is done:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package name> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package name> run typecheck` once per touched package (Jini packages are small enough).
- Tovu: no full `tsc` (admin tsc needs 2+ GB). Run `npx eslint <changed files>` (no new errors, no
  `max-lines`/`max-lines-per-function` warnings left on the planned items).
- Done check per file: `outline.mjs --check <original file> <new files>` → every planned item `OK`
  (an item the plan says stays over, e.g. an owner exception candidate, is listed in the report).
- No watch modes, no dev servers, no suites; kill nothing you did not start; leave nothing running.

## Commit and report
- One commit per file (or per tightly coupled pair the plan names), by explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; message `refactor(<area>): split <file> by responsibility (size)`.
  Never push, never `git add -A`, never stash or checkout other files.
- If a plan step cannot be done as written (an anchor is missing, a cycle appears, a test fails and
  the cause is the split), stop that file, revert only that file's uncommitted changes
  (`git restore -- <its paths>`, delete its new files), and report it — never improvise a different split.
- Report: per file `OK` / `STOPPED (reason)`, new files, before → after counted lines, tests run with
  pass/fail counts, and any test-mock path you moved.

## For each file, in the order listed
1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.
2. Complete the test list: `rg -l "<file stem>" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.
3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.
4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.
5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).

## Files
### jini:packages/ui/src/features/connectors/ConnectorsBrowser.tsx
- **Over:** `ConnectorsBrowser` 126 (file 217, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/connectors/__tests__/ConnectorsBrowser.test.tsx`, `src/features/connectors/__tests__/hooks/useWiredConnectorsBrowser.test.ts`, `src/features/connectors/__tests__/dependencies.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `filter`, `selectedProvider`, `useWiredConnectorsBrowser(...)` (+ its "Dependency resolution…" comment), `providerScopedConnectors`, `filteredConnectors`, `hasNoResults`, `alerts`, `handleProviderTabSelect`, `handleGateClick`, `actions`, `categoryLabelProps`, `gateProps`; type `ConnectorActionCallbacks` | browser state, wiring and action callbacks |
| B | `<div className="tab-panel-toolbar">` JSX | heading + provider tabs + search |
| C | `ConnectorsDetailPane`, `subHandleProp`, `ConnectorsDetailPaneProps`, rest of JSX | stays |

- **Splits** (in order):
  1. NEW `ConnectorsBrowser.hooks.ts` (sibling) — job: the browser's state + wiring. Moves type `ConnectorActionCallbacks` (with its doc comment; now `export`ed). `export function useConnectorsBrowser(input: UseConnectorsBrowserInput): ConnectorsBrowserState` ← unit A statements verbatim in order (calls `const t = useT();` itself for `alerts`). `UseConnectorsBrowserInput = UseWiredConnectorsBrowserParams & { providerTabs: readonly ProviderTab[]; getCategoryLabel?: (category: string) => string; gate?: ConnectorGateProps; onProviderTabClick?: (element: 'provider_chip' | 'search_connectors' | 'gate_card') => void }` (import `UseWiredConnectorsBrowserParams` from `./hooks/useWiredConnectorsBrowser.js`; do NOT import `ConnectorsBrowserProps` — cycle). Destructure all fields from `input` at the top. Returns `{ filter, setFilter, selectedProvider, catalog, authorization, detail, filteredConnectors, hasNoResults, alerts, handleProviderTabSelect, actions, categoryLabelProps, gateProps }`; declare the return type as an interface `ConnectorsBrowserState` using `WiredConnectorsBrowserController['catalog' | 'authorization' | 'detail']`, `ReturnType<typeof connectorPanelAlerts>`, `ConnectorActionCallbacks`, `Dispatch<SetStateAction<string>>`, and for `categoryLabelProps`/`gateProps` `{ getCategoryLabel?: (category: string) => string }` / `{ gate?: ConnectorGateProps }` — never loosen.
  2. SUB-COMPONENT in the original above `ConnectorsBrowser`: `ConnectorsBrowserToolbar({ providerTabs, selectedProvider, onSelectProvider, filter, onFilterChange, unlocked, onProviderTabClick, agentHandle }: ConnectorsBrowserToolbarProps): JSX.Element` ← unit B verbatim (`handleProviderTabSelect` → `onSelectProvider`, `setFilter` → `onFilterChange`). Calls `useT()`.
  3. `ConnectorsBrowser` keeps the prop destructuring (with `providerTabs = DEFAULT_PROVIDER_TABS` default), `const t = useT();`, `const { … } = useConnectorsBrowser({ … all needed props … });`, and the JSX (toolbar → `<ConnectorsBrowserToolbar …/>`). Remove unused imports (`useCallback`, `useMemo`, `useState`, rules, `AUTHORIZATION_CANCEL_FAILED_MESSAGE`, `DEFAULT_PROVIDER_TAB_ID`, `useWiredConnectorsBrowser`) — they move to the hooks file.
  4. `ConnectorsDetailPaneProps` uses `ConnectorActionCallbacks` → import it as a type from `./ConnectorsBrowser.hooks.js`.
- **Importers to update:** none outside (`ConnectorActionCallbacks` was module-private; `ConnectorsBrowser`/`ConnectorsBrowserProps` stay; `index.ts` unchanged).
- **After:** file ~165; `ConnectorsBrowser` ~70; `ConnectorsBrowserToolbar` ~30; hooks file ~95 (`useConnectorsBrowser` ~70).
- **Risks / notes:** `actions` is rebuilt each render as today (not memoized) — keep it that way. `t` in deps of `alerts` stays. No `vi.mock` of this file (the test injects hook overrides via props, which still flow through `useWiredConnectorsBrowser`).

### jini:packages/ui/src/features/connectors/hooks/useConnectorAuthorization.ts
- **Over:** `useConnectorAuthorization` 149 (file 273, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/connectors/__tests__/hooks/useConnectorAuthorization.test.ts`, `src/features/connectors/__tests__/hooks/useConnectorAuthorization.stale-race.test.ts`, `src/features/connectors/__tests__/ConnectorsBrowser.test.tsx`
- **Responsibility map** (inside `useConnectorAuthorization`):

| unit | statements | job |
|---|---|---|
| A | state (`pending`, `cancelFailed`, `authError`, `pendingConnectorAction`), `connectorsRef`/`pendingRef` + sync effects, `updateConnector`, `reloadStatuses`, persist effect, `runConnectorAction` | authorization state + status reload + connect/disconnect — stays |
| B | the per-id `async (connectorId) => { … }` inside `cancelStaleAuthorizations`'s `stuck.map` | cancel ONE stale authorization and reconcile state |
| C | the three effects "Poll statuses while…", "OAuth popup/system-browser callback.", "Refresh + auto-cancel stale authorizations on window refocus." | external refresh triggers |
| D | body of `cancelAuthorization` | user-initiated cancel + fallback status check |

- **Splits** (same file, module level above `useConnectorAuthorization`, in this order):
  1. HELPER `cancelStaleAuthorization({ connectorId, port, updateConnector, setCancelFailed, setAuthError, setPending }: CancelStaleAuthorizationInput): Promise<void>` ← unit B verbatim, including the long "This clear's `curr[connectorId] !== undefined` guard is structurally unreachable…" + "Correction (2026-10-21 coverage pass)…" comment block word for word. `cancelStaleAuthorizations` keeps `findStaleAuthorizations`/early return/`Promise.allSettled(stuck.map((connectorId) => cancelStaleAuthorization({ connectorId, port, updateConnector, setCancelFailed, setAuthError, setPending })))`, deps unchanged `[port, updateConnector]`. Input types: `port: ConnectorsPort; updateConnector: (next: Connector | null) => void;` setters as `Dispatch<SetStateAction<Record<string, boolean>>>`, `Dispatch<SetStateAction<Record<string, string>>>`, `Dispatch<SetStateAction<ConnectorAuthorizationPendingState>>`.
  2. HELPER `cancelAuthorizationAndReconcile({ connectorId, port, updateConnector, reloadStatuses, setCancelFailed, setAuthError, setPending }: CancelAuthorizationAndReconcileInput): Promise<void>` ← unit D verbatim (incl. the "Keep the local failure visible…" comment). `cancelAuthorization = useCallback((connectorId: string) => cancelAuthorizationAndReconcile({ connectorId, port, updateConnector, reloadStatuses, setCancelFailed, setAuthError, setPending }), [port, updateConnector, reloadStatuses])`. `reloadStatuses: () => Promise<ConnectorStatusMap>`.
  3. SUB-HOOK `useConnectorAuthorizationRefresh({ authBridge, pending, setPending, pollMs, pendingRef, reloadStatuses, cancelStaleAuthorizations }: UseConnectorAuthorizationRefreshInput): void` ← unit C's three effects verbatim with their comments and deps. Called in `useConnectorAuthorization` right after the persist effect (same position as today, so effect order is unchanged). `pendingRef: MutableRefObject<ConnectorAuthorizationPendingState>`; `cancelStaleAuthorizations: (pendingBeforeReload: ConnectorAuthorizationPendingState, statuses: ConnectorStatusMap) => Promise<void>`.
- **Importers to update:** none (no exports move; exported helpers `withoutKey`, `performConnector*`, `reportThrownConnectorActionFailure` untouched).
- **After:** file ~320; `useConnectorAuthorization` ~80; `cancelStaleAuthorization` ~25; `cancelAuthorizationAndReconcile` ~27; `useConnectorAuthorizationRefresh` ~28.
- **Risks / notes:** the two existing `// eslint-disable-next-line react-hooks/exhaustive-deps` lines (on `reloadStatuses` and the persist effect) stay where they are, untouched — do not move them into helpers and add none. Effect registration order must stay: ref syncs → persist → poll → auth callback → refocus. Known race already documented in the moved comment (stale-race test) — no change. No `vi.mock` of this file.

### jini:packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts
- **Over:** `useExecutionCredential` 130 (file 180, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/execution/__tests__/react/hooks/use-execution-credential.test.ts`, `src/features/execution/__tests__/react/hooks/use-execution-credential.lifecycle.test.ts`
- **Responsibility map** (inside `useExecutionCredential`):

| unit | statements | job |
|---|---|---|
| A | `stored`, `storedSettlement` (+ "Guards `setStored`…" comment), `installWrittenView` (+ "A write's own response…" comment), the hydrate `useEffect` (+ "Hydrate the stored view…" comment and its trailing `port`-is-stable comment + existing `eslint-disable-next-line` line) | load + order-guard the stored credential view |
| B | `legacyKey`, `legacyDismissed`, the "Offer the migration prompt…" `useEffect`, `migrateLegacyKey`, `dismissLegacyPrompt` | local→server legacy-key migration prompt |
| C | `saveState`, `settingsSaveState`, `inputRef`, `writes`, `saveKey`, `saveSettings`, derived `storedKeyIsForOtherEndpoint`/`apiKeyPlaceholder`, `return` | key/settings saves + controller — stays |

- **Splits** (same file, sub-hooks at module level above `useExecutionCredential`):
  1. SUB-HOOK `useStoredExecutionCredential<TStored extends ExecutionCredentialView>({ port, effects }: { port: ExecutionCredentialPort<TStored>; effects: ExecutionCredentialEffects<TStored> }): { stored: TStored | null; installWrittenView: (view: TStored) => void }` ← unit A verbatim, all comments word for word (the hydrate effect's deps comment and the pre-existing `// eslint-disable-next-line react-hooks/exhaustive-deps` line move unchanged with the effect — it is the same line, not a new disable; `git diff` must show it moved, not added elsewhere).
  2. SUB-HOOK `useLegacyCredentialMigration<TStored extends ExecutionCredentialView>({ stored, byok, port, effects, writes, installWrittenView, setSaveState }: UseLegacyCredentialMigrationInput<TStored>): { legacyKey: string | null; legacyDismissed: boolean; migrateLegacyKey: () => Promise<void>; dismissLegacyPrompt: () => void }` ← unit B verbatim (the "Clear the local copy ONLY after the PUT…" and "Same cross-mount notification…" comments move). Input field types: `byok: UseExecutionCredentialInput['byok']`, `writes: ReturnType<typeof useSerialWrites>`, `setSaveState: Dispatch<SetStateAction<ExecutionCredentialSaveState>>`.
  3. `useExecutionCredential` order becomes: `const { stored, installWrittenView } = useStoredExecutionCredential({ port, effects });` → `saveState`, `settingsSaveState` → `inputRef` (+comment) → `writes` (+comment) → `const { legacyKey, legacyDismissed, migrateLegacyKey, dismissLegacyPrompt } = useLegacyCredentialMigration({ … });` → `saveKey`, `saveSettings`, derived values, `return` unchanged (`legacyKey: legacyDismissed ? null : legacyKey`).
- **Importers to update:** none (no exports move).
- **After:** file ~195; `useExecutionCredential` ~72; `useStoredExecutionCredential` ~30; `useLegacyCredentialMigration` ~38.
- **Risks / notes:** effect order preserved (hydrate effect still registers before the legacy-prompt effect). `installWrittenView` is now a stable-per-render closure from the sub-hook exactly as before (it was a plain function, not memoized). The file's `@file` doc references "Cross-mount staleness" — keep it in the file header untouched. No `vi.mock` of this file.

### jini:packages/ui/src/features/execution/react/hooks/useExecutionTab.ts
- **Over:** `useExecutionTab` 155 (file 188, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/execution/__tests__/react/hooks/useExecutionTab.test.ts`, `src/features/execution/__tests__/react/hooks/useExecutionTab.ordering.test.ts`, `src/features/execution/__tests__/index.test.ts`
- **Responsibility map** (inside `useExecutionTab`):

| unit | statements | job |
|---|---|---|
| A | `describeProbeErrorRef` (+ assignment), `detectionTimer`, `alive`, the unmount `useEffect` | liveness + shared refs — stays |
| B | `agents`, `scan`, `detectionTicket`, `runDetection`, the `autoDetect` effect, `rescan` | local-agent detection edge |
| C | `connectionTest`, `connectionTestTicket`, `testConnection` | connection-test edge |
| D | `agentTest`, `agentTestTicket`, `testAgent` | agent-check edge |
| E | `modelDiscovery`, `modelDiscoveryTicket`, `loadModels`, `resetModelDiscovery` | model-discovery edge |

- **Splits** (same file, sub-hooks at module level above `useExecutionTab`, in order B→E; statements verbatim incl. comments; each `useCallback`/`useEffect` keeps its deps array):
  1. SUB-HOOK `useAgentDetection({ port, autoDetect, alive, detectionTimer }: UseAgentDetectionInput): Pick<UseExecutionTabResult, 'agents' | 'scan' | 'rescan'>` ← unit B. `alive: MutableRefObject<boolean>`; `detectionTimer: MutableRefObject<ReturnType<typeof setTimeout> | undefined>`; `port`/`autoDetect` typed from `UseExecutionTabOptions`.
  2. SUB-HOOK `useConnectionTestEdge({ port, alive, describeProbeErrorRef }: UseConnectionTestEdgeInput): Pick<UseExecutionTabResult, 'connectionTest' | 'testConnection'>` ← unit C. `describeProbeErrorRef: MutableRefObject<(error: unknown) => string>` (use the option's declared type: `MutableRefObject<NonNullable<UseExecutionTabOptions['describeProbeError']>>`).
  3. SUB-HOOK `useAgentTestEdge({ port, alive }: UseAgentTestEdgeInput): Pick<UseExecutionTabResult, 'agentTest' | 'testAgent'>` ← unit D (keeps `describeErrorMessage(error)` as today — NOT the ref).
  4. SUB-HOOK `useModelDiscoveryEdge({ port, alive, describeProbeErrorRef }: UseModelDiscoveryEdgeInput): Pick<UseExecutionTabResult, 'modelDiscovery' | 'loadModels' | 'resetModelDiscovery'>` ← unit E (the "Error-reporting contract §3.2" and "Taking a new ticket…" comments move).
  5. `useExecutionTab` keeps unit A in its current order, then — under the "One monotonic ticket per async edge. …" block comment, kept verbatim here (it explains the ticket each sub-hook owns) — calls the four sub-hooks in order detection, connection, agent, models, then the same `return { … }` (same keys/order; `port` still returned if it is today).
- **Importers to update:** none (no exports move).
- **After:** file ~215; `useExecutionTab` ~40; `useAgentDetection` ~45; others 22–35.
- **Risks / notes:** the unmount effect (sets `alive.current = true`) must stay BEFORE the detection sub-hook call so it registers before the `autoDetect` effect — same order as today. If `Pick<UseExecutionTabResult, …>` names do not exactly match (e.g. the result calls it differently), use the result interface's own field names. No `vi.mock` of this file.

### jini:packages/ui/src/features/html-editor/css.ts
- **Over:** `prettifyCss` 110 (file 111, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/html-editor/__tests__/css.characterization.test.ts`, `src/features/html-editor/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `INDENT`, `out`, `depth`, `parenDepth`, `quote`, `atDeclStart`, `i`, `n` | tokenizer cursor state |
| B | `skipWhitespace`, `consumeValue` | skip whitespace / copy quoted + parenthesised value chars verbatim |
| C | `openRule`, `closeRule`, `endDeclaration`, `separateValue`, `consumeStructure` | emit structure (braces, `;`, first `:`) with indentation |
| D | `while (i < n) { … }`, `return out.trim();` | driver loop — stays in `prettifyCss` |

- **Splits** (same file; all new declarations at module level above `prettifyCss`, in this order):
  1. `const CSS_INDENT = '  ';` (was local `INDENT`) and `interface CssCursor { readonly css: string; readonly n: number; i: number; out: string; depth: number; parenDepth: number; quote: '"' | "'" | null; atDeclStart: boolean }` (module-private).
  2. Each step closure becomes a module-level function taking ONE object, bodies verbatim with every cursor local `x` rewritten to `cur.x` (and `INDENT` → `CSS_INDENT`), and each inner call `skipWhitespace({}, {})` → `skipWhitespace({ cur })`, `openRule({}, {})` → `openRule({ cur })` etc.:
     `skipWhitespace({ cur }: { cur: CssCursor }): void` · `consumeValue({ cur, ch }: { cur: CssCursor; ch: string }): boolean` · `openRule({ cur }: { cur: CssCursor }): boolean` · `closeRule({ cur }: { cur: CssCursor }): boolean` · `endDeclaration({ cur }: { cur: CssCursor }): boolean` · `separateValue({ cur }: { cur: CssCursor }): boolean` · `consumeStructure({ cur, ch }: { cur: CssCursor; ch: string }): boolean`. Name the input types `CssStepInput` (`{ cur: CssCursor }`) and `CssCharStepInput` (`{ cur: CssCursor; ch: string }`). The `_input`/`_options` placeholder params disappear.
  3. `prettifyCss(css: string): string` keeps its big doc comment (word for word) and becomes: `const cur: CssCursor = { css, n: css.length, i: 0, out: '', depth: 0, parenDepth: 0, quote: null, atDeclStart: false };` then the `while` loop with `cur.` prefixes and step calls `consumeValue({ cur, ch })` / `consumeStructure({ cur, ch })` / `skipWhitespace({ cur })`, then `return cur.out.trim();`.
  4. Comments inside `closeRule` and above `separateValue` move with them word for word.
- **Importers to update:** none (`prettifyCss` stays; helpers are module-private).
- **After:** file ~125; `prettifyCss` ~18; largest helper `consumeValue` ~30.
- **Risks / notes:** pure mechanical rewrite of closure variables to a cursor object — the characterization test pins output. The two pre-existing non-null assertions (`css[i]!`) become `cur.css[cur.i]!`; they are moved, not new — leave them exactly (do not "fix"). `quote` assignment `cur.quote = ch` needs `ch` narrowed as today (inside the `ch === '"' || ch === "'"` branch) — TS narrows the same way.

### jini:packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx
- **Over:** `EditorSurface` 136 (file 214, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/lexical-rich-text-editor/react/components/RichTextInput.test.tsx`, `src/features/lexical-rich-text-editor/react/components/RichTextInput.onError.test.tsx`, `src/features/lexical-rich-text-editor/__tests__/serialize.test.ts`, `src/features/lexical-rich-text-editor/index.test.ts`
- **Responsibility map** (inside `EditorSurface`):

| unit | statements | job |
|---|---|---|
| A | props destructure, `useLexicalComposerContext`, the seven plugin hooks (`useSyncedOnChange` … `useMentionColorStamping`), the JSX `return` | editor surface rendering + behaviour plugins — stays |
| B | `knownMentionsRef`/`triggersRef`/`mentionTriggerIdRef` (+ their "`knownMentions`/`triggers`/`mentionTriggerId` can change…" comment) and `useImperativeHandle(ref, () => ({ getText, setText, clear, focus, insertText, insertMention, replaceActiveTrigger }), [editor])` | the imperative `RichTextInputHandle` |

- **Splits** (in order):
  1. NEW `RichTextInput.hooks.ts` (sibling) — job: the imperative handle.
     - `createRichTextInputHandle({ editor, knownMentionsRef, triggersRef, mentionTriggerIdRef }: CreateRichTextInputHandleInput): RichTextInputHandle` ← the object literal returned by the `useImperativeHandle` factory, verbatim (all inner comments: "Belt-and-suspenders…", the `selectEnd()` guarantee, "See the identical…", "Drop whichever trigger's query…"). Refs (not values) are passed so every method still reads `.current` at call time. Input types: `editor: LexicalEditor`; `knownMentionsRef: MutableRefObject<RichTextInputProps['knownMentions']>`-equivalent — write the element types out from the props' declared types WITHOUT importing `RichTextInputProps` (cycle): import the underlying types (`RichTextTriggerConfig`, the mention type) from where `RichTextInput.tsx` imports them.
     - `useRichTextInputHandle({ ref, editor, knownMentions, triggers, mentionTriggerId }: UseRichTextInputHandleInput): void` ← unit B's three ref pairs (with the comment) then `useImperativeHandle(ref, (): RichTextInputHandle => createRichTextInputHandle({ editor, knownMentionsRef, triggersRef, mentionTriggerIdRef }), [editor]);`. `ref: ForwardedRef<RichTextInputHandle>`.
     Moves the lexical imports only B uses (`$getSelection`, `$isRangeSelection`, `$getRoot`, `RangeSelection`, `$createMentionNode`, `deleteActiveTrigger`, `buildTriggerDeletionRegex`, `buildAnyTriggerDeletionRegex`, `serializeRichText`, `setRichTextFromPlainText`, `MentionInsert`) — same module specifiers adjusted for the sibling location (same folder → identical relative paths).
  2. `EditorSurface` keeps unit A and calls `useRichTextInputHandle({ ref, editor, knownMentions, triggers, mentionTriggerId });` where the refs used to be declared (before the plugin hooks, keeping hook order as close as possible: call it right after `useLexicalComposerContext()` — note `useImperativeHandle` then runs before the plugin hooks; acceptable, it only sets the ref object). Remove now-unused imports.
- **Importers to update:** none (no exports move; `RichTextInput` and its props/handle types stay).
- **After:** file ~125; `EditorSurface` ~50; hooks file ~115 (`createRichTextInputHandle` ~80, `useRichTextInputHandle` ~12).
- **Risks / notes:** `RichTextInput.onError.test.tsx` `vi.mock('../../mention-node.js', …)` — the hooks file sits in the same folder and imports the same module, so the mock still covers `$createMentionNode`. The `sel as RangeSelection` casts are pre-existing (not `as any`/`as unknown as`) — move as is. Header "Origin:" doc on `RichTextInput` stays.

### jini:packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts
- **Over:** `useMediaProvidersTab` 168 (file 231, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/media-providers/__tests__/react/hooks/useMediaProvidersTab.test.ts`, `src/features/media-providers/__tests__/catalog-ports.test.ts`, `src/features/media-providers/__tests__/index.test.ts`
- **Responsibility map** (inside `useMediaProvidersTab`):

| unit | statements | job |
|---|---|---|
| A | `providers`, `pendingProviderIds`, the "The working set, mirrored into refs…" comment, `providersRef`, `pendingRef`, `applyProviders`, `applyPending` | synchronously-mirrored working set |
| B | `save`, type `PersistOutcome` (+ "`'abandoned'` is deliberately distinct…" comment), `flushNow` (+doc), `writing`, `queued`, `persist` (+doc) | serialized, coalesced whole-map writes |
| C | `load`, `loadTicket` (+comment), `fetchAndReconcile`, the mount `useEffect`, `reload` | ticketed load + reconcile (+ one-time migration) |
| D | `portRef`, `mutatedSinceSend`, `clearedProviderIds`, `alive` + effect, `updateProvider`, `clearProvider`, `saveChanges`, `return` | shared refs + edit actions — stay |

- **Splits** (same file, module level above `useMediaProvidersTab`, in this order; statements verbatim with all comments; deps arrays unchanged):
  1. TYPE `PersistOutcome` moves from inside the hook to module level (with its comment), unexported.
  2. SUB-HOOK `useProviderWorkingSet({ initialProviders, normalizeMediaProviderMap }: UseProviderWorkingSetInput): ProviderWorkingSet` ← unit A. Returns `{ providers, pendingProviderIds, providersRef, pendingRef, applyProviders, applyPending }` (`MutableRefObject<MediaProviderMap>`, `MutableRefObject<ReadonlySet<string>>`, `(next: MediaProviderMap) => void`, `(next: ReadonlySet<string>) => void`). Input types: `initialProviders: UseMediaProvidersTabOptions['initialProviders']`, `normalizeMediaProviderMap: UseMediaProvidersTabOptions['catalogPolicy']['normalizeMediaProviderMap']`.
  3. SUB-HOOK `useProviderPersistence({ portRef, alive, providersRef, pendingRef, mutatedSinceSend, clearedProviderIds, applyProviders, applyPending, normalizeMediaProviderMap }: UseProviderPersistenceInput): { save: MediaProvidersSaveState; persist: () => Promise<PersistOutcome> }` ← unit B (`useState` for `save` first, then `flushNow`, `writing`, `queued`, `persist`). `mutatedSinceSend`/`clearedProviderIds`: `MutableRefObject<Set<string>>`; `portRef: MutableRefObject<UseMediaProvidersTabOptions['port']>`; `alive: MutableRefObject<boolean>`.
  4. SUB-HOOK `useProviderLoad({ port, portRef, alive, providersRef, pendingRef, clearedProviderIds, applyProviders, normalizeMediaProviderMap, persist }: UseProviderLoadInput): { load: MediaProvidersLoadState; reload: () => void }` ← unit C (`useState` for `load`, `loadTicket`, `fetchAndReconcile`, mount effect with its comment and deps `[port, fetchAndReconcile]`, `reload`).
  5. `useMediaProvidersTab` keeps: `catalogPolicy` destructure; `useProviderWorkingSet(...)`; `portRef` (+comment); `mutatedSinceSend` (+doc); `clearedProviderIds` (+doc); `alive` + its effect; `useProviderPersistence(...)`; `useProviderLoad(...)`; `updateProvider`, `clearProvider`, `saveChanges`; same `return`.
- **Importers to update:** none (no exports move).
- **After:** file ~265; `useMediaProvidersTab` ~78; `useProviderPersistence` ~62; `useProviderLoad` ~40; `useProviderWorkingSet` ~18.
- **Risks / notes:** effect order preserved: `alive` effect registers before the mount-fetch effect (persistence/load sub-hooks are called after it). `useState` order changes (`load`/`save` now after refs) — no behavior effect. The working-set comment's rule "nothing in this hook may call `setProviders`/`setPendingProviderIds` directly" is now enforced by the sub-hook boundary — keep the comment as is. Pre-existing `let settle!:` in `persist` moves unchanged. No `vi.mock` of this file.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/ui/src/features/connectors/ConnectorsBrowser.tsx packages/ui/src/features/connectors/hooks/useConnectorAuthorization.ts packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts packages/ui/src/features/execution/react/hooks/useExecutionTab.ts packages/ui/src/features/html-editor/css.ts packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
