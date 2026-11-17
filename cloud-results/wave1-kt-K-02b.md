# wave1 kt-K-02b: STOPPED "baseline red" (no source step started)

Sheet: `K/K-02b-widgets-media-html.md` (plan branch `plan/lanes-k-t-2026-11-16`), assembled with `T-KT-MOVE.md` + `COMMON-KT.md`.
Base: `origin/integ/merge-final-2026-11-16` in both repos (Tovu `232764af`, Jini `65d73b0d`). Branch `wave1/kt-K-02b` in both; this report is the only commit.

## Outcome
- Steps done: setup, V0, M0 (decision), V1 (baseline). M1..M4: NOT STARTED.
- Reason: COMMON-KT V1 says a red baseline on the UNMODIFIED tree = STOP "baseline red", never fix it. The four Tovu gates below are red on the unmodified merge-final tree, so no Tovu commit can pass V2, and M3 (Jini copy) needs the M2 seam first.
- Source pushed: none. Pushed SHAs: only the commit carrying this report (Tovu `wave1/kt-K-02b`). Jini: nothing pushed.

## Setup (V0)
- Node v24.22.3 (nodejs.org, sha256 verified) in `~/.local/node24`, corepack enabled there.
- Jini: `pnpm install --frozen-lockfile` OK (no fallback needed); `pnpm --no-bail -r build` finished with 0 `ERR`/`error TS` lines.
- Tovu: `npm ci` OK; `link-jini.mjs` linked 71 packages; `packages/contracts` and `packages/sdk` built.

## M0 decision (command, not judgment)
- `rg -n "export (async )?function" packages/cms/src/widgets/html` lists: scanHtmlEmbeds, substituteHtmlEmbeds, validateServerWidgetFragment, fillPluginExportTemplate, resolvePluginExportEmbeds, substitutePluginExport, resolveHtmlPageEmbeds, renderGallery, normalizeLegacyWidgetMarkers.
- Sheet exports (`K-02b.decls.tsv`): `sanitizePageHtml`, `renderMediaRawHtml`. No same-named export -> would CONTINUE (not SKIPPED).
- Blob guard: `apps/website/src/features/widgets/media-html.ts` = `7e61748431c4b53dc21ae854fd2ed3a3368d77de`, matches `K-02b.files.tsv`.
- The census, the `report` seam and M1 goldens were not reached.

## V1 baseline
Jini (green):
- `pnpm --filter @jini-ai/cms run typecheck` exit 0.
- `npm --prefix packages/cms run test`: Test Files 338 passed (338), Tests 4085 passed (4085).
- `pnpm guard`: "zero violations found in packages/".

Tovu:
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `tsc -p tsconfig.tests.json --noEmit` (6144 MB): exit 0.
- `npm run check:size`: exit 1 (RED). 17 "Worsened violation" lines vs `size-debt.json`, e.g. `apps/admin/src/App.hooks.ts` max-lines 518 (baseline 513), `apps/website/src/server/runtime/composition/deps.ts` max-lines 1952 (baseline 1926), `composeSiteRouteDeps#1` 1202 (baseline 1199), `features/theme/tool-registrations.ts` 642 (baseline 627).
- `npm run check:complexity`: exit 1 (RED). 23 New/Worsened lines, e.g. `modules/assistant-byok.ts:453 attachTurnMessagesOrRespond#1 [sonarjs/cognitive-complexity] 11` (new), `publish-content/backstop.ts:206 handleUndoRequest#1 [complexity] 13 (baseline 12)`.
- `npm run check:architecture`: exit 1 (RED): "FAILED: 4 metric(s) regressed against a hard constraint" (propagation cost 3.06 -> 3.18; back-edges into composition root 0 -> 6; module API surface 821 -> 852; module cycles/SCC largest 22 -> 60).
- `npm run check:errors | rg "^(New|Worse):"` prints 12 `New:` lines (RED), e.g. `catch-reads-error` in `apps/admin/src/lib/admin-http/request.ts`, `apps/website/.../run-daemon-http-client.ts (3)`, `failure-text-from-catalog` in `apps/website/src/features/publish-content/apply-retire.ts`.
- Full logs were kept in the run scratchpad only. None of these files is in K-02b's write set (`media-html.ts`, its importer rows, `src-complexity-debt.json` entry `resolveMediaTree#1`).

## STOP matrix / V3
Not run (no step started). No V3 RED evidence. No eslint-suppression, mock, schema or delete checks apply (no diff beyond this report).

## Deviations from the sheet
None. I did not improvise a "no worse than baseline" comparison: the sheet's rule is an exit-0 gate on the unmodified tree, and a relative gate would be a decision it did not make.

## Next step (for the dispatcher)
1. Get `integ/merge-final-2026-11-16` gate-green: refresh `size-debt.json` and `src-complexity-debt.json` and the architecture and error-gate baselines after the merge, or fix the regressions. This is outside any K sheet's write set.
2. Re-run K-02b from M0. Its first commit is M1 (characterization tests in `features/widgets/__tests__/unit/`; note the tree already holds `media-html-characterization`, `media-html-tree-characterization` and `media-html-report-drops` unit tests, so re-check what M1 still has to add against `K-02b.importers.tsv`).
3. K-02b's own estimate is ~70k tokens; this run used well under that.
