# desktop-d0c report (wave3/desktop-d0c, 2026-11-18)

Status: **NOT DONE. D0c1 and D0c2 were not executed: STOP at the sheet's own gates.** What this run delivered: the merged base, a green baseline on it, and an unjudged D0c design draft (`desktop-extraction/designs/D0c.md`) that the sheet requires first.

## Why D0c1/D0c2 did not run
1. `D0-website-imports.md` marks D0c1 "NOT EXECUTABLE ... needs the D0c design run first" and D0c2 waits on D0c1. `desktop-extraction/designs/D0c.md` did not exist on `origin/plan/desktop-extraction-2026-11-16` (7b2bed9fb) or any other branch; the sheet also says the design is judged before D0c1/D0c2 are dispatched. A self-written, self-judged design is not that.
2. The sheet's Starting-inventory rule: "A different set (not only a different count) is a STOP: report the module names." The inventory on the merged base (`rg -n "from ['\"](\.\./)+website/src/" apps/desktop/src apps/desktop/bin apps/desktop/scripts -g '!*.test.*'`) is 9 modules, not rows 9-16:
   - `platform/secrets/startup-secrets.ts` (sheet: `server/runtime/boot/startup-secrets.ts`; moved by `747caa90a`)
   - `server/runtime/composition/jini-routes.ts` (**not in the sheet**; `desktop-agent.ts:40`, from daemon R7-G1)
   - `site-paths.ts` is 367 lines (sheet: 221), closure 12 files / 1283 lines
   - the other six rows are as listed.
3. A packaged-runtime move without the P steps (needs a published Jini snapshot, DX-OD10) is exactly the failure the staging script header describes (`ERR_MODULE_NOT_FOUND` in the packaged app).

## Done
- Tovu `wave3/desktop-d0c` = `origin/refactor/terra` + one `--no-ff` merge of `origin/wave2/desktop-d0` (merge `9a3fe3391`, clean).
- Jini `wave3/desktop-d0c` = `origin/refactor/terra` + one `--no-ff` merge of `origin/wave2/desktop-d0` (merge `ccb901145`). Jini terra does **not** contain the D0b/D0d commits (`dffd99e9`, `4fba4c1b`), and Tovu's D0b commit builds against them. One conflict: `packages/diagnostics/package.json` `jini.entries` (both sides appended after `./domain-dns`; resolved by keeping both: `./web-evidence/testing`, `./web-evidence/capture-budget`, `./domain-dns`, `./local-text`, `./console-tee`). The conflict resolution is the only hand edit in either merge.
- `desktop-extraction/designs/D0c.md`: closure table of all 9 modules (script-resolved imports), verdicts MOVES/SPLIT/STAYS, package shape, commit list, four open questions for the judge/owner. Unjudged, nothing built from it.

## Gates run (exact command and result)
Setup: Node 24.11.1 (`~/.local/node24`); Jini `pnpm install --frozen-lockfile` ok, `pnpm --no-bail -r build` exit 0; Tovu `npm ci` (root, `apps/desktop`) ok; `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (desktop already symlinked); `npm --prefix packages/contracts run build`, `npm --prefix packages/sdk run build`; `node development/scripts/prepare-desktop-hooks.mjs`.
- `cd apps/desktop && npm run gates` on the merged tree (before the docs commits): **6/6 pass** (tree-quiet, tests, typecheck, coverage, complexity, js-backslide), exit 0, 4m40s. The coverage gate failed once on the previous run's push and passed on rerun (see desktop-d0.md); it passed here the first time.
- Not run: website/admin typecheck, `check:size`, `check:complexity`, `check:boundaries` (no source was changed by this run; the merges are the previous run's already-gated commits). No BASE-RED ratchet comparison was needed or made.

## Left
- Judge `designs/D0c.md` (answer its questions 1-4), then dispatch D0c1, then D0c2, on this branch. D0c1 step 1 (scaffold `packages/host-shared`, npm, lockfiles) is safe to start once the design is accepted.
- P owed (DX-OD10) for D0a, D0b (see desktop-d0.md) and, later, D0c1/D0c2: needs the Jini `0.7.1-next.0` snapshot on `next` containing `./local-text`, `./console-tee`, `./bridge`.
- D0e remains an outline.

## Next step
Owner/judge reads `desktop-extraction/designs/D0c.md` section 5. Question 1 (should `process-error-guards` and `jini-routes`, which import only Jini packages, go to Jini instead of `@tovu/host-shared`) decides whether D0c1 needs a Jini half.

## Overlaps with other runs
None edited. Files the D0c design says D0c1/D0c2 will touch: `apps/desktop/src/main/index.ts`, `tovu-server.ts`, `desktop-agent.ts` (R7/R8 own it), `desktop-agent-service.ts`, `main/updates/product-telemetry-boot.ts`, `scripts/verify-staged-closure.ts`, `scripts/stage-website-shared.ts`, `electron-builder.yml`.

## SHAs
Filled in the final message after the push.
