# Terra job size-07: split 3 Jini file(s) by responsibility (size limits)

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
### jini:packages/daemon/src/event-log.ts
- **Over:** `createInMemoryEventLog` 104
- **Phase:** now · **Batch:** size-07
- **Tests:** `src/__tests__/event-log.test.ts`, `src/__tests__/run-lifecycle.test.ts` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `TERMINAL_EVENT`, `DEFAULT_*`, `InMemoryEventLogOptions`, `RunLog`, `compactRunLog` | constants/types (stay) |
| B | in `createInMemoryEventLog`: `const endedRuns`, `removeRun`, `noteRunPhase`, `enforceRunCap` | ended-run retention + run cap |
| C | `createInMemoryEventLog` rest: options, `runs`, `getOrCreateRunLog`, returned `append`/`replay` | the log itself |

- **Splits:**
  1. HELPER `createRunRetention({ runs, terminalRetentionMs, maxRuns, scheduler }: CreateRunRetentionInput): { removeRun(runId: string): void; noteRunPhase(runId: string, runLog: RunLog, event: string): void; enforceRunCap(): void }` — module level above `createInMemoryEventLog` ← statements `const endedRuns = new Set<string>();` through `function enforceRunCap(): void {` (the `endedRuns` and `noteRunPhase`/`enforceRunCap` "why" comments move with them). `createInMemoryEventLog` keeps `runs`, calls `const { removeRun, noteRunPhase, enforceRunCap } = createRunRetention({ runs, terminalRetentionMs, maxRuns, scheduler });` right after `const runs = …` (same position as before). Inner function signatures stay positional (they are existing closures, not new helpers).
- **Importers to update:** none (nothing exported moves).
- **After:** file ~140; `createInMemoryEventLog` ~80; `createRunRetention` ~27.
- **Risks / notes:** `removeRun` is also used by the returned object (`uses: removeRun`) — destructure it from the helper result. Order of scheduler calls in `noteRunPhase` unchanged.

### jini:packages/daemon/src/frontend-session-registry.ts
- **Over:** `createFrontendSessionRegistry` 131
- **Phase:** now · **Batch:** size-07
- **Tests:** `src/__tests__/frontend-session-registry.test.ts`; smoke `src/http/__tests__/index.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | exported types/interfaces, `FrontendSessionCapacityError`, `assertSessionCapacity` | contract (stays) |
| B | `coversCapability`, `resolveTarget` | route a capability call to the bound surface |
| C | `invoke`, `progress`, `settle` | invocation lifecycle (pending map per session) |
| D | `sessions`/`runBindings`/`bindTokens`, `attach`, `bindRun`, `bindRunByToken`, `sessionFor`, `capabilitiesFor`, `ownsSession` | attachment + binding (stays in the factory) |

- **Splits:**
  1. HELPERS (module level, above `createFrontendSessionRegistry`, in this order):
     - `coversCapability` moves out unchanged (pure; its "why" comment moves).
     - `resolveInvocationTarget({ runBindings, runId, capabilityId }: ResolveInvocationTargetInput): AttachedSession` ← body of inner `resolveTarget` (comment moves). Inner `resolveTarget(runId, capabilityId)` call sites become `resolveInvocationTarget({ runBindings, runId, capabilityId })`.
     - `createInvocationChannel({ sessions, runBindings, newInvocationId }: CreateInvocationChannelInput): Pick<FrontendSessionRegistry, 'invoke' | 'progress' | 'settle'>` ← inner `invoke` (with its `async` "why" comment), `progress`, `settle` verbatim. Factory then does `const { invoke, progress, settle } = createInvocationChannel({ sessions, runBindings, newInvocationId });` after `bindTokens` is declared.
- **Importers to update:** none.
- **After:** file ~215; `createFrontendSessionRegistry` ~70; `createInvocationChannel` ~55.
- **Risks / notes:** `invoke` must stay `async` so a `resolveTarget` throw becomes a rejection (see its comment). If `progress`'s parameter type is inline, keep it inline (or `Parameters<FrontendSessionRegistry['progress']>[0]`).

### jini:packages/daemon/src/http/attachments.ts
- **Over:** file 871 lines · `createDiskAttachmentStore` 189
- **Phase:** now · **Batch:** size-07
- **Package entry:** not itself an `exports` target; `./http` → `src/http/index.ts`, which re-exports from `./attachments.js` (~L325-352). Retarget those `export { … } from` / `export type { … } from` lines per name to the new modules (index.ts IS the entry, so it keeps exporting every name). attachments.ts does NOT re-export.
- **Tests:** `src/http/__tests__/attachments.test.ts`, `attachments-coverage.test.ts`, `attachments-idle-activity.test.ts`, `attachment-lookup.test.ts`, `attachment-site-staging.test.ts`, `remote-attachment-boundaries.unit.test.ts`, `src/http/__tests__/index.test.ts`, `src/__tests__/image-prompt-delivery.test.ts`. No `vi.mock` of attachments (re-check with rg). Tests import moved names from `../attachments.js` → path edits only.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A model | `StoredAttachment`, `AttachmentClaim`, `AttachmentRejectionReason`, `AttachmentRejectedError`, `AttachmentRecord`, `PendingAttachmentSummary`, `RecordedAttachmentIdentity`, `ObservedAttachmentIdentity`, `BATCH_ID_PATTERN`, `formatByteLimit`, `AttachmentStore` (interface, so http need not import the store file) | record types, store contract, the refusal error |
| B signature | `hasIsoBmffFtypTag` … `hasAvifSignature`, `ftypBoxEnd`, `SIGNATURE_BYTES`, `PNG_SIGNATURE_PREFIX`, `hasPng/Jpeg/Gif/WebpSignature`, `IMAGE_SIGNATURE_MATCHERS`, `detectAttachmentKind` | sniff image kind from leading bytes |
| C claim | `stagedPathsByAttachment`, `stageAttachmentClaim`, `isUnchangedAttachment`, `reserveAttachmentRecords`, `verifyClaimedAttachments` | two-phase claim + staging into a host boundary |
| D persistence | `SIDECAR_DIRECTORY_NAME` … `prepareAttachmentStorage` (L814-1088) | sidecar records across restarts |
| E http | `REJECTION_STATUS`, `apiErrorForRejection`, `writeBoundedAttachmentBody`, L1371-end (`AttachmentsInternalErrorContext` … `registerAttachmentRoutes`) | upload/cleanup HTTP routes |
| F store (stays) | `CreateDiskAttachmentStoreOptions`, `sanitizeAttachmentName`, `isUnclaimedOrClaimedBy`, `createDiskAttachmentStore` | the disk-backed store |

- **Splits** (order matters: each new module imports only modules created before it):
  1. NEW `attachments-model.ts` — unit A. Imports nothing local.
  2. NEW `attachments-signature.ts` — unit B (its "why" comments, incl. the ISO-BMFF/AVIF paragraphs). Imports types from model.
  3. NEW `attachments-claim.ts` — unit C. Exports `stagedPathsByAttachment` too (store uses it at `claim`). Imports model.
  4. NEW `attachments-persistence.ts` — unit D (the `// ----` section banner + its paragraph move as the file header). Exports `SIDECAR_DIRECTORY_NAME`, `TimestampedAttachmentRecord`, `attachmentSidecarFileName`, `writePersistedAttachment`, `prepareAttachmentStorage` + the existing exports. Imports model + claim.
  5. NEW `attachments-http.ts` — unit E. Imports model + signature only (rule 5: never imports attachments.ts).
  6. HELPERS in `createDiskAttachmentStore` (module level, above it, in run order):
     - `createAttachmentRecordFiles({ canonicalUploadDirectory, records, retainAcrossRestarts }: AttachmentRecordFilesInput): { sidecarPathFor; persistRecord; forgetRecord; resolveBatchDirectory; removeEmptyBatch; deleteRecord }` ← `const sidecarDirectory` through `const deleteRecord` (comments move).
     - `assertRegularCanonicalFile({ filePath }: AssertRegularCanonicalFileInput): Promise<Stats>` ← in `register`: `const info = await lstat(filePath)` through the `canonical !== filePath` throw (stays inside the existing try).
     - `assertAttachmentQuota({ records, batchId, size, limits }: AssertAttachmentQuotaInput): void` (limits = `{ maxAttachments, maxBatchBytes, maxStoredAttachments, maxStoredBytes }`) ← `const batchRecords = …` through the `storage-full` throw; `totalBytes` moves to module level as `totalAttachmentBytes({ candidates })`.
     - `buildAttachmentRecord({ input, filePath, batchDirectory, info }: BuildAttachmentRecordInput): TimestampedAttachmentRecord` ← the `const id`/`const record` literal.
     - `claimStoredAttachments(…)` and `resolveAttachmentsForRun(…)` ← bodies of the `claim` and `resolveForRun` props, taking `{ records, findRecord, stagedPathsByRecord }` plus the prop's own input object; props become one-line delegations.
- **Importers to update:** `src/http/index.ts` (entry: retarget), `src/remote-attachment-lookup.ts` (`AttachmentRejectedError`, `AttachmentRejectionReason` → model), `src/http/attachment-lookup-routes.ts` (`AttachmentRejectedError` → model; `AttachmentStore` → model), the 8 tests above (per moved name).
- **After:** attachments.ts ~220; `createDiskAttachmentStore` ~85; model ~115; signature ~65; claim ~80; persistence ~190; http ~190.
- **Risks / notes:** `register`'s try/catch must still wrap the moved checks (rm + removeEmptyBatch on any throw). `prepareAttachmentStorage` must still run before `stagedPathsByRecord` is created (same order). `AttachmentRejectedError` instanceof checks: one class, now in model — every import must point there (no duplicate class).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/daemon/src/event-log.ts packages/daemon/src/frontend-session-registry.ts packages/daemon/src/http/attachments.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
