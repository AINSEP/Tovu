# kt-K-02b: `widgets/media-html.ts` -> `@jini-ai/cms/widgets/html` (DONE)

Branch `wave2/kt-K-02b` in both repos. Tovu base `origin/integ/ratchets-green-2026-11-17` (ac284a041), Jini base `origin/refactor/terra` (65d73b0d5). Sheet: lanes-2026-11-16 `K/K-02b` + `T-KT-MOVE` + `COMMON-KT`. Decisions KT-DK1, KT-DK2, KT-DT2..DT6 = Rec (none of them touches this sheet).

## Commits
Jini (`wave2/kt-K-02b`):
- `aad371ac285dfa889fbddc677a4ebd9152a7ce00` feat(cms): add sanitizePageHtml and renderMediaRawHtml to widgets/html (M3)

Tovu (`wave2/kt-K-02b`):
- `403ff27cf52c68d8512f93da0622864430cc88c0` M1 test: media-html-events.unit.test.ts pins every console.warn (text, args, order) + malformed-fragment golden
- `850f91f15cc957e3712c13356d21a3644db300f4` M2a: split `resolveMediaTree` (helper `dropRejectedNode`), delete debt entry `resolveMediaTree#1`
- `c4f21c30fa0d48a849ba570e9a34d28a364e9bf3` M2b: `optional.report?: (event: {code, detail}) => void` replaces the 3 `console.warn`; Tovu binding `features/widgets/media-html-log.ts` (`logMediaHtmlEvent`, same text/args); `renderMediaWidget` passes it
- `a93122ac7484db7cf66dcc0181a232982f57d385` M2c: the 4 module-level sets typed `ReadonlySet<string>` (type only; needed by Jini guard HW3, keeps M3 a verbatim copy)
- `9ee51c43397d19e6d0a5191122947d04372fb811` M4: delete `features/widgets/media-html.ts`, repoint all 12 importer rows to `@jini-ai/cms/widgets/html` (Jini SHA in body)

## Setup / gates
- Node 24.22.3 (`~/.local/node24`), Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build`, Tovu `npm ci`, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`, build `packages/contracts` + `packages/sdk`.
- Blob guard: `git hash-object` of media-html.ts = 7e617484... (matches sheet). Ancestry of 232764af5 / 65d73b0d5: OK. M0: `rg "export (async )?function" packages/cms/src/widgets/html` has no `sanitizePageHtml` / `renderMediaRawHtml` -> continue. Census (10 importer rows) matched the sheet before M4 and prints no old path after M4.
- BASE (unmodified trees), recorded first:
  - Jini: `pnpm --filter @jini-ai/cms run typecheck` ok; `npx vitest run --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2` (cms) 338 files / 4085 tests passed; `pnpm guard` ok.
  - Tovu: `tsc -p tsconfig.json --noEmit` exit 0; `tsc -p tsconfig.tests.json --noEmit` exit 0; `npm run check:size` ok (203 violations, 193 debt); `npm run check:complexity` ok (43 entries); `npm run check:errors | rg "^(New|Worse):"` prints nothing; `npm run check:architecture` exit 1 = BASE RED (124 NEW cross-feature edge lines, +1/-2 cycle pairs, propagation cost runtime-only 3.06->3.18, API surface 821->853, hub count 335->363). Saved as the base output.
  - Tovu source-reading set (28 files: all `*.boundary.test.ts`, `apps/website/src/__tests__/*`, plugin-boundaries, check-hardwiring/hook-injection/dead-path-sweep/src-complexity-drift/architecture/dependency-cruiser/feature-ranks/site-key-names/no-linked-jini, eslint-rules tests): 445 tests, 438 pass, 6 FAIL on the base (domain-no-direct-tool-registration, no-vendor-in-core, check-site-key-names, dead-path-sweep x2, dependency-cruiser). Same 6 fail, no others, after every commit incl. M4 (verified against a worktree of the base).
  - Tovu media tests (8 importer test files + events test): 41 pass on base; 44 after M1.
- V3 (Tovu, M1): removed the kind-mismatch `console.warn` in `bindMediaSource` -> `media-html-events.unit.test.ts` "a mixed fixture logs ..." RED (actual list lacks the `media kind does not match` line; expected 3 entries, got 2); restored with `git show HEAD:<path> > <path>`, `git diff --quiet` ok.
- V3 (Jini, M3): same removal of the `media-kind-mismatch` report -> `media-html.unit.test.ts` "reports the sanitizer drops, then each kind mismatch and unknown slug" RED (1 failed | 4 passed); restored.
- V2 after each Tovu commit (tsc, tsc tests, the 9 media test files, eslint on touched files, `check:size`, `check:complexity`, `check:architecture`, `check:errors`): all exit 0 except `check:architecture` (base red). Normalised diff of the architecture output vs base: 0 lines at M1, M2a, M2b, M2c; at M4 one base line REMOVED (`NEW cross-feature edge: site-backup/import-keep-off.ts -> widgets/media-html.ts`), cross-feature edges 436->435, API surface 853 (unchanged), propagation (all-import) 12.44->12.43. Nothing added beyond the base output. (M2b/M2c intermediate: API surface 854, +1 = the new binding file; back to 853 at M4.)
- Jini V2 at M3 (after the HW3 fix): `pnpm --filter @jini-ai/cms run build` exit 0, typecheck exit 0, cms vitest 339 files / 4090 tests passed, `pnpm guard` exit 0 ("zero violations"). Tovu `tsc` (both configs) green against that dist.
- STOP matrix: S-IMPORT, S-BARREL, S-TEXT, S-RUNTIME, S-ARGS, S-SIZE (Jini): all empty. S-FN50 Jini: empty. S-FN50 Tovu: empty for the new/changed functions (4 hits at M4 are in `import-keep-off.ts` `formBodyMayRunScript` and `no-silent-drops.test.ts`, where only an import line changed; identical 7 eslint problems on the base, `formBodyMayRunScript#1` is a debt entry). S-SUPPRESS, S-MOCK, S-FORWARD, S-SCHEMA, S-DELETE: empty. (`t.mock.method(console, 'warn')` in the M1 test mocks the global console, not another package's internals.)

## Deviations from the sheet (all small, none changes behavior)
1. The sheet's `report` is wired next to the existing `reportDrops` / `reportIssue` options, which stay (their defaults now call `report`). Existing callers (`import-keep-off.ts`, the tests) use them, and replacing them would edit assertions (rule 7).
2. Event shape is `{ code, detail }` with `detail` = JSON text; codes `raw-html-dropped`, `media-kind-mismatch`, `unknown-media-slug`. The Tovu binding `JSON.parse`s it to print the same console arguments as before.
3. M1 could not assert a `report` fake on the parent (it does not exist yet): it pins the console lines instead, and the Jini test asserts the report list.
4. Extra Tovu commit M2c (ReadonlySet typing) because Jini guard HW3 flagged 4 new module-state occurrences; `report?: ... | undefined` added because Jini compiles with exactOptionalPropertyTypes.
5. Existing-test edits (rule 7a/b, listed): argument shape only, `{ report: logMediaHtmlEvent }` added in `media-html-report-drops` (2 tests), `media-html-characterization` (2 tests); in M4 the import specifier of the moved names in 8 test files (`mediawidget.integration`, `media-html-characterization`, `-events`, `-report-drops`, `-svg`, `-template`, `-tree-characterization`, `leading-style-regression`, `no-silent-drops`). No assertion changed.
6. Added a one-line cms README mention of the new exports and the changeset `.changeset/cms-widgets-html-media-html.md` (cms minor).
7. Comment edits in the Jini copy: header `@file`, the "Temporary host placement" note dropped, `5f237c87a stripped tovu.dev's carousel scripts` -> `a past sanitizer change stripped a site's carousel scripts` (S-TEXT).

## Left / next
- Tovu M4 imports `@jini-ai/cms/widgets/html` names that exist only in the Jini commit above: Tovu CI against the published `@jini-ai/cms` fails until Jini publishes a cms minor (the coordinated publish is not part of the sheet). Green here = against the linked Jini clone at `aad371ac2`.
- Overlaps noted: none edited by another sheet in this run's write set; shared files per INDEX (K-02b vs S2/S7/S8): `leading-style-regression.test.ts` (import line), `mediawidget.integration.test.ts` (import line), Jini `cms/src/widgets/html/index.ts` (one line added). `check:architecture` base red untouched.
- Jini guard prints "1 stale debt occurrences" for `scripts/hardwiring-debt.json` (pre-existing, not from this change).
- Nothing pushed to main, refactor/terra or plan/*; no force-push; no `--no-verify` (desktop pre-push hook skipped itself: no apps/desktop change). No processes left running.
