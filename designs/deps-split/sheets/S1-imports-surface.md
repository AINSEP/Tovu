# S1 — delete the `deps.ts:398` re-export; repoint importers by symbol

Responsibility: the import surface of `deps.ts` only. Budget ≤80k. Commits: 2.
Prerequisites: S0 merged into `refactor/deps-split`; COMMON §2, §3.
```bash
grep -n '^export {.*} from "./site-paths.js"' apps/website/src/server/runtime/composition/deps.ts | grep -q '^398:' || echo "STOP: re-export not at 398 — re-run work/module-census.cjs and use its line"
```

## Files
- `apps/website/src/server/runtime/composition/deps.ts:398` (delete the line; keep the comment block 399-410 untouched — it belongs to the imports below it).
- Importers (`grep -P '\t(import|re-export)\t' designs/deps-split/work/deps-importers.tsv | grep -E 'builtInThemesDir|defaultContentDbPath|mediaUploadsDir|siteDir|resolve(Export|Publish|SourceControl)|resolveSiteStoragePaths|SitePathResolverOptional'`): `apps/website/src/index.ts` (mixed import: keep `createSiteRouteDeps` from `deps.js`, move `defaultContentDbPath`, `siteDir` to `site-paths.js`), `development/scripts/backfill-slug-collision-defaults.ts:79`, and the 7 test rows the command prints. Split each mixed import into two statements.
- `development/scripts/__tests__/site-plugin-directories.test.mjs:11`: `pluginsInstallDir` → `.../composition/site-paths.ts` (it never existed in `deps.ts`; DESIGN §1.2).

## Steps
1. Commit 1: delete 398 + repoint every importer + split mixed imports. Red-first: before the edit, `node --import tsx --test development/scripts/__tests__/site-plugin-directories.test.mjs` fails (missing export); record it.
2. Commit 2: repoint the `.mjs` test; run it green; refresh `work/deps-importers.tsv`, `work/module-census.tsv`.

## STOP
```bash
grep -rn "from ['\"].*composition/deps\(\.js\|\.ts\)\?['\"]" apps development | grep -E 'builtInThemesDir|defaultContentDbPath|mediaUploadsDir|siteDir|resolveExportOutputRootDir|resolvePublishOutputRootDir|resolveSiteStoragePaths|resolveSourceControlExportRootDir|SitePathResolverOptional|pluginsInstallDir' && echo "STOP: an importer still takes a site path from deps.ts"
grep -n 'export .* from' apps/website/src/server/runtime/composition/deps.ts && echo "STOP: re-export left"
```
Gates: COMMON §5. Done when the two STOP commands print nothing and gates show no new line.
