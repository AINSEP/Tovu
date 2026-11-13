# Terra job size-22: split 3 Jini file(s) by responsibility (size limits)

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
### jini:packages/commerce/src/payments/ledger/rows.ts
- **Over:** file 726 lines (no function over 100)
- **Phase:** now (JINI 726) · **Batch:** size-22
- **Tests:** `src/payments/ledger/__tests__/rows.vitest.test.ts`, `src/payments/ledger/__tests__/migrations.vitest.test.ts`, `src/payments/ledger/__tests__/postgres.vitest.test.ts`, `src/payments/ops/__tests__/reconciler.vitest.test.ts`, `src/payments/ingest/__tests__/outbox-relay.vitest.test.ts` (package `@jini-ai/commerce`; the kernel ones may need `-c vitest.kernel.config.ts`, check which config includes them). No test mocks the module.
- **Responsibility map** (the file already has 6 `// ----` sections; cut along them):

| unit | declarations | job |
|---|---|---|
| A integer codec | `DECIMAL_INTEGER`, `fail`, `decodeMinor`, `checkedSafe`, `decodeNullableMinor`, `encodeMinor`, `encodeNullableMinor` | the one integer decoder/encoder |
| B tables | `LEDGER_TABLES`, `LedgerTableName`, `LEDGER_INTEGER_COLUMNS`, `encodeColumns`, `LedgerTableRules`, `LEDGER_MODES`, `LEDGER_TABLE_RULES`, `Int`, `NullableInt`, `PaymentsTable` … `OperatorActionsTable`, `PaymentsLedgerDatabase` | Kysely table names/types + structural rules |
| C records + patches | `AttemptOp` … `OperatorActionRecord` (section "Domain records"), `PaymentPatch`, `AttemptPatch`, `RefundPatch`, `DisputePatch`, `*_PATCH_COLUMNS`, `patchColumns` | camelCase domain records and update patches |
| D mappers | `paymentFromRow` … `quarantineFromRow`, `StoredRow`, `paymentToRow` … `quarantineToRow`, `operatorActionFromRow`, `operatorActionToRow` | row↔record mapping (stays) |

- **Splits** (in order; each leaves tests green):
  1. NEW `rows-integers.ts` — job: the one integer decoder/encoder. Moves unit A (section "The one integer decoder." incl. its comments, and the `encodeMinor` comment block). Exports the same names as today (`decodeMinor`, `decodeNullableMinor`, `encodeMinor`, `encodeNullableMinor`). No imports. Header: copy the original header's two bullets "Every integer read goes through ONE decoder…" and "Every integer WRITE goes through ONE encoder…".
  2. NEW `rows-tables.ts` — job: ledger table names, Kysely table types and structural rules. Moves unit B (section "Table names and Kysely table types …" through `PaymentsLedgerDatabase`). Imports `ColumnType` (type, kysely), `PaymentMode` (type, `../contract/scope.js`), `encodeNullableMinor` from `./rows-integers.js`. Header: copy the original header's first paragraph + the "Conventions every table follows" bullets about money/scope/personal data.
  3. NEW `rows-records.ts` — job: domain records and the patches an update may change. Moves sections "Domain records." and "Patches: …" (unit C, through `patchColumns`). Imports `PaymentMode` (type), the four status types from `../state/status.js` (only those it uses), the `*Table` types + `encodeColumns` from `./rows-tables.js`.
  4. `rows.ts` keeps unit D + the file header (first paragraph; trim nothing else). Imports `ColumnType`, `Selectable` from kysely, `PaymentMode`, status types it still uses, decoders from `./rows-integers.js`, table types + `encodeColumns` from `./rows-tables.js`, record types from `./rows-records.js`. Drop imports it no longer uses.
- **Importers to update** (27 files import `./ledger/rows.js` / `../ledger/rows.js` / `./rows.js`): split each import by the unit map above (A → rows-integers, B → rows-tables, C → rows-records, D stays). Files: `src/catalog/repo.order-payments.ts`, `src/payments/accounting/{apply-evidence,plan-evidence}.ts`, `src/payments/accounting/__tests__/harness.ts`, `src/payments/ingest/{outbox-relay,worker}.ts`, `src/payments/ingest/__tests__/{harness.ts,outbox-relay.vitest.test.ts}`, `src/payments/ledger/{repo,repo.memory,repo.sql}.ts`, `src/payments/ledger/__tests__/{ledger-contract.ts,migrations.vitest.test.ts,postgres.vitest.test.ts,rows.vitest.test.ts}`, `src/payments/ops/{capture-void,common,intent-recovery,intent,operator,reconcile-attempts,reconcile-snapshot,reconciler,refund,view}.ts`, `src/payments/ops/__tests__/reconciler.vitest.test.ts`. Re-run `rg -n "ledger/rows|from \"\./rows" packages/commerce/src` first.
- **Package entry:** `src/payments/kernel.ts` (exports `./payments/kernel`) has `export * from "./ledger/rows.js";` — add right below it `export * from "./ledger/rows-integers.js";`, `export * from "./ledger/rows-tables.js";`, `export * from "./ledger/rows-records.js";` so the public API is unchanged.
- **After:** rows.ts ~265; rows-integers.ts ~35; rows-tables.ts ~205; rows-records.ts ~245; no function over 100.
- **Risks / notes:** no cycles (integers ← tables ← records ← rows). The `DECIMAL_INTEGER` "why" comment and every per-type doc comment move word for word. `export *` collisions: none (names are disjoint).

### jini:packages/commerce/src/react/Payments.tsx
- **Over:** `Payments` 103
- **Phase:** now (JINI 103) · **Batch:** size-22
- **Tests:** `src/react/__tests__/Payments.unit.test.tsx`, `src/react/__tests__/Payments.locale.unit.test.tsx`, `src/react/__tests__/Payments.boundaries.unit.test.tsx` (package `@jini-ai/commerce`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const t`, page header, notice | page frame (stays) |
| B | the four `<section className="dash-panel" …>` blocks (providers, catalog/pricing, checkout/orders, revenue) | one status panel each, same shell |

- **Splits:**
  1. SUB-COMPONENT in the same file, module level, above `Payments`: `function PaymentsPanel({ headingId, title, statusLabel, description, children }: PaymentsPanelProps): ReactElement`, with `interface PaymentsPanelProps { headingId: string; title: string; statusLabel: string; description: string; children?: ReactNode }` (add `ReactNode` to the `import type` from react). It renders exactly the shared shell: `<section className="dash-panel" aria-labelledby={headingId}><div className="dash-panel-head"><h2 className="dash-panel-title" id={headingId}>{title}</h2><span className="status status-disabled">{statusLabel}</span></div><div className="dash-panel-body"><p>{description}</p>{children}</div></section>`.
  2. In `Payments`, each section becomes `<PaymentsPanel headingId="commerce-payment-providers" title={t("Payment providers")} statusLabel={t("Setup required")} description={t("Provider adapters remain …")}>…</PaymentsPanel>`, passing the existing `<div className="page-actions" …>` block unchanged as children (providers, catalog, checkout). The revenue panel gets no children. Every `t("…")` string, `href`, `agentHandle(...)` call and `aria-label` stays byte for byte, in the same order.
- **Importers to update:** none (`PaymentsPanel` is not exported).
- **After:** `Payments` ~55; `PaymentsPanel` ~15; file ~85.
- **Risks / notes:** the DOM output must stay identical (the tests query by heading id and text). React renders `children === undefined` as nothing, so the revenue panel's body is still just the `<p>`. Plain props only; `t` is called in `Payments`, never passed down.

### jini:packages/cookie-consent/src/client/runtime.ts
- **Over:** `createCookieConsent` 133
- **Phase:** now (JINI 133) · **Batch:** size-22
- **Tests:** `src/__tests__/client.test.ts`, `src/__tests__/client-dom.test.ts`, `src/__tests__/render.test.ts`, `src/__tests__/scripts.unit.test.ts`, `src/__tests__/frames.unit.test.ts` (package `@jini-ai/cookie-consent`; confirm with `rg -l "runtime|createCookieConsent|client/index" packages/cookie-consent --glob '*.test.*'`). No test mocks the module.
- **Responsibility map:**

| unit | statements in `createCookieConsent` | job |
|---|---|---|
| A state | `const { doc }` … `let state = compute();`, `compute`, `persist`, `apply` (except its `reconcile(next)` call), `confirm`, `set`, `adopt` | consent state, cookie and receipts (stays) |
| B adapter slots | `const slots`, `const ran`, `start`, `stop`, `reconcile`, `addSlot`, `syncSlots` | adapter lifecycle: start/stop/revoke per category, inert tags |
| C wiring | `const api` … `return api;` | public API + event wiring (stays) |

- **Splits:**
  1. HELPER in the same file, module level, directly above `createCookieConsent`: `function createAdapterSlots({ ports, anonymous, getState }: CreateAdapterSlotsInput): AdapterSlots`, with `interface CreateAdapterSlotsInput { ports: ClientPorts; anonymous: boolean; getState: () => ConsentState }` and `interface AdapterSlots { reconcile(next: ConsentState): void; syncSlots(items: readonly Contribution[]): void }`. Body: `const { doc } = ports;`, then `const slots = new Map<string, Slot>();`, `const ran = new Set<Optional>();` (keep its `// categories whose raw inert tags executed` comment), then `start`, `stop`, `reconcile`, `addSlot`, `syncSlots` moved verbatim with their doc comments, then `return { reconcile, syncSlots };`. In the moved code, each bare read of `state` becomes `getState()` **at the same spot** (inside `start`'s `.then(...)` callbacks it must stay a lazy read: `adapter.onState?.({ state: getState() })`, `getState().analyticsLevel`, `grant({ …, state: getState(), … })`; in `addSlot`: `getState().allowed[...]`, `{ state: getState() }`).
  2. In `createCookieConsent`: delete `const slots` and `const ran`. Right after `let state = compute();` add `const adapterSlots = createAdapterSlots({ ports, anonymous, getState: () => state });`. Replace `reconcile(next);` in `apply` with `adapterSlots.reconcile(next);` (keep its trailing comment), and the two `syncSlots` uses in the wiring with `adapterSlots.syncSlots` (`plugins.subscribe({ kind: ADAPTER_KIND, listener: adapterSlots.syncSlots })`, `adapterSlots.syncSlots(plugins.list(...))`, keeping the trailing comment).
- **Importers to update:** none (nothing new is exported).
- **After:** `createCookieConsent` ~80; `createAdapterSlots` ~58; file ~275 lines (counted ~225).
- **Risks / notes:** this is the browser bundle `dist/client.min.js`, built by a bundler and not serialized with `toString` (no `toString()` in `src/`), so a module-level helper is safe. `state` is a `let` that `apply`/`set`/`adopt` reassign, so the getter keeps the "read the current value later" semantics, and none of the moved code captures `state` by value. Creating the factory has no side effects, so the start/stop order the wiring sees doesn't change. `stop`'s existing `slot.run!` stays as is (moved code, not new).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/commerce/src/payments/ledger/rows.ts packages/commerce/src/react/Payments.tsx packages/cookie-consent/src/client/runtime.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
