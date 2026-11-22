# wave1-merge (Tovu): integ/wave1-merge-2026-11-17

Base: `origin/refactor/terra` = `integ/merge-final-2026-11-16`, Tovu `232764af5`. Branch `integ/wave1-merge-2026-11-17` (only this branch pushed). Built against the merged Jini branch of the same name (Jini checkout named `Jini`, tip `bfb64d55`): `npm ci`; `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (71 links); `npm run build` in `packages/contracts` and `packages/sdk`.

## Merged (4 of 4, one `--no-ff` merge each; no conflicts; no skips)
| Branch | Merge SHA | Content |
|---|---|---|
| wave1/lo-SC-0 | 4b25e1d9 | tests only: source-control gate characterization (16 tests) + 3 route cases |
| wave1/lo-SC-2a | f7ed438e | tests only: commit-site characterization (13 tests) |
| wave1/lo-SI-1a | 042f9c41 | tests only: published-page guard (25 -> 47 tests) |
| wave1/lo-ML-1a | 4487b3a6 | tests only: mail-status security acceptance (2 new files, 27 tests) |
Base-ratchet commit: `9117601e` (`cloud-results/wave1-merge-base-ratchets.txt`). None of the 4 Tovu ids has a branch in Jini, and none of the 8 Jini ids has one in Tovu, so nothing else to merge. kt-K-01, kt-K-02b, kt-T-PO-01 were not merged. No production file and nothing under `apps/desktop` changed in any merge, so the desktop gates were not run (nothing to gate).

## Base ratchets (recorded first, on the unmodified base, full output in `wave1-merge-base-ratchets.txt`)
- `npm run typecheck`: exit 0
- `npm run check:size`: exit 1, 17 violation lines (e.g. `composition/deps.ts` max-lines 1952 vs baseline 1926)
- `npm run check:complexity`: exit 1, 23 violation lines (e.g. `members/list.ts` complexity 12, `assistant-byok.ts:453` cognitive 11)
- `npm run check:architecture`: exit 1, 4 metrics regressed
- `npm run check:errors`: exit 0 (WARN mode), 12 new-or-worse entries

## Gates after each merge
`npm run typecheck` (root tsconfig + e2e) exit 0 after all four. `check:size`, `check:complexity`, `check:architecture`, `check:errors`: after each merge exit code and the whole output (blank lines ignored) are **identical to the base**, so no merge made any of them worse. Changed-file tests (`node --import tsx --test ...` with the repo's `npm test` loaders): SC-0 30/30 pass (16 + 14), SC-2a 13/13, SI-1a 47/47, ML-1a 27/27. After the last merge `npm run typecheck:tests` exit 0.

## Left / next step
The four ratchets above stay red exactly as on the base (a separate run fixes them). Full Tovu test suite and e2e were not run (test-only merges; the changed files pass). Next: owner review, then merge into `refactor/terra`.
