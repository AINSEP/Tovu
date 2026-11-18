# S1 — delete the `deps.ts` site-paths re-export; repoint importers by symbol

Responsibility: the import surface of `deps.ts` only. Budget ≤80k. Commits: 2. Prerequisites: S0 on `refactor/deps-split`; COMMON §1-§3 (`DS_SHEET=S1`).
```bash
set -euo pipefail
bash designs/deps-split/work/gates.sh expect-count S1-REEXPORT 1 '^export \{.*\} from "\./site-paths\.js";$' apps/website/src/server/runtime/composition/deps.ts
```

## Moves
- Delete the `export { builtInThemesDir, … } from "./site-paths.js"` line (anchor text above; comment block below it stays — it belongs to the last imports).
- Importers (`work/deps-importers.tsv` rows of kind `import` naming a site-path symbol): `apps/website/src/index.ts` (keep `createSiteRouteDeps` from `deps.js`; `defaultContentDbPath`, `siteDir` from `site-paths.js`), `development/scripts/backfill-slug-collision-defaults.ts` (`builtInThemesDir`), the 7 test rows. Split each mixed import into two statements.
- `development/scripts/__tests__/site-plugin-directories.test.mjs`: `pluginsInstallDir` from `…/composition/site-paths.ts` (it never was a `deps.ts` export; DESIGN §1.2). Red first: run it before the edit and record the failure.

## Carries
| behaviour | pin |
|---|---|
| every site-path caller resolves the same function objects | `tsc` both configs + `tests sr`; `site-plugin-directories.test.mjs` run once (`node --import tsx --test …`) green |
| `src/index.ts` boot (D0c also edits its imports — shared file) | `gates.sh freeze` (conflict check); `serve-command-wiring.unit.test.ts` in `tests sr` |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"
$G forbid S1-REEXPORT-LEFT '^export .* from ' apps/website/src/server/runtime/composition/deps.ts
$G forbid S1-SITE-PATH-FROM-DEPS "\b(builtInThemesDir|defaultContentDbPath|mediaUploadsDir|siteDir|resolveExportOutputRootDir|resolvePublishOutputRootDir|resolveSiteStoragePaths|resolveSourceControlExportRootDir|SitePathResolverOptional|pluginsInstallDir)\b[^;]*from ['\"][^'\"]*composition/deps(\.js|\.ts)?['\"]" apps development
```
(The second pattern matches single-line imports; `work/deps-importers.tsv` refreshed in commit 2 must show no site-path symbol on a `deps.ts` row — read it and say so in the report.)
Gates: COMMON §5.
