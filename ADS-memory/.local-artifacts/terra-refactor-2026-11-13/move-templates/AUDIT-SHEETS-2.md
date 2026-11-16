# Audit sheets, round 2: C* / D* ACCEPT rows (2026-11-16, unattended planning run)

Source rows: `AUDIT-ADDITIONS.tsv` (`audit:C*`, `audit:D*`). Written from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092. Docs only; nothing executed. Status: **PARTIAL** (stopped at the context budget): 4 of 10 rows have executable sheets.

Note: `scripts/make-sheet.py` reads only `CLASSIFY.tsv`, so it cannot fill `audit:*` rows; blobs, census lists and Jini guards in these sheets were taken by hand (`git hash-object`, `rg`, census over the importers).

## Sheets
| id | row | kind (sheet) | slices | blocked? | wave-B overlap | sheet |
|---|---|---|---|---|---|---|
| D03 | coverage gates | DEDUPE x2 (label was HARDEN: Jini is a superset) + slice 3 BLOCKED | DD-coverage-1 integrity, DD-coverage-2 route/area/diff | slice 3 BLOCKED: owner question Q1 | none | `sheets/audit/dedupe-D03-coverage-gates.md` |
| D08 | published-types / registry drift | HARDEN (label was DEDUPE: Jini lacks `--pin` + keep-scratch) | HD-published-types-1 (Jini 1 commit, Tovu 1 commit) | no | none | `sheets/audit/harden-D08-published-types.md` |
| D12 | ports + env file | MOVE (`pickFreePort`/`isPortFree` -> Jini) + DEDUPE bindings | MV-local-dev-1, DD-local-dev-2 | no | none | `sheets/audit/dedupe-D12-ports-env.md` |
| C06 | admin agent inventory snapshot | MOVE (new `@jini-ai/chat/browser/agent-inventory`) | MV-agent-inventory-1 | no | none | `sheets/audit/move-C06-agent-inventory.md` |

Failing-tests-first rows: D03 DD-coverage-2 (F1 integration classifier edge, F2 brf-disagreement fails both tiers, F2b short zero SHA); D08 (Jini: pins / out-of-scope pin / keepScratch; Tovu T1: unreadable manifest -> `FAIL  operation-error` instead of a crash).

## Not written (budget) — next writer, in this order
| id | status | what the next writer needs to know (facts gathered) |
|---|---|---|
| C04 | STARTABLE, not written | `apps/admin/src/hooks/use-list-table-cell-labels.hooks.ts` (76 lines) -> HARDEN `@jini-ai/admin/react` `DataTable` cell labels + `labelTableCells`. Wave B: `wave-b/C2` edits 37 `packages/admin/src/**/react` files and `wave-b/C9a` edits `packages/admin/src/react/kit.tsx`: re-take Jini blobs AFTER the wave-B merge (mark the sheet "execute after wave B merge" if it touches `packages/admin/src/react/**`). |
| D11 | STARTABLE, not written | `development/scripts/{link-jini,unlink-jini,jini-links}.mjs` (239) -> MOVE `@jini-ai/devops/local-dev` (`inspectWorkspaceLinks`, `linkWorkspacePackages`, `restoreRegistryPackages`); share link detection with `checks/published-types` `links` mode (D08 sheet's `check({mode:'links'})`). Same test-seam caution as D12: check whether launcher/af-cli fixtures stub these `.mjs` files before deleting any. |
| C01 | partly blocked (kit-inject), not written | Opus tier. Database screen UI on existing `admin/core/ports/database.ts`; port adapter (token/confirmToken vs planId/planHash/confirmationToken) + schema-state read; `agentHandle` must be injected. Admin kit: KIT-INJECTION.md; `wave-b/C9a` changes `packages/admin/src/react/kit.tsx` + `kit-media-providers.ts` -> "execute after wave B merge". |
| C02 | partly blocked (kit-inject), not written | `MediaEditDialog` (274) -> `admin/media/react` `MediaInstanceEditDialog`; TipTap binding stays Tovu. After wave B (C9a kit). |
| C03 | partly blocked (kit-inject), not written | `AdminThemes.tsx` (144) -> `admin/react` picker + scheme control, with CLASSIFY row 36; inject `agentHandle`. After wave B (C9a kit). |
| D09 | partly blocked (packaged-desktop proof), not written | agent-plugin staging/compose/package -> `agent-plugins/lifecycle/node` + extend `folder-zip/node` `zipLocalFolder`; Sonnet+review; needs a packaged-desktop proof per batch. `desktop-portable.unit.test.ts:23` stubs `compose-bundled-agent-plugins.mjs` (test seam, keep a Tovu binding file). |

## Owner questions
- **Q1 (BLOCKS D03 slice 3):** do the changed-file / all-file coverage *reports* (`coverage-changed.ts`, `coverage-changed-model.ts`, `coverage-all-files.ts`) go to `@jini-ai/devops/checks/coverage`, or with D04 (changed-test discovery) to the AI-Dev-Shop toolkit? Recommendation: AI-Dev-Shop with D04 (same answer as AUDIT-ADDITIONS owner question 1). `coverage-changed.ts` cannot split without D04's discovery module.

## Follow-ups / cross-cutting findings
- **F-D03-1:** Jini `packages/devops/src/checks/coverage/__tests__/integrity.test.ts` still carries Tovu text (`development/scripts/check-coverage-integrity.ts` l.37, a test title at l.509, `apps/admin/...` fixture paths l.140-154). A Jini test-only neutralisation commit; not folded into D03 because COMMON rule 2's rg would then flag the fixture data in the same file.
- **Test seams decide binding vs delete:** `desktop-portable.unit.test.ts` and `unit/af-cli-characterization.unit.test.ts` copy dev launchers into temp roots and write stub `.mjs` files (`free-port`, `load-repo-root-env`, `port-listeners`, `prune-tsx-cache`, `compose-bundled-agent-plugins`, `local-dev-plugin-install`). Those Tovu files must stay as host bindings, not be deleted (D12, D09, D13). Fixtures that copy a binding WITHOUT a `node_modules` symlink (`start.test.mjs:204`) need one added (D12 sheet does this).
- **Published surface:** npm `@jini-ai/devops@0.7.0` already ships `checks/coverage`, `checks/published-types`, `checks/node`, `local-dev` with every name D03/D08/D12 use, except the new D08 `pins`/`keepScratch` options and D12 `pickFreePort`/`isPortFree` (next coordinated publish; D1 link until then).
- **Label corrections:** D03 HARDEN -> DEDUPE (+ blocked report slice); D08 DEDUPE -> HARDEN; D12 DEDUPE -> DEDUPE + one MOVE (`pickFreePort` has no Jini twin).
- `development/scripts/check-area-coverage-floor.ts` is unrunnable today: its `area-coverage-floors.json` does not exist and no npm script runs it (`apps/desktop/src/quality-gates.ts:8-22` documents this). D03 repoints it anyway (cheap, behaviour-neutral); deleting it is an owner call.
