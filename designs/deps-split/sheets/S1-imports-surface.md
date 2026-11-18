# S1 — delete the `deps.ts` site-paths re-export; repoint importers by symbol

Responsibility: the import surface of `deps.ts` only. Budget ≤70k. Commits: 2. Prerequisites: S0 on `refactor/deps-split`; COMMON §1-§4 (`DS_SHEET=S1`).
The re-export is `deps.ts:395` on `b5fbf2a5` (`grep -n '^export {.*} from "./site-paths.js";$' …/deps.ts` prints exactly one line; anything else = `STOP-ANCHOR`).

## Moves
- Delete the `export { builtInThemesDir, … } from "./site-paths.js"` line (anchor text above; comment block below it stays — it belongs to the last imports).
- Importers (`work/deps-importers.tsv` rows of kind `import` naming a site-path symbol): `apps/website/src/index.ts` (keep `createSiteRouteDeps` from `deps.js`; `defaultContentDbPath`, `siteDir` from `site-paths.js`), `development/scripts/backfill-slug-collision-defaults.ts` (`builtInThemesDir`), the 7 test rows. Split each mixed import into two statements.
- `development/scripts/__tests__/site-plugin-directories.test.mjs`: `pluginsInstallDir` from `…/composition/site-paths.ts` (it never was a `deps.ts` export; DESIGN §1.2). Red first: run it before the edit (`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test development/scripts/__tests__/site-plugin-directories.test.mjs`) and record the failure; it is not in `SHEET_TESTS` (it is red on the base by design) — after the edit it is green and runs through `CHANGED_TESTS`.

## Carries
| behaviour | pin |
|---|---|
| every site-path caller resolves the same function objects | `typecheck` + `typecheck:tests` + `SR_TESTS`; `site-plugin-directories.test.mjs` run once (`node --import tsx --test …`) green |
| `src/index.ts` boot (`wave3/desktop-d0c` also edits its imports — shared file, met at the integration merge) | `serve-command-wiring.unit.test.ts` (in `SR_TESTS`) |

`SHEET_TESTS=()` — the 7 repointed test importers run as `CHANGED_TESTS`.

## STOP (before the report commit)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -nE '^export .* from ' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S1-REEXPORT-LEFT"; exit 1; }
node designs/deps-split/work/deps-importers.cjs . --rows > "$W/importers.tsv"
grep -P '\timport\t.*\b(builtInThemesDir|defaultContentDbPath|mediaUploadsDir|siteDir|resolveExportOutputRootDir|resolvePublishOutputRootDir|resolveSiteStoragePaths|resolveSourceControlExportRootDir|SitePathResolverOptional|pluginsInstallDir)\b' "$W/importers.tsv" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S1-SITE-PATH-FROM-DEPS"; exit 1; }
```
The importer census parses every importer with TypeScript, so multi-line imports are covered (rev 2's single-line regex was not).
