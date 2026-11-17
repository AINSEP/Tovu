# wave1 kt-T-PO-01 (T-PO-01 three pure post leaves): SKIPPED, "baseline red" (STOP before M1)

Branch `wave1/kt-T-PO-01`, created from `origin/integ/merge-final-2026-11-16` in both repos (Tovu 232764af, Jini 65d73b0d). No source was edited; the only commit is this report.

## Steps done
- Read INDEX, COMMON-KT, T-KT-MOVE, sheet T-PO-01 and its sidecars from `origin/plan/lanes-k-t-2026-11-16`.
- V0: Node 24.11.1 in `~/.local/node24`; Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` exit 0; Tovu `npm ci` exit 0, `link-jini` (71 links), `packages/contracts` + `packages/sdk` built.
- Blob guards: all 3 files in `T-PO-01.files.tsv` match (`git hash-object`). Census: 15 hits, same as the planning-time count (importer rows not re-diffed one by one, because the run stopped).
- Pre-read: `host-ports.ts:15-16` unions are identical to `PostStatus`/`PublicPostKind`; `seo/ports.ts:49` `kind` is identical (its `status` is `string`, not a union); the Jini `html-plain-text.fixture.ts` is an OLDER implementation (tags stripped with `/<[^>]+>/g`, positional arg), so item 2 will most likely take the "different" branch. Not yet run on a table.

## V1 baseline (unmodified trees)
- Jini cms: typecheck ok; vitest 338 files / 4085 tests passed; `pnpm guard` ok (exit 0).
- Tovu: `tsc -p tsconfig.json` exit 0; `tsc -p tsconfig.tests.json` exit 0.
- Tovu gates on the UNMODIFIED tree, all RED:
  - `npm run check:size` exit 1: 17 "Worsened violation" lines (e.g. `composition/deps.ts` 1926->1952, `post/tool-registrations.ts` 796->797, `use-post-editor.hooks.ts` 636->652).
  - `npm run check:complexity` exit 1: 22 "New violation" + 1 "Worsened" lines (e.g. `parseMembersListQuery` complexity 12, `mapErrorToCliOutcome` 11).
  - `npm run check:architecture` exit 1: "TRADE DETECTED", 4 metrics regressed (back-edges into composition root 0 -> 6, bidirectional hubs 335 -> 363, module API surface 821 -> 852, runtime SCC 22 -> 60).
  - `npm run check:errors`: 12 "New:" lines (V2 pass condition is "prints nothing").
- This is not environmental: `cloud-results/merge-final-2026-11-16.md` (rows 36-37, line 42, line 74) already records Tovu `check:size` and `check:complexity` as red on merge-final and on terra ("fix or accept before Tovu CI").

## STOP hit
COMMON-KT V1: "a red baseline = STOP 'baseline red', never fix it", and V2 requires `check:size`, `check:complexity`, `check:architecture` exit 0 and `check:errors` silent after EVERY Tovu commit, which cannot hold on this base. Every cycle (M1..M4) starts with a Tovu commit, so no step is still valid. SKIPPED, nothing committed to source in either repo, nothing pushed to Jini.

## Deviations
None from the sheet. Run-level note: Tovu was left linked to the Jini clone (`link:jini`); no tree change.

## Next step
Clear the red Tovu gates on `integ/merge-final-2026-11-16` (the owner's fix-or-accept decision the merge report names: size debt growth lines, 23 complexity lines, the architecture regression, 12 `check:errors` lines), then re-dispatch kt-T-PO-01 from M0 on the green base. When re-dispatched, regenerate sidecars on the final tree first (the sheet says they are the merge-a ones; blobs and census matched anyway).
