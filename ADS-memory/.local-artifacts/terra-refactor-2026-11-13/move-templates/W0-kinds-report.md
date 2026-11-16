# W0 step 2: REPOINT / DELETE / HARDEN calibration report (2026-11-15)

Clones: Tovu `/Users/la/Programming/tovu-codex-trial-terra`, Jini `/Users/la/Programming/jini-terra-base`, both on `refactor/terra`. No tests, tsc or installs run. Sheets: `move-templates/sheets/`. Scratch (census script and outputs): `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/6d305acc-73f7-4e6d-a4d1-9dd291981c30/scratchpad/w0-kinds/`. About 38 tool calls in total.

## Summary
| # | Feature | Kind given | Result | Jini SHA | Tovu SHA | START / END |
|---|---|---|---|---|---|---|
| 1 | platform/observability | REPOINT | DONE | none (pointer only) | `54dac1ff3` | 17:58:18 / 18:01:26 |
| 2 | platform/headless-browser | DELETE | SKIPPED (sheet-fill) | - | - | 18:01:26 / 18:02:10 |
| 3 | platform/routing | DELETE | SKIPPED (sheet-fill) | - | - | 18:02:10 / 18:02:52 |
| 4 | contracts/core/tool-metadata | HARDEN | SKIPPED (sheet-fill) | - | - | 18:02:52 / 18:03:35 |

## 1. REPOINT `platform/observability`: DONE
- Sheet: `sheets/repoint-observability.md` (written after executing, from working notes).
- Jini: no commit. The sheet's `jini_why` is "pointer only": Jini `noop.ts` and `ports.ts` already carry the zero-allocation and vendor-neutral rationale, and the Tovu-specific hermetic-root rationale already sits at `composition/app.ts:1416` and in the `provider-plugins.ts` header.
- Tovu `54dac1ff3`, 56 paths:
  - `apps/website/src/platform/observability/index.ts` deleted (blob was `17ef051047fdb1c4246becde1070ee2eb43f277a`).
  - 54 importers repointed to `@jini-ai/diagnostics/observability` (packages/diagnostics/package.json:40). All static imports (some multi-line); no dynamic, import-type, mock, namespace or text uses.
  - `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json`: the `opentelemetry` entry for the deleted file removed.
- eslint: no import, unused or unresolved errors. 12 errors (6 `max-lines`, 3 `complexity`, 3 `sonarjs/cognitive-complexity`) are debt in untouched code.
- RED tests: none (pure repoint). Cloud run: Tovu typecheck, and `no-vendor-in-core.boundary.test.ts` (could not confirm how it treats the removed exception).
- Untangle TSV rows (file-level, no changes needed unless the coordinator wants them refreshed): C3 `outbox-drainer.test.ts:278`, `site-inspection/deps.ts:347`, `source-control/store.ts:368`, `routes/types.ts:431`, `composition/deps.ts:406`, `form-submissions.ts:405`; C4 `site-exporter.ts:232`, `observability-middleware.test.ts:257`, `routes/types.ts:258`, `composition/app.ts:260`, `composition/deps.ts:261`; C6 `routes/types.ts:245`, `assistant-byok.ts:250`; C10 `publish-agent-tools.ts:149`. The C8 `otel-sdk.ts` row is unaffected (file not touched).

## 2. DELETE `platform/headless-browser`: SKIPPED
- Sheet: `sheets/delete-headless-browser.md`. Nothing edited, no commit.
- Why: `lazy-browser.ts` is not dead and not a pure pass-through. Besides re-exporting Jini `createLazyBrowser`, it holds `encodeJpeg` (default quality 72; 1 caller in `site-preview/playwright-site-preview-capture.ts:75`) and `importPlaywrightChromium` (wraps the host `playwrightModuleLoader`; 1 prod caller `web-screenshot/playwright-page-capture.ts:91`, plus a test asserting the delegation).
- A fold needs a home for two function bodies, moving their real-sharp and module-mock tests (COMMON rule 20 forbids dropping assertions), and handling the path literal in `image-codec.boundary.test.ts:6`. T-DELETE has no field for any of these.
- **What it really is:** MOVE/SPLIT. `encodeJpeg` (generic, uses the image codec port) is a MOVE to a Jini package or a fold into the site-preview capture; `importPlaywrightChromium` is host module resolution that stays in Tovu or goes into `playwright-page-capture.ts` (which is itself MOVE-AFTER to `@jini-ai/diagnostics/web-evidence`, so ordering matters). The template for that would need: per-function destination and export decision, relocated tests with assertions verbatim, and a decision on the boundary-test path list. Once those are moved, the re-export part is a plain REPOINT of `createLazyBrowser`/types to `@jini-ai/diagnostics/web-evidence/playwright`, then the file is a true DELETE.
- Untangle TSV rows: none.

## 3. DELETE `platform/routing`: SKIPPED
- Sheet: `sheets/delete-routing.md`. Nothing edited, no commit.
- Why: not dead. `reserved-paths.ts` has three wrappers over `@jini-ai/http-kit/verified-origin` that bind Tovu's `RESERVED_SEGMENTS`, plus three types and the constant. Survey note says "Keep only RESERVED_SEGMENTS". 14 importers (11 import `RESERVED_SEGMENTS`, the barrel re-exports all names, one wrapper test). Wrapper callers through the barrel: `pages.ts:2898`, `visitor-page-targets.ts:31,35`, `site-inspection/published-page.ts:199,275`, `theme/visitor-publication.ts:154`, `assistant/site/visitor-page-tools.ts:45`.
- **What it really is:** reduce-to-binding (DEDUPE-style), not DELETE. The file survives holding only the constant; callers of the wrappers pass `reservedSegments` to the Jini functions (or one thin Tovu binding stays); the wrapper test must be repointed or relocated. The template for that would need: `tovu_file_after` (kept content), a per-caller old to new call list, a test disposition for the wrapper test, and the arg-lane churn guard for `pages.ts`. Untangle lane C4 already has a repoint row on this file, so sequence after it.
- Untangle TSV rows: C4 `reserved-paths.ts:240`.

## 4. HARDEN `contracts/core/tool-metadata`: SKIPPED
- Sheet: `sheets/harden-tool-metadata.md`. Nothing edited, no commit.
- Why: the parity list is empty. Jini `ToolApprovalMetadata` (`packages/core/src/tool-metadata-types.ts:2`, on the `@jini-ai/core` barrel, no subpath) has the same `class` (8 values), `confirmation` (3) and `input`. Only difference: Tovu's `rule` is a closed six-value union, Jini's is `string`. That narrowing is product policy and stays in Tovu. 63 importers, all type-only.
- **What it really is:** DEDUPE with a narrowed binding: `interface ToolApprovalPolicy extends ToolApprovalMetadata { readonly rule?: <union> }` and `ToolApprovalClass = ToolApprovalMetadata['class']`. No importer change, no Jini commit. T-DEDUPE would need: a "type-only, narrowing" variant (no behaviour diff to list) and the import specifier rule for barrel-only Jini exports.
- Untangle TSV rows: none.

## Template fixes (concrete wording)
1. **KINDS.md / `classify.py`, DELETE detection.** Both DELETE rows were "fold with retained logic or binding". Add to the Detect line: "Reclassify a DELETE row to DEDUPE/MOVE when the file has any statement other than a re-export (function body, constant, wrapper), unless the survey note lists that statement as dead." The filler should print `non_reexport_statements: N` per file.
2. **T-DELETE, add a reduce form.** After `why_dead`, add: `tovu_file_after: {delete | keep only: <names>}`. In Steps, replace step 4 with: "If `tovu_file_after` is `delete`: `git rm -q`. Else rewrite the file to exactly the kept content and re-run `reach_check` for the removed names." Also add a `moved_bodies:` field: `{function} -> {destination file}, exported? {yes|no}`, and a tests option `relocate to {file} (assertions verbatim)`. Without these a fold with real logic is a guaranteed SKIP.
3. **T-DELETE `reach_check`, separate comment hits.** Add: "Hits that are only comments go under `comment_refs: {path}:{line} | "{old}" -> "{new}"` (same as T-REPOINT). A path literal inside a list that a test scans (for example `image-codec.boundary.test.ts:6`) is edited out of the list only when the sheet says so; otherwise SKIP." Note that `rg -F <basename>` also matches substrings of other names; require the census script, not rg alone.
4. **T-REPOINT step 1, ship the census script.** The recipe says "resolve every quoted specifier" with no tool. Put `scratchpad/w0-kinds/census.py` (handles `#src/`, `@/`, relative, `.js` to `.ts`, folder `index`) into `move-templates/scripts/` and cite: "Run `python3 scripts/census.py <clone> <tovu_file>`; its output must equal `importers`." An `rg` for the folder name misses `../../index.js` style imports.
5. **T-REPOINT step 4, mechanical rewrite and caps.** Add: "When every name maps to ONE specifier, replace only the specifier string on each census line (the `} from` line for multi-line imports); do not merge with an existing import of the same Jini specifier (lint has no duplicate-imports rule)." Change the cap "40 rows" to "40 EDITED FILES": one file with 54 importers is one row but 54 edits.
6. **T-REPOINT `comment_refs`, define the scope.** Add: "Only comment lines that give a live path to the deleted file. Comments naming the folder or feature conceptually, or describing history (for example 'its one entry was platform/observability/index.ts'), stay."
7. **T-REPOINT `jini_why`, add a decision rule.** Add: "If the shim's header holds long rationale: (a) the idea is already on the Jini declaration, choose `pointer only`; (b) it is generic and absent in Jini, choose MOVE; (c) it is Tovu-specific and already sits at the Tovu binding (composition, provider wiring), drop it. Tovu-specific text with no home in Tovu is a STOP." The recipe currently covers (a) and (b) only.
8. **Baselines, widen the search.** T-REPOINT and T-DELETE name only `write-path-inventory.baseline.json` and `coverage-integrity-baseline.json`. The real one here was `features/deployments/deploy-targets/__tests__/vendor-exceptions.json`. Add a step: "`rg -F <repo-relative path of the deleted file>` over every `*.json`, `*.mjs` and `*.yml` in the repo (not node_modules); every hit is a baseline row to remove or a STOP." Have the filler run it.
9. **COMMON "Checks", eslint noise.** Running eslint on 54 files printed 12 pre-existing errors (`max-lines`, `complexity`, cognitive). Add: "Run with `-f json`. Fail only on errors whose rule matches import/unused/resolve or that sit on a line your diff changed. Pre-existing errors in untouched lines are recorded and ignored (they are the gate debt list)." Otherwise an executor may STOP wrongly or try to fix debt.
10. **COMMON "Git", deleted files.** State: "A file removed with `git rm -q` must also be listed in the `git commit -F ... -- <paths>` pathspec; verify with `git show --stat HEAD`." Also note that `git gc.log` warnings on commit are harmless.
11. **T-HARDEN step 0, empty parity.** Add: "If the parity list has no row (Jini already has every behaviour, and the only differences are Tovu product policy or a narrower type), STOP this template: reclassify as DEDUPE with a binding that narrows the Jini type. Record the label as wrong." The classifier's `DEDUPE-AFTER-HARDENING` (similarity 0.8) was wrong here.
12. **T-HARDEN / filler, barrel-only Jini exports.** `jini_survivor: @jini-ai/pkg/subpath` cannot express `ToolApprovalMetadata`, which is only on the `@jini-ai/core` barrel. Allow `{@jini-ai/pkg} (barrel)` and state that the barrel rule in COMMON rule 5 binds Jini-side imports only; Tovu may import barrels.
13. **Process, write the sheet before editing.** The observability sheet was written after the edit. Make step "save the sheet to `sheets/<kind>-<slug>.md` first" explicit in the plan and have the filler script write it, so a mid-run discovery is visible as a sheet change.
14. **PLAN.md, tier estimate.** The tier "Sonnet-sheet / script" for observability under-counted: 54 edited files, the census script and a baseline search. Count edited files (importers), not source lines, for REPOINT cost.

---

# Run 2 (2026-11-15): rewritten sheets dedupe-tool-metadata and delete-headless-browser

Both executed from the rewritten templates (T-DEDUPE with `type-narrowing`, T-DELETE with moved bodies/relocations) and COMMON. No tests, tsc or installs run. Tovu base 54dac1ff3 plus other agents' commits.

| # | Sheet | Result | Jini SHA | Tovu SHA | START / END |
|---|---|---|---|---|---|
| 5 | dedupe-tool-metadata | DONE | none | `3a1603979` | 18:18:57 / 18:19:35 |
| 6 | delete-headless-browser | DONE | `465122282` (Jini clone) | `311d5d7ae` | 18:19:35 / 18:21:00 |

## dedupe-tool-metadata: DONE
- Paths: 1 (`apps/website/src/contracts/core/tool-metadata/approval-policy.ts`). All blobs and the Jini barrel chain matched. Census 63 hits, all type-only (58 siblings, `index.ts:4`, `headless/assistant-tool-approval-policy.ts:2` and `:12`).
- eslint: 0 messages. Cloud run owes: Tovu typecheck only. No RED test.
- Untangle TSV rows: none.

## delete-headless-browser: DONE
- Jini `465122282`: new test-only file `packages/diagnostics/src/web-evidence/__tests__/lazy-browser-owner.test.ts` (79 lines, relocation R1 verbatim, vitest header). No changeset. Rule-2 `rg` printed nothing; eslint 0 messages.
- Tovu `311d5d7ae`, 8 paths: deleted `platform/headless-browser/lazy-browser.ts` and `__tests__/lazy-browser.unit.test.ts`; edited `playwright-loader.ts` (+`importPlaywrightChromium`), `__tests__/playwright-loader.unit.test.ts` (+R3), `features/sites/site-preview/playwright-site-preview-capture.ts` (+`encodeJpeg`, `createLazyBrowser` import from Jini, comment), `features/sites/__tests__/playwright-site-preview-capture.unit.test.ts` (+R2), `features/web-screenshot/playwright-page-capture.ts` (import + comment), `features/image-transform/__tests__/image-codec.boundary.test.ts` (path literal).
- All 9 blob guards and the Jini "file must not exist" guard passed. Census and reach_check matched the sheet. After the edit no hit of `platform/headless-browser/lazy-browser` remains.
- eslint: 0 errors; 1 pre-existing warning (`max-lines-per-function` in `playwright-page-capture.ts`, untouched code).
- RED tests: none (no behaviour change). Cloud run owes: Jini diagnostics vitest `lazy-browser-owner.test.ts`; Tovu `playwright-loader.unit`, `playwright-site-preview-capture.unit`, `image-codec.boundary`; Tovu typecheck. One risk to watch in that run: R3 (`t.mock.module("playwright")`) now sits in the loader test file, which already used it at line 28.
- Untangle TSV rows: none match any changed file (grepped all `*.repoint.tsv`).
- Coordinator note carried from the sheet: `features/web-screenshot` (MOVE-AFTER) now sees `importPlaywrightChromium` imported from `#src/platform/headless-browser/playwright-loader`; its move must take the loader as an injected port.

## Sheet errors found
None blocking. Small ones:
1. T-DELETE step 1 and the dedupe sheet cite `scripts/census.py`, which does not exist in `move-templates/scripts/` (only classify/judge/signals/make-sheet). I used my scratchpad copy (`scratchpad/w0-kinds/census.py`). Add it to the folder.
2. The headless-browser sheet's moved-bodies row says the destination anchor line is "occurring once" and lists the text as "lines 25-29 / 31-41"; both were exact. Line-number ranges worked because blobs were guarded, which is the right design.
3. The dedupe sheet says "11 lines" for the new file; the actual file is 12 lines (import, blank, 7 comment lines, 2 declarations = 11, plus the file ends with a newline). Harmless, but say "11 lines plus trailing newline".
4. Relocation R2/R3 said imports "already imported there"; true, but the sheet should list the import line for `importPlaywrightChromium` in `playwright-site-preview-capture.unit.test.ts` as an explicit row (it does, as an importers row); fine.
