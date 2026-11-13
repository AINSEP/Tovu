# Terra job size-08: split 3 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

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
### tovu:apps/website/src/features/publish-content/gated-hooks.ts
- **Over:** `buildPublishContentImportHooks` 104 (file 171, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-08
- **Tests:** `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts`; plus `rg -l "gated-hooks" apps/website/src --glob '*.test.*'`. No test mocks this module.
- **Responsibility map:** A = nested `async function buildReport(): Promise<PublishContentReport>` (re-derive the current report from live state — reads only `input`); B (stays) = the returned hooks object with `executeMutation`.
- **Splits:** HELPER at module level directly above `buildPublishContentImportHooks`: `buildCurrentPublishContentReport({ input }: { input: BuildPublishContentImportHooksInput }): Promise<PublishContentReport>` ← A's body word for word (its "never cached across…" comment moves). Inside the factory keep `const buildReport = () => buildCurrentPublishContentReport({ input });` so the hooks object is unchanged.
- **Importers to update:** none.
- **After:** `buildPublishContentImportHooks` ~73; file ~175.
- **Risks / notes:** none.

### tovu:apps/website/src/features/publish-content/peer-transport.ts
- **Over:** file 541 lines (no function over)
- **Phase:** now (label ?) · **Batch:** size-08
- **Tests:** `apps/website/src/features/publish-content/__tests__/peer-transport.test.ts`, `.../__tests__/peer-transport.l061.test.ts`, `.../__tests__/peer-transport-blob-pull.test.ts`, `.../__tests__/plan-pull-tool.test.ts`, `apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`, `apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A call | `PeerTransportErrorCode`, `PublishContentPeerTransportError`, `describePeerEgressRefusal`, `toTransportError`, `PEER_NETWORK_REASONS`, `peerNetworkReason`, `peerCauseCode`, `PEER_REFUSAL_REASONS`, `peerRefusalReason`, `peerIncidentId`, `peerBodyRefusalReason`, `peerStorageRefusalReason`, `PEER_REQUEST_TIMEOUT_MS`, `PeerCallDeps`, `callPeer`, `isCredentialKindRefusal`, `credentialKindRefusalMessage`, `peerRoute`, `requireObject`, `peerRequestPayload` | one authenticated peer call and its single failure funnel |
| B pull | `pullBundleFromPeer`, `PeerBlobSink`, `PUBLISH_CONTENT_PULL_MAX_BLOBS`, `PullBlobsResult`, `pullBlobsFromPeer`, `fetchVerifiedPeerBlob` | PULL: fetch a peer's envelope and blobs |
| C push (stays) | `PeerBlobSource`, `NotSupportedByLiveEntry`, `PushBundleResult`, `LEGACY_PEER_ENTITY_TYPES`, `LEGACY_PROBE_STATUSES`, `PeerCapabilities`, `refuseOverwriteOnOlderPeer`, `probePeerCapabilities`, `trimBundleToCapabilities`, `pushBundleToPeer`, `confirmPeerImport`, `executePeerImport`, `peerApplyCompleted`, `uploadMissingPeerBlobs` | PUSH steps 1-3 |

- **Splits:**
  1. NEW `peer-call.ts` (same folder) — job: one authenticated peer call + error classification. Moves unit A word for word (keep every "never echo" / incident-envelope comment). Exports `PeerTransportErrorCode`, `PublishContentPeerTransportError`, `describePeerEgressRefusal`, `PEER_REQUEST_TIMEOUT_MS`, `PeerCallDeps`, `callPeer`, `peerRoute`, `requireObject`. Imports nothing from `peer-transport.ts`. Copy the file-header paragraph about the error type/egress refusal into its header.
  2. NEW `peer-transport-pull.ts` — job: the pull driver's peer leg. Moves unit B word for word (the `PUBLISH_CONTENT_PULL_MAX_BLOBS` resource-bound comment moves). Exports `pullBundleFromPeer`, `PeerBlobSink`, `PUBLISH_CONTENT_PULL_MAX_BLOBS`, `PullBlobsResult`, `pullBlobsFromPeer`. Imports from `./peer-call.js` only.
  3. `peer-transport.ts` keeps unit C and imports `callPeer`, `peerRoute`, `requireObject`, `PublishContentPeerTransportError`, `PeerCallDeps` from `./peer-call.js`.
- **Importers to update** (each name → its new module; names not listed stay on `peer-transport`):
  - `PublishContentPeerTransportError` → `peer-call`: `features/publish-content/tool-registrations.ts`, `server/inbound/admin-http/routes/publish-content/peer-transport.ts`, tests `features/publish-content/__tests__/{peer-transport,peer-transport.l061,peer-transport-blob-pull,plan-pull-tool}.test.ts` (plan-pull-tool uses a dynamic `import("../peer-transport.js")`), `server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`.
  - `PeerCallDeps` → `peer-call`: `features/publish-content/push-plan.ts` (keep `pushBundleToPeer`, `NotSupportedByLiveEntry` on `peer-transport`), `features/site-backup/share-hosting.ts` (also `callPeer`), `server/inbound/admin-http/routes/publish-content/{peer-transport,backstop}.ts`, tests `features/site-backup/__tests__/{share-hosting.unit,share-delivery.integration}.test.ts`.
  - `callPeer`, `describePeerEgressRefusal` → `peer-call`: `features/publish-content/__tests__/peer-transport.l061.test.ts` (`callPeer`), `.../__tests__/peer-transport.test.ts` (`describePeerEgressRefusal`).
  - `pullBundleFromPeer`, `pullBlobsFromPeer` → `peer-transport-pull`: `features/publish-content/pull.ts`, tests `peer-transport.test.ts`, `peer-transport.l061.test.ts`, `peer-transport-blob-pull.test.ts`.
  Re-run `rg -n "peer-transport(\.js)?['\"]" apps --glob '!node_modules'` and fix every import whose names moved (`#src/features/publish-content/peer-transport` alias form included; the `routes/publish-content/peer-transport.ts` route file is a DIFFERENT module — its own importers do not change).
- **After:** `peer-transport.ts` ~230; `peer-call.ts` ~175; `peer-transport-pull.ts` ~120.
- **Risks / notes:** no behavior moves; only import graph. `PeerBlobSource` stays (composite-blob-source.ts imports it from `peer-transport`).

### tovu:apps/website/src/features/publish-content/raw-file-contributor.ts
- **Over:** `contributeRawFilePublish` 152 · its `build` 150 (file 199, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-08
- **Tests:** `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-undo.routes.pins.test.ts` (it `mock.module`s THIS path spreading the real exports + `undoRawFile` — no export moves, so the mock still covers everything), `.../publish-content/__tests__/backstop-import-ui.routes.test.ts`.
- **Responsibility map** (inside `build(deps)`):

| unit | nested functions | job |
|---|---|---|
| A path/blob | `pathReason`, `blob` | policy reason for a path; read a packed blob |
| B check | `check`, `checkedBytesReason` | scan verified bytes + compare state hash |
| C pack | `selectedPaths`, `selectedFile`, `packFile`, `recordInverse` | read selected files, index snapshots, record undo inverses |
| D (stays) | `files`, `skipped`, `const handler: PublishContentHandler = {`, `return handler` | the raw-file handler |

- **Splits:**
  1. HELPER `buildRawFileHandler({ deps }: { deps: PublishContentDeps }): PublishContentHandler` at module level directly above `contributeRawFilePublish` ← the whole `build` arrow body. `contributeRawFilePublish` returns `{ entityType: "raw-file", dependsOn: [], build: (deps) => buildRawFileHandler({ deps }) }` (mirrors `raw-row-contributor.ts`'s `buildRawRowHandler`). Use the `deps` type the contributor interface gives `build` (copy it; `PublishContentDeps` in raw-row).
  2. HELPERS at module level above `buildRawFileHandler`, bodies word for word with their `@complexity` comments: `rawFilePathReason({ deps, relPath })`, `readRawFileBlob({ deps, entity })`, `checkRawFile({ deps, files, entity }, { sourceBytes } = {})` (calls the two above), `checkedBytesReason({ entity, bytes, relPath, size })` (already one-object; just move), `readSelectedRawFile({ deps, files, relPath })`, `packRawFile({ deps, files, skipped, relPath, file })`, `recordRawFileInverse({ deps, entity, inverse })`, `selectedRawFilePaths({ deps, files })`. Return types = the nested ones' (copy). `files` type = `NonNullable<PublishContentDeps["backstop"]>["files"]` (or the existing name). Inside `buildRawFileHandler` the `handler` object calls them with `deps`/`files`/`skipped`.
- **Importers to update:** none (exports unchanged).
- **After:** `contributeRawFilePublish` ~3; `buildRawFileHandler` ~78; file ~215.
- **Risks / notes:** `skipped` must stay ONE array per `build` call (created in `buildRawFileHandler`, passed by reference).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/features/publish-content/gated-hooks.ts apps/website/src/features/publish-content/peer-transport.ts apps/website/src/features/publish-content/raw-file-contributor.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
