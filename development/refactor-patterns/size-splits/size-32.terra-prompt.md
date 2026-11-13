# Terra job size-32: split 4 Jini file(s) by responsibility (size limits)

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
### jini:packages/agentic/src/core/a2ui/interpreter.ts
- **Over:** `createA2uiInterpreter` 192
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/a2ui/__tests__/interpreter.test.ts`, `src/core/a2ui/__tests__/spec-fixtures.test.ts`, `src/core/a2ui/__tests__/index.test.ts`, `src/core/__tests__/args-convention.contract.test.ts` (uses `createA2uiInterpreter`). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | interfaces, `bestEffortSurfaceId`, `buildParseFailureResult`, `runLocalFunctionAction`, `A2uiInterpreter` | types + parse-failure/local-fn helpers |
| B message handlers | closures `applyComponentsList`, `handleCreateSurface`, `handleUpdateComponents`, `handleUpdateDataModel`, `handleDeleteSurface`, `handleCallFunction`, `handleActionResponse`, `dispatchAgentMessage` | apply one agent→renderer message to surface state |
| C action building | closures `resolveActionContext`, `resolveActionTarget`, `buildAgentEventAction` | build a renderer→agent `action` envelope |
| D (stays) | `surfaces`, `listeners`, `notify`, `applyAgentMessage`, `getSurface`, `getRoot`, `resolve`, `buildAction`, return | the interpreter API |

- **Splits** (module level, above `createA2uiInterpreter`, in this order; bodies verbatim, comments move):
  1. `applyComponentsList({ catalog, surface, wireComponents }: ApplyComponentsListInput): RendererToAgentMessage[]`
  2. `handleCreateSurface({ catalog, surfaces, message }: HandleCreateSurfaceInput): RendererToAgentMessage[]`; `handleUpdateComponents({ catalog, surfaces, message })`; `handleUpdateDataModel({ surfaces, message })`; `handleDeleteSurface({ surfaces, message })`; `handleCallFunction({ catalog, message })`; `handleActionResponse({ surfaces, message })` — each keeps its `Extract<AgentToRendererMessage, {…}>` message type and `RendererToAgentMessage[]` return.
  3. `dispatchAgentMessage({ catalog, surfaces, message }: DispatchAgentMessageInput): RendererToAgentMessage[]` (its "Routes one…" comment moves).
  4. `resolveActionContext({ surfaces, catalog, context, surfaceId }: ResolveActionContextInput): Record<string, unknown>` — the inner `resolve(...)` call becomes a call to a new module-level `resolveSurfaceValue({ surfaces, catalog, surfaceId, value }, { itemBinding }?)` holding the body of the closure `resolve`; the closure `resolve` in the API stays as a one-line adapter calling it (public method shape unchanged).
  5. `resolveActionTarget({ surfaces, surfaceId, componentId }: ResolveActionTargetInput): { ok: true; surface: SurfaceState; action: Action } | { ok: false; reason: string }`.
  6. `buildAgentEventAction({ ids, surfaces, catalog, surface, surfaceId, componentId, event, … }: BuildAgentEventActionInput)` — same remaining params as today folded into the object, same return type.
  The closures `applyAgentMessage` and `buildAction` call the helpers with `{ catalog, surfaces, ids, … }`.
- **Importers to update:** none (no export moves).
- **After:** `createA2uiInterpreter` ~55; largest helper ~27; file ~300.
- **Risks / notes:** `resolve`'s optional second arg (`{ itemBinding… }`) must keep its exact name/default — copy the closure's signature into `resolveSurfaceValue`'s options object. `buildAction` reads `clock` — keep that in the closure. `notify` stays in the closure (listeners).

### jini:packages/agentic/src/core/dom/dom-page-driver.ts
- **Over:** `createDomPageDriver` 171
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/dom/__tests__/dom-page-driver.test.ts`, `src/core/dom/__tests__/dom-page-driver-elements.test.ts`, `src/core/dom/__tests__/dom-page-driver-private.test.ts`, `src/core/dom/__tests__/dom-page-driver-conversion.regression.test.ts`, `src/core/dom/__tests__/dom-page-driver-l183.pin.test.ts`, `src/core/dom/__tests__/visitor-publication.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | field/label/state readers, `publicTextOf`, `describe`, `findSelectableOption`, `labelledControls`, `assert*Control`, driver interfaces, `fillEditableRegion`, `currentAgentPage`, `publicationState`, `nativeSubmitter` | DOM readers + guards |
| B handle resolution | closures `ambiguousHandleError`, `controlOf` | handle → control |
| C control effects | method bodies of `settle`, `highlight`, `fill`, `selectOption` (after their `find`/`controlOf` line) | perform one effect on a resolved element |
| D (stays) | `pageOf`, `highlights`, `findAll`, `find`, `publicationFilter`, the returned method table (`findElements`, `listPages`, `describeField`, `describeState`, `scrollTo`, `click`, `navigate`) | the PageDriver API |

- **Splits** (module level, placed after `assertModalControl` and before the driver interfaces; bodies verbatim, all comments move):
  1. `ambiguousHandleError({ handle, count }: AmbiguousHandleErrorInput): Error` (pure). Call sites (`find`, `describeState`) pass an object.
  2. `controlOfElement({ root, element }: ControlOfElementInput, { action = 'read' }: ControlOfElementOptions = {}): Element` ← `controlOf` body (its JSDoc + inline comments move). The closure stays as a one-line adapter `const controlOf = (element: Element, action = 'read'): Element => controlOfElement({ root, element }, { action });` so its 6 call sites don't change.
  3. `settleDom(): Promise<void>` ← the `await new Promise<void>(…)` body of `settle`; method becomes `await settleDom();`. (Zero-arg helper, no inputs to wrap.)
  4. `highlightElement({ element, handle, durationMs, highlights }: HighlightElementInput): void` ← `highlight` statements after `const element = find(handle, 'highlight');` (the refusal comment moves with the `instanceof` check). `highlights` typed as the existing map's type (export a `type HighlightMarkers = Map<string, { timer: …; restore: … }>` alias next to it, using the map's current generic args).
  5. `fillControl({ control, handle, text }: FillControlInput): void` ← `fill` statements after `const control = …`.
  6. `selectControlOption({ control, handle, option }: SelectControlOptionInput, { selected = true }: SelectControlOptionOptions = {}): void` ← `selectOption` statements after `const control = …`.
- **Importers to update:** none (no export moves).
- **After:** `createDomPageDriver` ~95; file ~465.
- **Risks / notes:** `find` must still call the adapter `controlOf` (it is used inside `publicationFilter`'s `fieldOf` before the filter exists — keep declaration order: `findAll`, `find`, `controlOf`, `publicationFilter`). Error message text in `ambiguousHandleError` is asserted by tests — keep the concatenation byte-identical and the `console.warn`. If `createDomPageDriver` is still > 100, also lift `describeState`'s statements after `const control = controlOf(element);` into `describeElementState({ element, control, filtered })`.

### jini:packages/chat/src/core/assistant-client/ag-ui-transport.ts
- **Over:** `createAgUiRunClient` 113
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/assistant-client/__tests__/ag-ui-transport.test.ts`, `src/core/assistant-client/__tests__/transport.test.ts`, `src/core/assistant-client/__tests__/transport-redaction-signal.test.ts`, `src/core/assistant-client/__tests__/credential-notice-current-turn.unit.test.ts`, `src/core/__tests__/durable-run-subscription.paths.unit.test.ts`. No `vi.mock` of the file (check with `rg -n "vi\.mock\(.*ag-ui-transport" packages/chat/src`).
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `AgUiClient`, `AgUiClientPorts`, `AgUiEventContext`, `AgUiRunClient`, `frontendBinding` | contract |
| B event translation | closures `handleAgUiEvent`, `toAgUiMessage` (no closure captures) | AG-UI event → chat handlers; ChatMessage → AG-UI Message |
| C run input | `const runAgentInput: RunAgentInput = {…}` in `startAgUiRun` | build the AG-UI request |
| D subscription | `return new Promise<{ runId: string }>(…)` in `startAgUiRun` (+ its "Deliberately racing…" comment) | drive the cold Observable, settle start |
| E (stays) | `agUiAgents`, rest of `startAgUiRun`, `reattachAgUiRun`, `fetchAgUiRunStatus`, `stopAgUiRun`, return | the run client |

- **Splits** (module level, above `createAgUiRunClient`, in this order; bodies verbatim, comments move):
  1. `handleAgUiEvent` and `toAgUiMessage` move out of the closure unchanged (same parameter lists — they are existing signatures, not new helpers; their comments move).
  2. `buildRunAgentInput({ input, threadId, runId, messages }: BuildRunAgentInputInput): RunAgentInput` ← the `runAgentInput` literal.
  3. `subscribeAgUiRun({ agent, runAgentInput, runId, input, abort, agUiAgents, collected, handlers, state, finish }: SubscribeAgUiRunInput): Promise<{ runId: string }>` ← the returned `new Promise` verbatim (all comments move). `startAgUiRun` ends with `return subscribeAgUiRun({...});`.
- **Importers to update:** none (no export moves).
- **After:** `createAgUiRunClient` ~42; `startAgUiRun` ~25; file ~160.
- **Risks / notes:** `startAgUiRun` must still be `async` and the throw on `input.signal.aborted` must stay before `agUiAgents.set`. `finish`/`settled` stay in `startAgUiRun` (closure over `collected`, `abort`). Type of `state` = `ReturnType<typeof createAgUiToAgentTranslationState>` unless an exported type exists.

### jini:packages/chat/src/core/assistant-client/durable-run-subscription.ts
- **Over:** `followDurableRun` 103
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/__tests__/durable-run-subscription.unit.test.ts`, `src/core/__tests__/durable-run-subscription.paths.unit.test.ts`, `src/core/__tests__/durable-run-w2g.unit.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `DurableRunBinding`, `DurableSubscriptionPorts`, `CheckpointHandlers` | contract |
| B final delivery | `finish`'s statements after `stop();` (checkpoint, failed-run error, `onDone`) | hand the terminal saved message to the caller |
| C live frame rendering | `frame`'s last two statements (`if (handlers.onCheckpoint) return;` + `for … handlers.onEvent`) with their comment | render live events when no checkpoint hook |
| D (stays) | the `let`s, `stop`, `open`, `disconnected`, `scheduleRead`, `read`, `applySavedMessage`, startup | reconnect/poll state machine (tightly shared mutable state — not split further) |

- **Splits** (module level, directly above `followDurableRun`):
  1. `deliverFinalMessage({ message, handlers }: DeliverFinalMessageInput): void` ← the three statements after `stop();` in `finish` (error text byte-identical). `finish` becomes `stop(); deliverFinalMessage({ message, handlers });`.
  2. `renderLiveFrameEvents({ events, handlers }: RenderLiveFrameEventsInput): void` ← `if (handlers.onCheckpoint) return; for (const event of events) handlers.onEvent(event);` plus the "With the checkpoint-capable hook…" comment. `frame` calls `renderLiveFrameEvents({ events: outcome.events, handlers });`.
- **Importers to update:** none (no export moves).
- **After:** `followDurableRun` ~97; file ~120.
- **Risks / notes:** small margin (~3 lines). Everything else shares the `let` state machine (`streamEpoch`, `dropped`, `reading`, `recoveryPending`, `cursor`, `runId`) — do not lift those closures. `handlers` type is `CheckpointHandlers`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/agentic/src/core/a2ui/interpreter.ts packages/agentic/src/core/dom/dom-page-driver.ts packages/chat/src/core/assistant-client/ag-ui-transport.ts packages/chat/src/core/assistant-client/durable-run-subscription.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
