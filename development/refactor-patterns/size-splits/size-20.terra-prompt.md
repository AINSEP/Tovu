# Terra job size-20: split 2 Jini file(s) by responsibility (size limits)

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
### jini:packages/agent-runtime/src/providers/oauth-callback-server.ts
- **Over:** `startOAuthCallbackListener` 111
- **Phase:** now · **Batch:** size-20
- **Tests:** `src/providers/__tests__/oauth-callback-server.test.ts`, `src/providers/__tests__/j5-02-characterization.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | types, `DEFAULT_TIMEOUT_MS`, `renderResultPage`, `escapeHtml`, `callbackOutcome`, `callbackConsumesListener` | outcome + page |
| B request handling | `let consumed`, `const handle = async (req, res) =>` (~L100-149) | answer one HTTP hit on the listener |
| C listen | `await new Promise<void>((resolve, reject) => {` (~L155-172) | bind the port, map EADDRINUSE to a plain message |
| D (stays) | input/defaults, `stopped`, `serverRef`, `timer`, `closeServer`, `stop`, `server`, timeout, return | listener lifecycle |

- **Splits** (module level, directly above `startOAuthCallbackListener`, in run order):
  1. `handleOAuthCallbackRequest({ req, res, host, port, callbackPath, input, listener, stop }: HandleOAuthCallbackRequestInput): Promise<void>` ← body of `handle` verbatim (both comments move). `let consumed = false` becomes `const listener = { consumed: false }` in the caller (only `handle` reads/writes it); `consumed` → `listener.consumed`. `input` typed `StartOAuthCallbackListenerInput`, `stop: () => Promise<void>`.
  2. `listenOnce({ server, host, port }: ListenOnceInput): Promise<void>` ← the `new Promise` block verbatim; caller does `await listenOnce({ server, host, port });`.
  `http.createServer` callback becomes `void handleOAuthCallbackRequest({ req, res, host, port, callbackPath, input, listener, stop })`.
- **Importers to update:** none (no export moves).
- **After:** `startOAuthCallbackListener` ~55; `handleOAuthCallbackRequest` ~42; `listenOnce` ~19; file ~190.
- **Risks / notes:** `stop` is declared before `handle`, so passing it is safe. The EADDRINUSE message text must stay byte-identical (tests assert it).

### jini:packages/agent-runtime/src/providers/openai-chat.ts
- **Over:** file 528 lines (no function over 100)
- **Phase:** now · **Batch:** size-20
- **Tests:** `src/providers/__tests__/openai-chat.test.ts`, `src/providers/__tests__/strict-tools.test.ts`, `src/ai-trace/__tests__/providers.test.ts`, `src/ai-trace/__tests__/regressions.test.ts`; smoke for type importers: `rg -l "tool-turn" packages/agent-runtime/src --glob '*.test.*'`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A wire types | `OpenAiFunctionToolDef`, `OpenAiToolCallParam`, `OpenAiTextPart`, `OpenAiImageUrlPart`, `OpenAiContentPart`, `OpenAiMessageParam`, `OpenAiToolCall`, `OpenAiToolResult`, `OpenAiToolExecutor`, `OpenAiTurnEndReason`, `OpenAiTurnEvent`, `OpenAiTurnOptions`, `OpenAiTurnResult` (L80-176) | the Chat Completions turn contract |
| B (stays) | request URL/headers/body, error detail, strict-tool retry, SSE reduction, `runOpenAiCompatibleRequest`, `runSingleOpenAiRequest` | one streaming request |
| C (stays) | image limits, `invalidOpenAiContentPartReason`, `sanitizeOpenAiToolResult`, `splitOpenAiToolResultContent`, tool loop helpers, `runOpenAiToolTurn` | tool loop |

- **Splits:**
  1. NEW `openai-chat-types.ts` — job: OpenAI-compatible turn/wire types. Moves unit A verbatim (all `export`, every doc comment moves, incl. the `detail` and `content` comments). Imports nothing from `openai-chat.ts` (unit A references only its own types). `openai-chat.ts` then `import type { … } from './openai-chat-types.js'` for the names it uses.
- **Importers to update:** `src/providers/index.ts` — add `export * from './openai-chat-types.js';` next to `export * from './openai-chat.js';` (keeps the package surface; `providers/index.ts` is re-exported by `src/index.ts`, the `.` entry). `src/providers/tool-turn.ts` (`OpenAiContentPart`, `OpenAiFunctionToolDef`, `OpenAiMessageParam`, `OpenAiToolCall` → `./openai-chat-types.js`; `runOpenAiToolTurn` stays), `src/providers/tool-turn-types.ts` (`OpenAiFunctionToolDef` → types), `src/providers/__tests__/openai-chat.test.ts` (types `OpenAiMessageParam`, `OpenAiTurnEvent`, `OpenAiToolCall`, `OpenAiContentPart` → `../openai-chat-types.js`). `azure-chat.ts`, `anthropic-messages.ts`, `google-messages.ts` unchanged (their names stay).
- **After:** `openai-chat.ts` ~455; `openai-chat-types.ts` ~78.
- **Risks / notes:** `export *` from both files must not produce duplicate names — none, since moved names leave `openai-chat.ts`. Do not leave a re-export in `openai-chat.ts`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/agent-runtime/src/providers/oauth-callback-server.ts packages/agent-runtime/src/providers/openai-chat.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
