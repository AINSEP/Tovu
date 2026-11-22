# wave1 lo-SC-2a — DONE

Sheet SC-2a (TESTS, Tovu): characterize `commit-site.ts` before it becomes a binding. Branch `wave1/lo-SC-2a` (Tovu only; Jini unchanged, nothing pushed there). Base Tovu `232764af`, Jini `65d73b0d` (both `origin/integ/merge-final-2026-11-16`).

## Commits (Tovu)
- `53ff98c3b9901b890b76f84969c8f7ceeb9d28a9` test(source-control): characterize commit-site before it becomes a binding (SC-2a). One new file, 351 lines, 13 tests, no existing test touched or deleted (test count in the folder's commit-site files before 86 -> after 99 in the 5-file run: +13).
- the report commit that carries this file (SHA in the final message).

## Setup and baseline (V0 / V1)
- Node 24.22.3 in `~/.local/node24`; Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` exit 0; Tovu `npm ci` exit 0 (install scripts were not run: npm 11 prints "Run npm install-scripts approve"; the tests needed none), `link-jini.mjs` (71 links), contracts + sdk built.
- Baseline on the unmodified tree: `npx tsc -p tsconfig.json --noEmit` exit 0 (no output); `npm run typecheck:tests` exit 0 (no output).
- Baseline tests of the sheet's neighbours (unmodified production file): `commit-site.unit`, `commit-site-export-resolution.unit`, `tool-registrations.dry-run`, `tool-registrations.unit` plus the new file: 99 tests, 99 pass, 0 fail.

## Gates run after the commit
- S-BLOB: `commit-site.ts` blob `faa002ba…` matches the sidecar (no drift). S-PRE: none for SC-2a.
- tsc, `typecheck:tests`: exit 0 after the commit. `npx eslint` on the new file: clean (one `sonarjs/no-nested-incdec` warning was fixed before committing).
- S-LIM per-file limits (50 / 10 / 10 / 500) run with `--no-inline-config` on the new test file: no finding (tests are excluded from the S-LIM file list; run anyway for the owner rule). S-SUPPRESS, S-MOCK, S-NET: print nothing.
- S-FORWARD, S-CENSUS, S-COMMENT, S-SCHEMA, S-DELETE, S-CRED, S-BOOT: not applicable / nothing in the diff (one added test file, no production change).
- No test process left running (`pgrep -fa "node --test|vitest"` empty).

## V3 — mutation turns each test red (script applies one replacement to `commit-site.ts`, runs the file, restores; `git diff --quiet` after: clean)
| mutation | red test |
|---|---|
| M1 `commitMessage must be 1-` text; M2 `invalid branch name '` text; M3 folder-unsupported guard off | every target refusal |
| M4 folder error message replaced by a fixed string | an invalid folder |
| M5 storage prefix; M6 no-credential text; M7 wrong-provider text | every credential refusal (M5 also the saved-key test) |
| M8 export-throw text; M9 `refused to commit:`; M10 collision prefix; M11 generic packaging sentence | every export refusal (M8 also preview) |
| M12 provider throw returns `error.message` | provider that throws |
| M13 wiring-bug sentence | missing git adapter |
| M14a drop `folder`; M14b `entryPath` without prefix; M14c no `divergedPaths ?? []` | success object |
| M15 `branch` always spread | adapter receives… |
| M16 no redaction; M17 `in` instead of `Object.hasOwn` | provider refusal never carries the token |
| M18 export before credential | phases order (+3 more) |
| M19 saved key always asked; M20 saved key asked after a store throw | saved API key only when absent |
| M21 no cleanup after export; M22 no cleanup after a throw | run directory is gone |
| M23 preview `providerId` default; M24 preview `paths: []` | previewCommitExport |
Every mutation went red; none was "NOT RED".

## STOPs hit
None.

## Deviations / notes
- `npm run check:size` and `npm run check:complexity` exit 1 on the UNMODIFIED base (17 and 23 existing "Worsened/New violation" lines in files this sheet does not touch, for example `server/runtime/composition/deps.ts`, `members/list.ts`). Output is byte-identical with and without the new file (diffed). Recorded as a red baseline of the repo ratchets, not fixed here; the commit adds no violation.
- Expected values that came from a library, not from `commit-site.ts`, were observed by running it once and then pinned: the folder sentence `Target folder cannot contain . or .. segments.`, the redaction `[REDACTED:exact_secret]`, the layout paths (`sites/fixture/images/image.png`). My first draft guessed two of these wrong (fixture typo and layout path); fixed before the commit.
- `previewCommitExport`'s byte total is pinned as "equals the bytes the commit adapter receives", not as a literal (README text is layout-owned).
- Tests use fakes of `SourceControlCredentialSetRepoPort` (via its `canonical` reader), `SecretSealerPort`, the bound export call and the id source. `t.mock.method(console, "warn")` is used only to capture/silence the log line (no package internals mocked). The real `prepareStaticReport` / `staticDownloadLayout` run, as in the existing tests.
- Requirement-not-behaviour items: none (every test is green on the parent).

## Next step
SC-2b (SEAM): `commit-site.ts` becomes a binding over Jini's `commitSiteToSourceControl`, after SC-1 lands in Jini; the 13 tests here must stay green unedited.
