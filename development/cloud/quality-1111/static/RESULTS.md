# Quality audit 2026-11-11 — STATIC (structure + code quality)

Report only: no source, test or config file in either repo was changed. Tovu at `deebc92` (branch `cloud/quality-1111`), Jini at `f6fa96a` (`main`). Scope: Tovu `apps/ packages/ content/`, Jini `packages/*/src`; tests, `dist`, `node_modules`, `vendor`, fixtures, `*.d.ts` and the versioned plugin bundles are excluded (file lists: `raw/files-tovu.txt`, `raw/files-jini.txt`, built by `scripts/filelist.sh`). Every number below is reproducible from `scripts/` + `raw/`.

## Totals

| check | metric | Tovu | Jini |
|---|---|---|---|
| 1 Complexity | functions with cyclomatic > 10 (uniform eslint config, all prod files) | 45 | 37 |
| 1 Complexity | … > 15 | 4 | 3 |
| 1 Complexity | … > 25 | 1 | 0 |
| 1 Complexity | max cyclomatic | 29 | 22 |
| 1 Complexity | Tovu `npm run complexity:strict` (repo config): >10 / >15 / >25 / max | 40 / 2 / 0 / 17 | — |
| 1 Complexity | sonarjs cognitive complexity > 10 (bonus) | 18 | 15 |
| 2 Duplication | prod lines scanned | 509383 | 439537 |
| 2 Duplication | duplicated lines (union per file) / % | 13749 / 2.7% | 8006 / 1.82% |
| 2 Duplication | clone pairs within repo | 526 | 324 |
| 2 Duplication | Tovu↔Jini clone pairs / lines | 75 / 1088 | (same) |
| 2 Duplication | jscpd combined total (both repos) | 925 clones, 11505 lines, 1.37% | (same) |
| 3 Dead code | unused files (in scope / all knip) | 7 / 83 | 11 / 43 |
| 3 Dead code | unused exports (in scope / all) | 935 / 1047 | 124 / 173 |
| 3 Dead code | unused exported types (in scope / all) | 2611 / 2714 | 266 / 361 |
| 3 Dead code | unused dependencies (excl. link artifacts / all) | 41 / 107 | 9 / 9 |
| 3 Dead code | unused devDependencies (excl. link artifacts / all) | 12 / 16 | 17 / 17 |
| 3 Dead code | unused optionalPeerDependencies | 0 | 101 |
| 3 Dead code | unlisted deps (prod files / all) · unresolved imports · unused binaries · duplicate exports | 8 / 53 · 0 · 1 · 2 | 6 / 19 · 15 · 1 · 26 |
| 4 Cycles | dependency-cruiser no-circular cycle paths (runtime-only edges) | 20 (0) | 77 (2) |
| 4 Cycles | module SCCs / modules in SCCs (incl. `import type`) | 9 / 35 | 45 / 113 |
| 4 Cycles | module SCCs using runtime imports only | 0 / 0 | 2 / 4 |
| 4 Cycles | Jini cross-package SCCs (`@jini-ai/*` imports; all / runtime-only) | — | 0 / 0 (38 packages, 104 package edges) |
| 4 Cycles | Tovu feature↔feature SCCs (sizes; all / runtime-only) · mutual feature pairs | [32,3,2,2] / [24,3,2] · 21 | — |
| 5 Args rule | functions audited / ok / unsure / VIOLATION (%) | 21124 / 12113 / 2293 / 6718 (31.8%) | 24011 / 14372 / 2348 / 7291 (30.4%) |
| 5 Args rule | exported functions: violations (%) | 1383 (22.8%) | 1042 (16.0%) |
| 5 Args rule | functions with > 2 params | 968 | 1276 |
| 6 Type safety | `as any` (AST count) | 2 | 0 |
| 6 Type safety | `: any` annotations (AST count) | 19 | 9 |
| 6 Type safety | other `any` (generics, unions, `any[]`) (AST count) | 10 | 19 |
| 6 Type safety | non-null `!` (AST count) | 801 | 1212 |
| 6 Type safety | `@ts-ignore` (AST count) | 8 | 0 |
| 6 Type safety | `@ts-expect-error` (AST count) | 0 | 3 |
| 6 Type safety | `@ts-nocheck` (AST count) | 0 | 0 |
| 6 Type safety | `eslint-disable*` comments (AST count) | 26 | 73 |
| 6 Type safety | type-coverage@2 (weighted over targets) | 99.77% (1628 of 699225 identifiers untyped/any, 5 targets) | 99.86% (999 of 732296 identifiers untyped/any, 38 targets) |
| 7 Other | semgrep (`quality:semgrep:test`) | SKIPPED — semgrep binary not installed (ENV) | no semgrep script |
| 7 Other | `await import(` in prod code | 20 | 15 |
| 7 Other | other dynamic `import()` (not awaited directly) | 54 | 42 |
| 7 Other | files > 500 lines | 163 | 113 |
| 7 Other | functions > 80 lines (nested functions counted separately) | 327 | 325 |
| — | prod files in scope | 3371 | 3479 |

## How each number was produced (and what to distrust)

| check | tool / command | caveats |
|---|---|---|
| Setup | Node 24.22.3 in `~/.local/node24`; Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` (exit 0, `raw/jini-build.txt`); Tovu `npm ci` ×4 (all exit 0), `@tovu/sdk` build, `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` (79 links), desktop `build:preload` | `link:jini` defaults to `~/Programming/Jini/packages`; the env var was needed in the container. |
| 1 Complexity | **Uniform:** ESLint 10.8 with `scripts/complexity.eslint.config.mjs` (`complexity` max 10 + `sonarjs/cognitive-complexity` max 10, typescript-eslint parser, inline config off) over each repo's prod file list. **Tovu repo config:** `npm run complexity:strict -- -f json` (`raw/complexity-tovu.json`). | `complexity.tsv` uses the uniform run for both repos; column `in_tovu_complexity_strict` marks the 5 Tovu hits the repo script does not see (it skips the `0002/0006/0011/0012/0013/0020` migrations and `apps/*/scripts`, `content/` outside `agent-plugins`). The Tovu repo-config run also reported 147 other sonarjs findings (rule counts in `raw/complexity-tovu-summary.txt`). Numbers are low because both repos already gate complexity; the worst offenders are long functions (check 7), not branchy ones. |
| 2 Duplication | `npx --yes jscpd@4 --min-tokens 50` over one staging dir holding both prod file lists (`Tovu/…`, `Jini/…`) so cross-repo copies show (`scripts/run-jscpd.sh`; default 2 GB heap OOMed, rerun at 5 GB). | jscpd's own "lines" ignores blank lines, so its 1.37% combined figure uses a smaller denominator than the per-repo % (duplicated lines unioned per file ÷ raw prod lines). |
| 3 Dead code | Tovu `npm run quality:knip -- --reporter json`; Jini `knip --config knip.json --no-exit-code --reporter json` (Jini's own config). Both OOMed at the 2 GB default heap; rerun at 5 GB. `in_scope` = prod path per this brief. | **Tovu `@jini-ai/*` "unused dependencies" (70 rows) are link artifacts**: with `link:jini` active the packages resolve outside `node_modules`, so knip stops attributing imports; `scripts/annotate-knip.py` confirmed every one is imported (rg counts in the `note` column). The remaining app-level deps (Radix, clsx, shiki…) are marked *unverified*: they may be peer deps of the linked `@jini-ai/ui`/`chat` packages. Re-run knip un-linked before deleting any dependency. |
| 4 Cycles | dependency-cruiser 18.1.0 (installed in both repos; no npx install needed) with the cycle-only `scripts/cycles.depcruise.cjs`, per Tovu app (own tsconfig; desktop via `tsconfig.renderer.json`; cycle paths deduplicated per repo by member set, because the desktop run follows imports into website code) and once over Jini `packages` (`tsconfig.base.json`). `scripts/analyze-cycles.mjs` adds Tarjan SCCs (with and without `import type` edges), Tovu feature-level graphs, and a Jini package graph from `@jini-ai/<pkg>` specifiers. | Jini cross-package edges resolve into `dist/` (excluded), so dependency-cruiser only sees intra-package cycles; the package graph is regex-built from source specifiers (104 edges, 38 packages, **no package cycle**). Every Tovu module cycle closes through at least one `import type` edge (0 runtime-only module SCCs), but at feature level 24 website features still form one runtime SCC (different files import each other's features). |
| 5 Args rule | `node development/scripts/args-object-audit.mjs <repo> --label … --json raw/args-<repo>.json` (as specified). | The script walks `apps packages content scripts` (Jini: all of `packages/`, not only `src/`), so its totals cover slightly more than the other checks. `args.tsv` = every violation + unsure row. |
| 6 Type safety | `scripts/ast-metrics.mjs`: TypeScript AST over the prod lists (`any` keyword by parent kind, `NonNullExpression`, comment-only directive scan). The literal rg version is kept in `raw/rg-typesafety.tsv` for comparison (it overcounts: `as any`/`: any` in prose and comments, `!` in strings). type-coverage@2 per Tovu app / Jini package (`scripts/run-type-coverage.sh`). | Jini uses TypeScript 7.0.2, which type-coverage@2 cannot drive (no `ts.createProgram`), so TS 5.9.3 was supplied alongside via `npx -p` (no repo change). At the Tovu npm-workspace root `npx -p` fails (`EUNSUPPORTEDPROTOCOL workspace:`), so `tovu-website` ran the same cached npx install's binary directly. Lowest: `jini-server` 98.76%, `tovu-desktop-renderer` 99.49%. |
| 7 Other | semgrep: `npm run quality:semgrep:test` → `Semgrep is not installed` (exit 127, `raw/semgrep-tovu-test.txt`) — **SKIPPED (ENV)**, installing it would need pip/brew, not npx; Jini has no semgrep script. `await import(` / files > 500 / functions > 80 from the same AST pass. | Functions > 80 lines counts nested functions separately (a 1,980-line factory and a long inner closure are two rows). |

Raw files over 1 MB are stored gzipped (`*.json.gz`); `gunzip -k` them before re-running `scripts/analyze-cycles.mjs`, `parse-jscpd.mjs`, `parse-complexity.mjs` or `breakdown.mjs`. Setup commands: `scripts/setup-jini.sh`, `scripts/setup-tovu.sh` (then `link:jini` and `build:preload` as above).


## Per app / package

From `breakdown.tsv` (cc = cyclomatic, cog = cognitive, any = all `any` keywords, tsDirective = ts-ignore/expect-error/nocheck, knip* = in-scope unused files/exports/types, argViol = argument-rule violations).

| repo | unit | files | lines | cc>10 | cc>15 | cc>25 | cog>10 | fn>80 | file>500 | any | nonNull | tsDirective | eslintDisable | awaitImport | dupLines | knipFiles | knipExports | knipTypes | argViol |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| jini | packages/admin | 378 | 26965 | 0 | 0 | 0 | 0 | 27 | 3 | 0 | 65 | 0 | 2 | 7 | 253 | 0 | 23 | 49 | 342 |
| jini | packages/agent-plugins | 119 | 18716 | 4 | 1 | 0 | 0 | 26 | 7 | 0 | 52 | 0 | 0 | 1 | 153 | 0 | 3 | 3 | 955 |
| jini | packages/agent-runtime | 170 | 30261 | 0 | 0 | 0 | 0 | 19 | 11 | 0 | 42 | 0 | 0 | 3 | 1073 | 6 | 26 | 21 | 798 |
| jini | packages/agentic | 53 | 7336 | 0 | 0 | 0 | 0 | 5 | 2 | 0 | 27 | 0 | 1 | 0 | 165 | 0 | 0 | 1 | 93 |
| jini | packages/analytics | 12 | 1814 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 13 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 27 |
| jini | packages/artifacts | 10 | 1273 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2 | 0 | 0 | 0 | 98 | 0 | 0 | 0 | 17 |
| jini | packages/capability-providers | 28 | 2266 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 61 | 0 | 0 | 0 | 36 |
| jini | packages/chat | 219 | 37164 | 11 | 0 | 0 | 2 | 35 | 17 | 2 | 130 | 0 | 7 | 0 | 723 | 0 | 9 | 29 | 423 |
| jini | packages/cli | 16 | 2337 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 5 | 0 | 0 | 1 | 173 | 0 | 0 | 0 | 25 |
| jini | packages/cms | 286 | 42175 | 3 | 0 | 0 | 4 | 11 | 11 | 0 | 99 | 2 | 1 | 0 | 1903 | 0 | 2 | 14 | 450 |
| jini | packages/commerce | 88 | 10242 | 1 | 0 | 0 | 0 | 3 | 1 | 0 | 19 | 0 | 0 | 0 | 81 | 0 | 1 | 20 | 125 |
| jini | packages/cookie-consent | 26 | 2004 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 45 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 72 |
| jini | packages/core | 132 | 15616 | 1 | 0 | 0 | 1 | 8 | 3 | 7 | 32 | 0 | 0 | 0 | 142 | 0 | 0 | 2 | 155 |
| jini | packages/daemon | 140 | 29443 | 7 | 1 | 0 | 3 | 18 | 12 | 0 | 61 | 0 | 13 | 0 | 641 | 0 | 2 | 11 | 397 |
| jini | packages/db | 112 | 10811 | 1 | 1 | 0 | 1 | 4 | 2 | 3 | 24 | 0 | 1 | 1 | 51 | 0 | 1 | 7 | 221 |
| jini | packages/desktop-host | 67 | 4684 | 0 | 0 | 0 | 1 | 2 | 0 | 0 | 7 | 0 | 0 | 0 | 21 | 0 | 0 | 0 | 55 |
| jini | packages/devops | 84 | 8250 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 62 | 0 | 0 | 0 | 21 | 0 | 0 | 3 | 193 |
| jini | packages/diagnostics | 45 | 5767 | 0 | 0 | 0 | 0 | 2 | 0 | 5 | 21 | 0 | 4 | 1 | 28 | 0 | 0 | 2 | 86 |
| jini | packages/http-kit | 26 | 2644 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 1 | 25 |
| jini | packages/infra | 13 | 1153 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 21 |
| jini | packages/integrations | 116 | 17313 | 2 | 0 | 0 | 0 | 9 | 5 | 1 | 53 | 0 | 1 | 0 | 412 | 0 | 1 | 5 | 281 |
| jini | packages/mcp | 83 | 13972 | 2 | 0 | 0 | 0 | 5 | 6 | 3 | 20 | 0 | 0 | 0 | 145 | 0 | 1 | 3 | 190 |
| jini | packages/memory | 9 | 2290 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 47 |
| jini | packages/oauth | 35 | 2755 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 6 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 52 |
| jini | packages/platform | 114 | 14834 | 0 | 0 | 0 | 1 | 6 | 4 | 0 | 98 | 0 | 0 | 0 | 146 | 0 | 0 | 1 | 391 |
| jini | packages/plugins | 65 | 10476 | 0 | 0 | 0 | 0 | 7 | 4 | 0 | 27 | 0 | 2 | 0 | 104 | 0 | 0 | 1 | 201 |
| jini | packages/protocol | 12 | 1117 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 5 |
| jini | packages/provider-plugins | 42 | 2786 | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 29 | 0 | 0 | 0 | 14 | 4 | 6 | 14 | 47 |
| jini | packages/registry | 17 | 2310 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 62 |
| jini | packages/sandbox | 12 | 1491 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 |
| jini | packages/search | 16 | 2571 | 0 | 0 | 0 | 0 | 3 | 1 | 0 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 83 |
| jini | packages/server | 15 | 3527 | 0 | 0 | 0 | 0 | 4 | 2 | 2 | 3 | 0 | 1 | 0 | 0 | 0 | 1 | 2 | 46 |
| jini | packages/sidecar | 13 | 2311 | 1 | 0 | 0 | 0 | 6 | 1 | 3 | 3 | 0 | 0 | 0 | 60 | 0 | 0 | 1 | 28 |
| jini | packages/sqlite | 1 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| jini | packages/ui | 737 | 83595 | 0 | 0 | 0 | 0 | 95 | 13 | 0 | 157 | 0 | 33 | 0 | 887 | 0 | 45 | 62 | 947 |
| jini | packages/ui-kit | 29 | 1382 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 6 |
| jini | packages/user-management | 112 | 12303 | 0 | 0 | 0 | 0 | 13 | 6 | 0 | 40 | 0 | 2 | 1 | 611 | 0 | 0 | 9 | 192 |
| jini | packages/vibecoding | 27 | 3563 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 3 | 0 | 0 | 0 | 18 | 0 | 2 | 2 | 42 |
| tovu | apps/admin | 893 | 184326 | 2 | 0 | 0 | 2 | 129 | 78 | 0 | 212 | 0 | 11 | 1 | 1886 | 0 | 79 | 509 | 1861 |
| tovu | apps/desktop | 261 | 39497 | 0 | 0 | 0 | 0 | 25 | 9 | 16 | 87 | 0 | 0 | 7 | 271 | 2 | 31 | 175 | 713 |
| tovu | apps/site-chat | 26 | 2018 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 33 |
| tovu | apps/website | 2166 | 280731 | 43 | 4 | 1 | 16 | 157 | 76 | 15 | 497 | 8 | 15 | 12 | 9397 | 5 | 825 | 1923 | 4063 |
| tovu | content | 16 | 2255 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 2195 | 0 | 0 | 0 | 48 |
| tovu | packages/contracts | 6 | 245 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| tovu | packages/sdk | 3 | 311 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Argument rule per app / package (from the audit script)

| repo | unit | violations | functions | % | exported violations |
|---|---|---|---|---|---|
| Tovu | apps/website | 4063 | 13276 | 30.6% | 725 |
| Tovu | apps/admin | 1861 | 5434 | 34.2% | 549 |
| Tovu | apps/desktop | 713 | 2202 | 32.4% | 105 |
| Tovu | content | 48 | 68 | 70.6% | 0 |
| Tovu | apps/site-chat | 33 | 138 | 23.9% | 4 |
| Tovu | packages/contracts | 0 | 2 | 0.0% | 0 |
| Tovu | packages/sdk | 0 | 1 | 0.0% | 0 |
| Tovu | scripts | 0 | 3 | 0.0% | 0 |
| Jini | packages/agent-plugins | 955 | 2120 | 45.0% | 116 |
| Jini | packages/ui | 947 | 2803 | 33.8% | 479 |
| Jini | packages/agent-runtime | 798 | 1730 | 46.1% | 210 |
| Jini | packages/cms | 450 | 1783 | 25.2% | 1 |
| Jini | packages/chat | 423 | 1678 | 25.2% | 8 |
| Jini | packages/daemon | 397 | 1510 | 26.3% | 21 |
| Jini | packages/platform | 391 | 1176 | 33.2% | 39 |
| Jini | packages/admin | 342 | 1980 | 17.3% | 9 |
| Jini | packages/integrations | 281 | 890 | 31.6% | 36 |
| Jini | packages/db | 221 | 548 | 40.3% | 34 |
| Jini | packages/plugins | 201 | 566 | 35.5% | 1 |
| Jini | packages/devops | 193 | 666 | 29.0% | 1 |
| Jini | packages/user-management | 192 | 770 | 24.9% | 0 |
| Jini | packages/mcp | 190 | 657 | 28.9% | 13 |
| Jini | packages/core | 155 | 627 | 24.7% | 6 |

### type-coverage per target

| target | percent | typed | total | note |
|---|---|---|---|---|
| jini-admin | 99.97 | 59298 | 59313 |  |
| jini-agent-plugins | 99.79 | 36568 | 36644 |  |
| jini-agent-runtime | 99.77 | 40002 | 40091 |  |
| jini-agentic | 99.89 | 9447 | 9457 |  |
| jini-analytics | 100 | 2491 | 2491 |  |
| jini-artifacts | 99.57 | 1888 | 1896 |  |
| jini-capability-providers | 100 | 3430 | 3430 |  |
| jini-chat | 99.74 | 59586 | 59737 |  |
| jini-cli | 99.88 | 3519 | 3523 |  |
| jini-cms | 99.9 | 63129 | 63187 |  |
| jini-commerce | 99.95 | 23269 | 23279 |  |
| jini-cookie-consent | 99.73 | 5742 | 5757 |  |
| jini-core | 99.87 | 23612 | 23642 |  |
| jini-daemon | 99.85 | 46193 | 46258 |  |
| jini-db | 99.96 | 17731 | 17737 |  |
| jini-desktop-host | 99.75 | 8431 | 8452 |  |
| jini-devops | 99.9 | 24074 | 24098 |  |
| jini-diagnostics | 99.75 | 10934 | 10961 |  |
| jini-http-kit | 99.78 | 3221 | 3228 |  |
| jini-infra | 99.88 | 2624 | 2627 |  |
| jini-integrations | 99.95 | 32459 | 32475 |  |
| jini-mcp | 99.82 | 20835 | 20871 |  |
| jini-memory | 99.82 | 3514 | 3520 |  |
| jini-oauth | 99.72 | 5779 | 5795 |  |
| jini-platform | 99.8 | 32891 | 32956 |  |
| jini-plugins | 99.77 | 19885 | 19929 |  |
| jini-protocol | 99.92 | 1317 | 1318 |  |
| jini-provider-plugins | 99.84 | 5317 | 5325 |  |
| jini-registry | 99.92 | 3766 | 3769 |  |
| jini-sandbox | 99.62 | 1603 | 1609 |  |
| jini-search | 99.92 | 6423 | 6428 |  |
| jini-server | 98.76 | 4801 | 4861 |  |
| jini-sidecar | 99.77 | 3593 | 3601 |  |
| jini-sqlite | 100 | 47 | 47 |  |
| jini-ui-kit | 100 | 5602 | 5602 |  |
| jini-ui | 99.93 | 107499 | 107564 |  |
| jini-user-management | 99.91 | 24675 | 24697 |  |
| jini-vibecoding | 99.68 | 6102 | 6121 |  |
| tovu-admin | 99.95 | 181013 | 181086 |  |
| tovu-desktop-main | 99.62 | 40997 | 41150 |  |
| tovu-desktop-renderer | 99.49 | 20719 | 20825 |  |
| tovu-site-chat | 99.86 | 2895 | 2899 |  |
| tovu-website | 99.71 | 451973 | 453265 |  |

## 1. Cyclomatic complexity > 10 — all 82 functions (`complexity.tsv`)

| repo | file | function | line | cc | in Tovu complexity:strict |
|---|---|---|---|---|---|
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | Async function 'up' | 260 | 29 | no |
| jini | packages/db/src/data-modules/data-module.ts | Async function 'declareDataModule' | 917 | 22 | n/a |
| jini | packages/daemon/src/agent-executor/launch.ts | Async function 'run' | 1391 | 20 | n/a |
| jini | packages/agent-plugins/src/lifecycle/automatic-use.ts | Async function 'prepare' | 192 | 19 | n/a |
| tovu | apps/website/src/platform/site-dir/local-site-supervisor.ts | Function 'createLocalSiteSupervisor' | 61 | 17 | yes |
| tovu | apps/website/src/features/site-backup/import-keep-off.ts | Async function 'keepImportedCodeOff' | 127 | 16 | yes |
| tovu | apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts | Async function 'up' | 180 | 16 | no |
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | Async function 'insertMapped' | 149 | 15 | no |
| jini | packages/chat/src/react/components/McpUiSurfaceCard.tsx | Function 'McpUiSurfaceCard' | 215 | 15 | n/a |
| jini | packages/cookie-consent/src/contracts/policy.ts | Function 'effective' | 42 | 14 | n/a |
| tovu | apps/website/src/features/agent-plugins/exports/runtime.ts | Async function 'resolveExport' | 92 | 13 | yes |
| tovu | apps/website/src/features/site-backup/static-download-layout.ts | Function 'staticDownloadLayout' | 242 | 13 | yes |
| tovu | apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts | Async function 'up' | 41 | 13 | no |
| tovu | apps/website/src/platform/site-dir/local-site-intent.ts | Function 'validIntent' | 28 | 13 | yes |
| tovu | apps/website/src/server/inbound/assistant/agent-daemon-server.ts | Async function 'start' | 203 | 13 | yes |
| jini | packages/chat/src/react/features/chat-pane/components/ChatPane.tsx | Function 'ChatPaneComposerArea' | 504 | 13 | n/a |
| jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | Async arrow function | 751 | 13 | n/a |
| tovu | apps/website/src/assistant/ask-choice-custom-answer.ts | Function 'splitCustomAnswer' | 86 | 12 | yes |
| tovu | apps/website/src/assistant/byok-tool-surface.ts | Function 'createByokToolSurface' | 621 | 12 | yes |
| tovu | apps/website/src/cli/commands/import-local.ts | Function 'parseRequest' | 128 | 12 | yes |
| tovu | apps/website/src/features/deployments/static-publish/adapter.ts | Async function 'publishStaticSiteSteps' | 519 | 12 | yes |
| tovu | apps/website/src/features/site-backup/import-database.ts | Async function 'tidyImportDatabases' | 116 | 12 | yes |
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | Function 'metadata' | 121 | 12 | no |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/sites.ts | Function 'listingManagement' | 263 | 12 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/sites.ts | Function 'registerAdminSitesRoutes' | 305 | 12 | yes |
| tovu | apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts | Async function 'start' | 82 | 12 | yes |
| tovu | apps/website/src/server/runtime/composition/agent-daemon-core-deps.ts | Async function 'createAgentDaemonCoreDeps' | 65 | 12 | yes |
| tovu | apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts | Function 'startAssistantDaemon' | 617 | 12 | yes |
| tovu | apps/website/src/server/runtime/lifecycle/local-site-process.ts | Async function 'discoverDaemon' | 200 | 12 | yes |
| jini | packages/cms/src/core/commands/revert.ts | Async function 'revertChangeSet' | 105 | 12 | n/a |
| jini | packages/cms/src/widgets/html/plugin-export.ts | Function 'fillSlotText' | 83 | 12 | n/a |
| jini | packages/daemon/src/agent-executor/events.ts | Function 'wireChildLifecycle' | 467 | 12 | n/a |
| jini | packages/daemon/src/agent-executor/launch.ts | Async function 'buildRunArgs' | 732 | 12 | n/a |
| jini | packages/daemon/src/surface-exchanges.ts | Method 'open' | 137 | 12 | n/a |
| jini | packages/daemon/src/surface-restoration.ts | Async arrow function | 149 | 12 | n/a |
| jini | packages/sidecar/src/supervision/supervisor.ts | Function 'ensureReady' | 162 | 12 | n/a |
| tovu | apps/admin/src/features/sites/hooks/use-live-import-site.hooks.ts | Async function 'startAndWait' | 55 | 11 | yes |
| tovu | apps/admin/src/lib/admin-failure-channel.ts | Function 'publishAdminFailure' | 52 | 11 | yes |
| tovu | apps/website/src/assistant/ask-choice-tool.ts | Function 'buildAskChoiceFormSurface' | 199 | 11 | yes |
| tovu | apps/website/src/assistant/mcp-ui-tool-calls-route.ts | Function 'parseMcpUiToolCallRequest' | 184 | 11 | yes |
| tovu | apps/website/src/cli/commands/export.ts | Async function 'runExportCommand' | 117 | 11 | yes |
| tovu | apps/website/src/contracts/core/human-confirm.ts | Function 'renderHumanConfirmation' | 270 | 11 | yes |
| tovu | apps/website/src/features/pages/tool-registrations.ts | Async function 'readDocPageFallback' | 443 | 11 | yes |
| tovu | apps/website/src/features/site-backup/credential-warnings.ts | Function 'warnCredentialContent' | 16 | 11 | yes |
| tovu | apps/website/src/features/site-backup/share-registry.ts | Async method 'findToken' | 102 | 11 | yes |
| tovu | apps/website/src/features/site-backup/share-service.ts | Async function 'acknowledgeSiteShare' | 132 | 11 | yes |
| tovu | apps/website/src/features/site-export/site-exporter.ts | Async function 'exportSite' | 560 | 11 | yes |
| tovu | apps/website/src/features/sites/warm-switch.ts | Async function 'activateSiteWithWarmServer' | 14 | 11 | yes |
| tovu | apps/website/src/features/theme/theme.ts | Function 'readBundledTemplateFallback' | 501 | 11 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | Async arrow function | 131 | 11 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | Async arrow function | 250 | 11 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts | Async arrow function | 27 | 11 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/plugins/provider-settings.ts | Async arrow function | 124 | 11 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/sites/warm-site-control.ts | Async arrow function | 28 | 11 | yes |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts | Async arrow function | 201 | 11 | yes |
| tovu | apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts | Async function 'resolveFile' | 25 | 11 | yes |
| tovu | apps/website/src/server/inbound/public-http/routes/site/pages.ts | Async function 'finalizePublicPageHtml' | 2642 | 11 | yes |
| tovu | apps/website/src/server/runtime/lifecycle/daemon-demand-fetch.ts | Async function 'fetchWithDaemonParkRecovery' | 9 | 11 | yes |
| tovu | apps/website/src/server/runtime/lifecycle/local-site-host.ts | Function 'localSiteSupervisorForHost' | 42 | 11 | yes |
| jini | packages/agent-plugins/src/core/identity-namespace.ts | Function 'resolveAgentPluginIdentityNamespace' | 14 | 11 | n/a |
| jini | packages/agent-plugins/src/lifecycle/automatic-use.ts | Function 'readChatAgentPluginState' | 80 | 11 | n/a |
| jini | packages/agent-plugins/src/lifecycle/exports.ts | Function 'checkExternal' | 107 | 11 | n/a |
| jini | packages/chat/src/core/user-text-redaction.ts | Arrow function | 93 | 11 | n/a |
| jini | packages/chat/src/embed-widget/browser/frontend-session-bridge.ts | Arrow function | 373 | 11 | n/a |
| jini | packages/chat/src/react/components/Composer.tsx | Function 'Composer' | 166 | 11 | n/a |
| jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | Function 'useChatPane' | 403 | 11 | n/a |
| jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | Arrow function | 813 | 11 | n/a |
| jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | Async arrow function | 932 | 11 | n/a |
| jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | Async arrow function | 973 | 11 | n/a |
| jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | Arrow function | 1055 | 11 | n/a |
| jini | packages/cms/src/media/document-read.ts | Async function 'readDocumentTextPage' | 175 | 11 | n/a |
| jini | packages/commerce/src/catalog/settle-order-payment.ts | Async function 'settleOrderPayment' | 55 | 11 | n/a |
| jini | packages/core/src/tool-input-envelope.ts | Function 'unwrapToolInputEnvelope' | 26 | 11 | n/a |
| jini | packages/daemon/src/agent-executor/claude/subagent-start.ts | Async function 'prepareClaudeSubagentStartSettings' | 5 | 11 | n/a |
| jini | packages/daemon/src/tool-executor.ts | Async arrow function | 558 | 11 | n/a |
| jini | packages/integrations/src/credentialed-http/sets/vault-repo.ts | Function 'compatibilityVaultRow' | 120 | 11 | n/a |
| jini | packages/integrations/src/credentialed-http/tools/credential-copy-tool.ts | Async method | 93 | 11 | n/a |
| jini | packages/mcp/src/agent-install/install.ts | Function 'installedLaunchMatches' | 460 | 11 | n/a |
| jini | packages/mcp/src/server/tool-protocol.ts | Function 'okResult' | 169 | 11 | n/a |
| jini | packages/provider-plugins/src/charts-recharts/descriptor.ts | Function 'supportsRechartsSpec' | 9 | 11 | n/a |
| jini | packages/provider-plugins/src/payments-stripe/checkout-session.ts | Async function 'createCheckoutSession' | 32 | 11 | n/a |
| jini | packages/provider-plugins/src/payments-stripe/session-reading.ts | Function 'sessionStatus' | 19 | 11 | n/a |

### Cognitive complexity > 10 — all 33 (`cognitive.tsv`)

| repo | file | line | cognitive |
|---|---|---|---|
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 260 | 21 |
| tovu | apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts | 41 | 20 |
| tovu | apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts | 13 | 19 |
| jini | packages/platform/src/secrets/credential-sets/vault-archive.ts | 28 | 16 |
| tovu | apps/website/src/features/site-backup/import-keep-off.ts | 57 | 16 |
| tovu | apps/website/src/server/runtime/composition/modules/assistant-daemon-client.ts | 218 | 15 |
| tovu | apps/website/src/server/runtime/composition/modules/assistant-daemon-client.ts | 350 | 14 |
| jini | packages/chat/src/core/question-form/scan.ts | 339 | 13 |
| jini | packages/cms/src/widgets/resolver-service.ts | 107 | 13 |
| jini | packages/daemon/src/agent-executor/launch.ts | 1391 | 13 |
| tovu | apps/website/src/features/site-backup/import-database.ts | 116 | 13 |
| tovu | apps/website/src/features/site-backup/import-keep-off.ts | 127 | 13 |
| tovu | apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts | 180 | 13 |
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 149 | 13 |
| jini | packages/cms/src/widgets/resolvers/menu.ts | 69 | 12 |
| jini | packages/db/src/data-modules/data-module.ts | 917 | 12 |
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 220 | 12 |
| jini | packages/chat/src/embed-widget/browser/frontend-session-bridge.ts | 477 | 11 |
| jini | packages/cli/src/flags.ts | 100 | 11 |
| jini | packages/cms/src/navigation/repo.memory.ts | 131 | 11 |
| jini | packages/cms/src/widgets/resolvers/taxonomy.ts | 6 | 11 |
| jini | packages/core/src/tool-input-normalization.ts | 162 | 11 |
| jini | packages/daemon/src/frontend-session-registry.ts | 217 | 11 |
| jini | packages/daemon/src/surface-restoration.ts | 149 | 11 |
| jini | packages/desktop-host/src/electron/updates/instance-presence.ts | 69 | 11 |
| jini | packages/ui-kit/src/react/testing/driver.ts | 87 | 11 |
| tovu | apps/admin/src/features/plugins/AgentPluginRow.tsx | 95 | 11 |
| tovu | apps/admin/src/features/sites/hooks/use-live-import-site.hooks.ts | 82 | 11 |
| tovu | apps/website/src/features/pages/authoring-html.ts | 5 | 11 |
| tovu | apps/website/src/platform/site-dir/local-site-supervisor.ts | 167 | 11 |
| tovu | apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | 61 | 11 |
| tovu | apps/website/src/server/inbound/admin-http/routes/plugins/provider-settings.ts | 124 | 11 |
| tovu | apps/website/src/server/runtime/boot/bootstrap.ts | 117 | 11 |

## 2. Duplication — top 50 of 925 clone pairs by lines (`duplication.tsv`)

| kind | lines | tokens | A | B |
|---|---|---|---|---|
| tovu-tovu | 242 | 2616 | tovu:content/themes/__original-themes__/static/tovu-starter/scripts/main.js:1-242 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/main.js:1-242 |
| tovu-tovu | 242 | 2616 | tovu:content/themes/static/tovu-theme/scripts/main.js:1-242 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/main.js:1-242 |
| tovu-tovu | 242 | 2616 | tovu:content/themes/static/tovu-starter/scripts/main.js:1-242 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/main.js:1-242 |
| tovu-tovu | 179 | 1498 | tovu:content/themes/__original-themes__/static/tovu-starter/scripts/docs-toc.js:1-179 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/docs-toc.js:1-179 |
| tovu-tovu | 179 | 1498 | tovu:content/themes/static/tovu-theme/scripts/docs-toc.js:1-179 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/docs-toc.js:1-179 |
| tovu-tovu | 179 | 1498 | tovu:content/themes/static/tovu-starter/scripts/docs-toc.js:1-179 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/docs-toc.js:1-179 |
| tovu-jini | 154 | 145 | tovu:apps/website/src/features/webmcp/generated/annotated-actions-script.ts:2-155 | jini:packages/agentic/src/core/annotated-actions-script.ts:1-154 |
| tovu-tovu | 104 | 811 | tovu:content/themes/__original-themes__/static/tovu-starter/scripts/docs-sidebar.js:1-104 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/docs-sidebar.js:1-104 |
| tovu-tovu | 104 | 811 | tovu:content/themes/static/tovu-theme/scripts/docs-sidebar.js:1-104 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/docs-sidebar.js:1-104 |
| tovu-tovu | 104 | 811 | tovu:content/themes/static/tovu-starter/scripts/docs-sidebar.js:1-104 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/docs-sidebar.js:1-104 |
| jini-jini | 85 | 1176 | jini:packages/chat/src/react/components/ToolCard.tsx:325-409 | jini:packages/chat/src/react/components/ToolCard.tsx:284-319 |
| jini-jini | 81 | 770 | jini:packages/chat/src/react/components/A2uiSurfaceCard.tsx:78-158 | jini:packages/ui/src/features/a2ui/renderer.tsx:74-139 |
| tovu-tovu | 60 | 573 | tovu:apps/admin/src/features/observability/observability-visuals.tsx:27-86 | tovu:apps/admin/src/features/plugins/agent-plugins-visuals.tsx:45-86 |
| tovu-tovu | 60 | 569 | tovu:apps/admin/src/features/observability/observability-visuals.tsx:27-86 | tovu:apps/admin/src/features/plugins/agent-plugins-visuals.tsx:52-110 |
| tovu-jini | 49 | 572 | tovu:apps/admin/src/features/users/hooks/users-dependencies.hooks.ts:86-134 | jini:packages/user-management/src/react/testing.ts:66-114 |
| jini-jini | 48 | 89 | jini:packages/agent-runtime/src/providers/connection-guard.ts:108-155 | jini:packages/integrations/src/media-providers/dispatch/ssrf-guard.ts:60-66 |
| jini-jini | 44 | 521 | jini:packages/chat/src/react/components/ToolCard.tsx:241-284 | jini:packages/chat/src/react/components/ToolCard.tsx:218-253 |
| jini-jini | 41 | 164 | jini:packages/chat/src/react/chat-pane.ts:34-74 | jini:packages/chat/src/react/index.ts:116-156 |
| jini-jini | 39 | 250 | jini:packages/artifacts/src/text-suppression.ts:103-141 | jini:packages/agent-runtime/src/agent-protocol/acp/text-suppression.ts:157-203 |
| tovu-jini | 37 | 117 | tovu:apps/admin/src/features/media/rules.ts:200-236 | jini:packages/admin/src/media/html-attributes.ts:26-84 |
| tovu-tovu | 34 | 257 | tovu:apps/website/src/server/inbound/admin-http/routes/pages/update.ts:201-234 | tovu:apps/website/src/server/inbound/admin-http/routes/posts/update.ts:225-258 |
| jini-jini | 34 | 102 | jini:packages/mcp/src/core/config.ts:63-96 | jini:packages/mcp/src/core/tokens.ts:80-111 |
| tovu-tovu | 32 | 393 | tovu:content/themes/static/tovu-theme/scripts/theme-toggle.js:1-32 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/theme-toggle.js:1-32 |
| tovu-tovu | 32 | 338 | tovu:apps/website/src/server/inbound/admin-http/routes/redirects/get-by-id.ts:7-38 | tovu:apps/website/src/server/inbound/admin-http/routes/redirects/update.ts:16-44 |
| jini-jini | 32 | 323 | jini:packages/daemon/src/http/component-catalog.ts:48-79 | jini:packages/daemon/src/http/tool-catalog.ts:68-89 |
| jini-jini | 32 | 166 | jini:packages/ui/src/renderers/types.ts:11-42 | jini:packages/chat/src/core/util/types.ts:1-33 |
| tovu-tovu | 31 | 377 | tovu:content/themes/__original-themes__/static/tovu-starter/scripts/theme-toggle.js:2-32 | tovu:content/themes/__original-themes__/static/tovu-theme/scripts/theme-toggle.js:2-32 |
| jini-jini | 30 | 156 | jini:packages/sidecar/src/json-ipc.ts:83-112 | jini:packages/sidecar/src/port.ts:24-45 |
| tovu-jini | 29 | 314 | tovu:apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:87-115 | jini:packages/user-management/src/react/testing.ts:205-233 |
| tovu-tovu | 28 | 260 | tovu:apps/website/src/server/inbound/admin-http/routes/integrations/delete.ts:16-43 | tovu:apps/website/src/server/inbound/admin-http/routes/integrations/deliveries.ts:29-53 |
| tovu-tovu | 27 | 291 | tovu:apps/website/src/server/inbound/admin-http/routes/pages/create.ts:17-43 | tovu:apps/website/src/server/inbound/admin-http/routes/posts/update.ts:67-43 |
| tovu-tovu | 27 | 259 | tovu:apps/website/src/server/inbound/admin-http/routes/redirects/hits.ts:12-38 | tovu:apps/website/src/server/inbound/admin-http/routes/redirects/update.ts:16-43 |
| tovu-tovu | 27 | 207 | tovu:apps/admin/src/lib/visible-interval.ts:17-43 | tovu:apps/desktop/src/renderer/visible-interval.ts:14-40 |
| jini-jini | 26 | 247 | jini:packages/agent-runtime/src/pi-models.ts:18-43 | jini:packages/agent-runtime/src/agent-protocol/pi-rpc/models.ts:29-54 |
| jini-jini | 26 | 236 | jini:packages/agent-runtime/src/providers/tool-turn.ts:291-316 | jini:packages/agent-runtime/src/providers/tool-turn.ts:242-211 |
| jini-jini | 25 | 260 | jini:packages/chat/src/react/components/ToolCard.tsx:446-470 | jini:packages/chat/src/react/components/ToolCard.tsx:239-235 |
| tovu-tovu | 25 | 249 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts:22-46 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts:19-43 |
| tovu-tovu | 25 | 245 | tovu:apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts:8-32 | tovu:apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts:9-33 |
| tovu-tovu | 25 | 245 | tovu:apps/website/src/server/inbound/admin-http/routes/comments/get-settings.ts:15-39 | tovu:apps/website/src/server/inbound/admin-http/routes/comments/put-settings.ts:15-39 |
| tovu-tovu | 25 | 230 | tovu:apps/website/src/server/inbound/admin-http/routes/members/list.ts:40-64 | tovu:apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:30-87 |
| jini-jini | 24 | 274 | jini:packages/core/src/settings/dictionaries/index.ts:18-41 | jini:packages/ui/src/features/i18n/dictionaries/index.ts:37-58 |
| tovu-tovu | 24 | 251 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts:81-104 | tovu:apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:30-114 |
| tovu-tovu | 24 | 249 | tovu:apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts:135-158 | tovu:apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts:103-126 |
| tovu-tovu | 24 | 241 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts:14-37 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts:59-37 |
| tovu-tovu | 24 | 235 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts:14-37 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts:59-114 |
| tovu-tovu | 24 | 233 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts:64-87 | tovu:apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:30-114 |
| tovu-tovu | 24 | 233 | tovu:apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts:169-192 | tovu:apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:30-114 |
| tovu-tovu | 24 | 229 | tovu:apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts:51-74 | tovu:apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:30-48 |
| tovu-tovu | 24 | 227 | tovu:apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts:25-48 | tovu:apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:30-79 |
| jini-jini | 24 | 214 | jini:packages/cli/src/daemon-command.ts:25-48 | jini:packages/cli/src/run-command.ts:30-46 |

### Tovu↔Jini copies — top 50 of 75

| lines | tokens | Tovu | Jini |
|---|---|---|---|
| 154 | 145 | apps/website/src/features/webmcp/generated/annotated-actions-script.ts:2-155 | packages/agentic/src/core/annotated-actions-script.ts:1-154 |
| 49 | 572 | apps/admin/src/features/users/hooks/users-dependencies.hooks.ts:86-134 | packages/user-management/src/react/testing.ts:66-114 |
| 37 | 117 | apps/admin/src/features/media/rules.ts:200-236 | packages/admin/src/media/html-attributes.ts:26-84 |
| 29 | 314 | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:87-115 | packages/user-management/src/react/testing.ts:205-233 |
| 24 | 180 | apps/desktop/src/renderer/folder-drop.ts:46-69 | packages/ui/src/features/folder-path-drop/rules.ts:29-48 |
| 22 | 194 | apps/website/src/features/agent-plugins/capability-projection.ts:69-90 | packages/agent-plugins/src/lifecycle/capability-projection.ts:39-61 |
| 22 | 120 | apps/website/src/features/navigation/index.ts:87-108 | packages/cms/src/navigation/index.ts:95-116 |
| 21 | 272 | apps/admin/src/features/users/hooks/users-dependencies.hooks.ts:141-161 | packages/user-management/src/react/testing.ts:121-141 |
| 21 | 264 | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:129-149 | packages/user-management/src/react/testing.ts:247-267 |
| 21 | 141 | apps/website/src/features/media/contracts.ts:12-32 | packages/plugins/src/host/ports.ts:97-87 |
| 20 | 178 | apps/admin/src/features/members/hooks/members-dependencies.hooks.ts:32-51 | packages/user-management/src/react/testing.ts:325-344 |
| 20 | 140 | apps/website/src/platform/db/chat-kernel.ts:43-62 | packages/chat/src/store/runtime/kernel.ts:6-24 |
| 18 | 209 | apps/website/src/features/database-transfer/destination-store.ts:23-40 | packages/db/src/tools/destination-port.ts:3-20 |
| 18 | 189 | apps/website/src/platform/db/sqlite/database-journal-repo.ts:112-129 | packages/db/src/recovery/migrate-forward-hooks.ts:23-40 |
| 16 | 164 | apps/website/src/server/inbound/public-http/http/site/form-render.ts:280-295 | packages/cms/src/forms/express/handler.ts:14-26 |
| 16 | 115 | apps/admin/src/features/database/Database.tsx:241-256 | packages/admin/src/comments/react/components/QueueSection.tsx:99-113 |
| 16 | 109 | apps/website/src/server/inbound/admin-http/routes/users/deps.ts:78-93 | packages/user-management/src/server/agent-tool-registrations.ts:84-100 |
| 16 | 109 | apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts:48-63 | packages/user-management/src/server/agent-tool-registrations.ts:84-100 |
| 16 | 109 | apps/website/src/server/inbound/admin-http/dev-auth.ts:166-181 | packages/user-management/src/server/agent-tool-registrations.ts:84-100 |
| 16 | 81 | apps/website/src/features/post/repo.memory.ts:96-111 | packages/cms/src/core/commands/repo.memory.ts:67-75 |
| 15 | 220 | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:115-129 | packages/user-management/src/react/testing.ts:233-247 |
| 14 | 214 | apps/website/src/server/inbound/admin-http/routes/settings/set.ts:17-30 | packages/core/src/settings/express/http.ts:15-23 |
| 14 | 158 | apps/website/src/platform/site-dir/active-site.ts:70-83 | packages/platform/src/fs/env-text.ts:5-18 |
| 14 | 157 | apps/admin/src/features/members/hooks/members-dependencies.hooks.ts:55-68 | packages/user-management/src/react/testing.ts:348-361 |
| 14 | 119 | apps/website/src/features/identity/delete-user-service.ts:103-116 | packages/user-management/src/server/grant-service.ts:73-83 |
| 14 | 92 | apps/website/src/server/runtime/boot/resolve-mailer.ts:127-140 | packages/platform/src/mail/resolve-mailer.ts:68-76 |
| 13 | 224 | apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:153-165 | packages/chat/src/core/ag-ui/entry.ts:43-55 |
| 13 | 114 | apps/website/src/assistant/mcp-federation/bootstrap.ts:170-182 | packages/mcp/src/federation/bootstrap.ts:176-184 |
| 12 | 214 | apps/website/src/server/inbound/admin-http/routes/settings/register-definitions.ts:21-32 | packages/core/src/settings/express/http.ts:23-31 |
| 12 | 147 | apps/website/src/features/navigation/trash-menu.ts:17-28 | packages/plugins/src/host/ports.ts:97-87 |
| 12 | 140 | apps/website/src/features/taxonomy/trash-term.ts:38-49 | packages/plugins/src/host/ports.ts:97-87 |
| 12 | 109 | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:183-194 | packages/user-management/src/react/testing.ts:302-313 |
| 12 | 81 | apps/website/src/features/source-control/store.ts:109-120 | packages/integrations/src/credentialed-http/sets/store.ts:59-70 |
| 11 | 112 | apps/website/src/features/identity/delete-user-service.ts:190-200 | packages/user-management/src/server/admin-crud-service.ts:732-742 |
| 11 | 92 | apps/admin/src/features/menus/Menus.tsx:68-78 | packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx:163-173 |
| 11 | 91 | apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:128-138 | packages/chat/src/core/ag-ui/entry.ts:19-29 |
| 11 | 86 | apps/website/src/features/entries/contracts.ts:35-45 | packages/cms/src/widgets/resolvers/ports.ts:19-24 |
| 11 | 81 | apps/admin/src/features/media/rules.ts:197-207 | packages/cms/src/media/html-attributes.ts:80-88 |
| 10 | 176 | apps/website/src/features/media-generation/media-provider-registry.ts:121-130 | packages/devops/src/deploy/target-descriptors.ts:32-43 |
| 10 | 157 | apps/admin/src/components/Select/Select.hooks.tsx:48-57 | packages/ui/src/features/admin-widgets/components/Select/Select.hooks.tsx:59-71 |
| 10 | 138 | apps/website/src/features/agent-plugins/analytics-provider-registry.ts:60-69 | packages/platform/src/object-store/descriptors.ts:34-43 |
| 10 | 116 | apps/admin/src/features/auth/hooks/use-login.hooks.ts:31-40 | packages/user-management/src/react/auth/hooks/use-login.hooks.ts:13-22 |
| 10 | 82 | apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts:145-154 | packages/admin/src/media/controllers/edit-media.controller.ts:67-69 |
| 9 | 146 | apps/website/src/server/inbound/public-http/http/site/page-head.ts:44-52 | packages/cms/src/seo/types.ts:79-87 |
| 9 | 137 | apps/website/src/platform/db/keyset-cursor.ts:26-34 | packages/cms/src/core/keyset-cursor.ts:26-34 |
| 9 | 119 | apps/website/src/features/media-generation/media-provider-registry.ts:132-140 | packages/platform/src/object-store/descriptors.ts:45-53 |
| 9 | 114 | apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx:36-44 | packages/admin/src/forms/react/components/FormFieldsEditor.tsx:175-171 |
| 9 | 99 | apps/website/src/features/taxonomy/trash-term.ts:22-30 | packages/plugins/src/host/ports.ts:97-85 |
| 9 | 97 | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:173-181 | packages/user-management/src/react/testing.ts:293-302 |
| 9 | 83 | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts:159-167 | packages/user-management/src/react/testing.ts:279-287 |

### Files with most duplicated lines — top 50 of 772

| repo | file | duplicated lines |
|---|---|---|
| jini | packages/cms/src/workspace/tool-registrations.ts | 528 |
| tovu | apps/website/src/server/inbound/admin-http/routes/integrations/list.ts | 327 |
| tovu | apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts | 326 |
| jini | packages/cms/src/widgets/region-area-service.ts | 314 |
| jini | packages/chat/src/react/components/ToolCard.tsx | 289 |
| tovu | content/themes/__original-themes__/static/tovu-starter/scripts/main.js | 242 |
| tovu | content/themes/__original-themes__/static/tovu-theme/scripts/main.js | 242 |
| tovu | content/themes/static/tovu-theme/scripts/main.js | 242 |
| tovu | content/themes/static/tovu-starter/scripts/main.js | 242 |
| tovu | apps/website/src/features/identity/repo.ts | 204 |
| jini | packages/user-management/src/react/testing.ts | 203 |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts | 199 |
| jini | packages/user-management/src/server/admin-crud-service.ts | 197 |
| tovu | apps/website/src/server/inbound/admin-http/routes/widgets/update.ts | 187 |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts | 187 |
| tovu | content/themes/__original-themes__/static/tovu-theme/scripts/docs-toc.js | 179 |
| tovu | content/themes/__original-themes__/static/tovu-starter/scripts/docs-toc.js | 179 |
| tovu | content/themes/static/tovu-theme/scripts/docs-toc.js | 179 |
| tovu | content/themes/static/tovu-starter/scripts/docs-toc.js | 179 |
| tovu | apps/website/src/features/webmcp/generated/annotated-actions-script.ts | 154 |
| jini | packages/agentic/src/core/annotated-actions-script.ts | 154 |
| tovu | apps/website/src/server/inbound/admin-http/routes/posts/create.ts | 150 |
| tovu | apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx | 145 |
| jini | packages/cms/src/widgets/write-service.ts | 137 |
| tovu | apps/website/src/server/inbound/admin-http/routes/pages/update.ts | 123 |
| jini | packages/cms/src/content-types/lifecycle.ts | 116 |
| tovu | apps/website/src/server/inbound/admin-http/routes/posts/delete.ts | 113 |
| tovu | apps/website/src/features/newsletter/repo.ts | 113 |
| tovu | content/themes/__original-themes__/static/tovu-theme/scripts/docs-sidebar.js | 104 |
| tovu | content/themes/__original-themes__/static/tovu-starter/scripts/docs-sidebar.js | 104 |
| tovu | content/themes/static/tovu-theme/scripts/docs-sidebar.js | 104 |
| tovu | content/themes/static/tovu-starter/scripts/docs-sidebar.js | 104 |
| tovu | apps/website/src/server/inbound/admin-http/routes/posts/update.ts | 101 |
| tovu | apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts | 99 |
| jini | packages/agent-runtime/src/agent-protocol/acp/text-suppression.ts | 98 |
| tovu | apps/website/src/features/newsletter/delivery/tool-registrations.ts | 95 |
| tovu | apps/website/src/server/inbound/admin-http/routes/publish-content/blobs-probe.ts | 94 |
| tovu | apps/website/src/features/taxonomy/tool-registrations.ts | 94 |
| jini | packages/daemon/src/http/media.ts | 94 |
| jini | packages/artifacts/src/text-suppression.ts | 90 |
| tovu | apps/website/src/server/inbound/admin-http/dev-auth.ts | 87 |
| tovu | apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts | 82 |
| jini | packages/chat/src/react/components/A2uiSurfaceCard.tsx | 81 |
| jini | packages/agent-runtime/src/providers/openai-chat.ts | 79 |
| jini | packages/agent-runtime/src/providers/anthropic-messages.ts | 79 |
| jini | packages/user-management/src/server/grant-service.ts | 77 |
| tovu | apps/website/src/server/inbound/admin-http/routes/users/update-role.ts | 74 |
| tovu | apps/website/src/server/inbound/admin-http/routes/pages/create.ts | 71 |
| tovu | apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts | 71 |
| jini | packages/cms/src/forms/write-service.ts | 71 |

## 3. Dead code (`knip.tsv`, 4788 rows)

### tovu: unused files — all 83

| file | in scope |
|---|---|
| development/e2e/live-publish-driver.mjs | no |
| development/e2e/live-publish-verify-launch.mjs | no |
| development/e2e/live-publish-verify-poll.mjs | no |
| development/e2e/save-publish-credential.mjs | no |
| development/e2e/desktop/_run-fixture.ts | no |
| development/e2e/desktop/add-site.desktop.ts | no |
| development/e2e/desktop/desktop.globalSetup.ts | no |
| development/e2e/desktop/global-chat.desktop.ts | no |
| development/e2e/desktop/multi-instance.desktop.ts | no |
| development/e2e/desktop/settings.desktop.ts | no |
| development/e2e/desktop/shared-agent-daemon.desktop.ts | no |
| development/e2e/desktop/site-lifecycle.desktop.ts | no |
| development/e2e/desktop/site-webview.desktop.ts | no |
| development/e2e/desktop/smoke.desktop.ts | no |
| development/e2e/desktop/two-sites-assistant.desktop.ts | no |
| development/e2e/journeys/mobile-visual.setup.ts | no |
| development/e2e/journeys/mobile-visual.visual.ts | no |
| development/e2e/soak/_evidence.ts | no |
| development/e2e/soak/desktop.soak.ts | no |
| development/e2e/soak/server.soak.ts | no |
| development/e2e/support/journey-admin-bundle.mjs | no |
| development/e2e/support/pin-site-state.ts | no |
| development/e2e/support/resettable-pin-api.ts | no |
| development/e2e/support/site-import-api.ts | no |
| development/e2e/support/start-journey-site.mjs | no |
| development/scripts/agent-run-probe.mjs | no |
| development/scripts/args-object-audit.mjs | no |
| development/scripts/backfill-media-slugs.ts | no |
| development/scripts/backfill-slug-collision-defaults.ts | no |
| development/scripts/build-brand-icons.mjs | no |
| development/scripts/check-admin-api-routes.ts | no |
| development/scripts/check-area-coverage-floor.ts | no |
| development/scripts/convert-legacy-doc-pages-to-html.ts | no |
| development/scripts/dev-admin-build.ts | no |
| development/scripts/dev-source-maps-off.mjs | no |
| development/scripts/dev-tsx-loader.mjs | no |
| development/scripts/extraction-dossier.mjs | no |
| development/scripts/migrate-page-embed-markers.ts | no |
| development/scripts/mutation-lanes.mjs | no |
| development/scripts/mutation-sweep.mjs | no |
| development/scripts/repair-site.ts | no |
| development/scripts/rewrite-deep-imports.ts | no |
| development/scripts/ts-escape-metrics.mjs | no |
| apps/website/src/features/media/attachment-tools.ts | yes |
| apps/website/src/features/post/author.ts | yes |
| apps/website/src/features/taxonomy/html-render.ts | yes |
| apps/website/src/server/__tests__/helper-teardown.fixture.ts | no |
| apps/website/src/server/__tests__/resource-teardown.fixture.ts | no |
| apps/website/src/contracts/core/__tests__/plugin-credential-card.typecheck.ts | no |
| apps/website/src/contracts/core/__tests__/provider-setting-field.typecheck.ts | no |
| apps/website/src/features/credential-safety/__tests__/disk-server.fixture.ts | no |
| apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p1-ports.type-pin.ts | no |
| apps/website/src/features/external-mcp/__tests__/external-mcp-connection-gate.typecheck.ts | no |
| apps/website/src/features/site-backup/__tests__/import-interruption.fixture.ts | no |
| apps/website/src/server/inbound/assistant/agent-daemon-server.ts | yes |
| apps/website/src/features/agent-plugins/__tests__/fixtures/activation-writer-child.ts | no |
| apps/website/src/features/external-mcp/__tests__/fixtures/mint-mcp-credentials-frozen.ts | no |
| apps/website/src/features/external-mcp/__tests__/fixtures/s5-baseline-rollback.mjs | no |
| apps/website/src/features/webhooks/__tests__/fixtures/site-key-ensure-child.ts | no |
| apps/website/src/platform/db/__tests__/parity/capture-vault-golden.ts | no |
| apps/website/src/platform/db/sqlite/__tests__/import-database-hanging.fixture.ts | no |
| apps/website/src/platform/db/sqlite/__tests__/import-database-logging.fixture.ts | no |
| apps/website/src/platform/db/sqlite/__tests__/import-database-parent.fixture.ts | no |
| apps/website/src/server/runtime/composition/import-database/repo.sqlite.ts | yes |
| apps/website/src/features/theme/__tests__/fixtures/astro-bundler-probe/astro.config.mjs | no |
| apps/website/src/platform/db/kernel/__tests__/fixtures/owner-lock-race-child.ts | no |
| apps/website/src/platform/db/kernel/__tests__/fixtures/pglite-owner-child.ts | no |
| apps/website/src/server/runtime/boot/__tests__/fixtures/unhandled-rejection-child.ts | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/destinations/rows.mjs | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/lib/connection.mjs | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/surface/handlers.mjs | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/tools/append-row.mjs | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/tools/last-token.mjs | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/tools/selection.mjs | no |
| apps/website/src/features/api-connections/__tests__/fixtures/acme-office/tools/whoami.mjs | no |
| apps/website/src/server/inbound/public-http/routes/site/__tests__/capture-commerce-strip-golden.ts | no |
| apps/website/src/server/runtime/composition/__tests__/fixtures/other-vendor/ghost.mjs | no |
| apps/website/src/server/runtime/plugin-tier2/__tests__/fixtures/echo-plugin/measure.ts | no |
| apps/website/src/server/runtime/plugin-tier2/__tests__/fixtures/echo-plugin/plugin.ts | no |
| apps/website/src/server/inbound/public-http/http/site/__tests__/fixtures/exit-worker.js | no |
| apps/desktop/src/site-discovery-worker.ts | yes |
| apps/desktop/src/renderer/electron-webview.d.ts | yes |
| apps/admin/__tests__/fixtures/dev-proxy-server.mjs | no |

### tovu: unused / unlisted / unresolved dependencies and binaries — all

| category | package.json or file | name | note |
|---|---|---|---|
| dependencies | package.json | @jini-ai/agent-plugins | LINK-ARTIFACT: specifier appears in 213 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/agent-runtime | LINK-ARTIFACT: specifier appears in 71 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/agentic | LINK-ARTIFACT: specifier appears in 34 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/analytics | LINK-ARTIFACT: specifier appears in 39 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/capability-providers | LINK-ARTIFACT: specifier appears in 10 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/chat | LINK-ARTIFACT: specifier appears in 60 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/cli | LINK-ARTIFACT: specifier appears in 5 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/cms | LINK-ARTIFACT: specifier appears in 787 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/commerce | LINK-ARTIFACT: specifier appears in 27 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/cookie-consent | LINK-ARTIFACT: specifier appears in 34 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/core | LINK-ARTIFACT: specifier appears in 1245 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/daemon | LINK-ARTIFACT: specifier appears in 465 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/db | LINK-ARTIFACT: specifier appears in 135 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/desktop-host | LINK-ARTIFACT: specifier appears in 9 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/devops | LINK-ARTIFACT: specifier appears in 78 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/diagnostics | LINK-ARTIFACT: specifier appears in 142 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/http-kit | LINK-ARTIFACT: specifier appears in 87 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/infra | LINK-ARTIFACT: specifier appears in 7 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/integrations | LINK-ARTIFACT: specifier appears in 102 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/mcp | LINK-ARTIFACT: specifier appears in 95 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/oauth | LINK-ARTIFACT: specifier appears in 47 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/platform | LINK-ARTIFACT: specifier appears in 313 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/plugin-catalog | LINK-ARTIFACT: specifier appears in 3 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/plugins | LINK-ARTIFACT: specifier appears in 173 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/protocol | LINK-ARTIFACT: specifier appears in 15 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/provider-plugins | LINK-ARTIFACT: specifier appears in 9 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/registry | LINK-ARTIFACT: specifier appears in 11 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/sandbox | LINK-ARTIFACT: specifier appears in 7 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/search | LINK-ARTIFACT: specifier appears in 20 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/server | LINK-ARTIFACT: specifier appears in 6 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/sidecar | LINK-ARTIFACT: specifier appears in 20 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/ui | LINK-ARTIFACT: specifier appears in 74 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/user-management | LINK-ARTIFACT: specifier appears in 175 files under apps/website,development,packages |
| dependencies | package.json | @jini-ai/vibecoding | LINK-ARTIFACT: specifier appears in 4 files under apps/website,development,packages |
| dependencies | package.json | dompurify |  |
| dependencies | package.json | hast-util-from-parse5 |  |
| dependencies | package.json | hast-util-to-mdast |  |
| dependencies | package.json | jszip |  |
| dependencies | package.json | mammoth |  |
| dependencies | package.json | mdast-util-gfm-table |  |
| dependencies | package.json | mdast-util-to-markdown |  |
| dependencies | package.json | unpdf |  |
| devDependencies | package.json | @opentelemetry/exporter-trace-otlp-http |  |
| devDependencies | package.json | @types/js-yaml |  |
| devDependencies | package.json | astro |  |
| devDependencies | package.json | drizzle-kit |  |
| binaries | package.json | vitest |  |
| dependencies | apps/desktop/package.json | @cfworker/json-schema | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @jini-ai/agent-runtime | LINK-ARTIFACT: specifier appears in 17 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/chat | LINK-ARTIFACT: specifier appears in 17 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/core | LINK-ARTIFACT: specifier appears in 23 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/daemon | LINK-ARTIFACT: specifier appears in 12 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/desktop-host | LINK-ARTIFACT: specifier appears in 43 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/diagnostics | LINK-ARTIFACT: specifier appears in 11 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/db | LINK-ARTIFACT: specifier appears in 3 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/mcp | LINK-ARTIFACT: specifier appears in 9 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/platform | LINK-ARTIFACT: specifier appears in 22 files under apps/desktop |
| dependencies | apps/desktop/package.json | @jini-ai/sidecar | LINK-ARTIFACT: specifier appears in 7 files under apps/desktop |
| dependencies | apps/desktop/package.json | @mcp-ui/client | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @modelcontextprotocol/sdk | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @radix-ui/react-checkbox | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @radix-ui/react-label | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @radix-ui/react-radio-group | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @radix-ui/react-select | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @radix-ui/react-slot | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | jszip | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | node-pty | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | undici | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/desktop/package.json | @jini-ai/integrations | LINK-ARTIFACT: specifier appears in 3 files under apps/desktop |
| devDependencies | apps/desktop/package.json | @jini-ai/agentic | LINK-ARTIFACT: specifier appears in 2 files under apps/desktop |
| devDependencies | apps/desktop/package.json | @jini-ai/devops | LINK-ARTIFACT: specifier appears in 14 files under apps/desktop |
| devDependencies | apps/desktop/package.json | @jini-ai/protocol | LINK-ARTIFACT: specifier appears in 7 files under apps/desktop |
| devDependencies | apps/desktop/package.json | @jini-ai/ui | LINK-ARTIFACT: specifier appears in 18 files under apps/desktop |
| devDependencies | apps/desktop/package.json | class-variance-authority | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | clsx | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | jsdom | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | micromark | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | micromark-extension-gfm | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | npm | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | shiki | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| devDependencies | apps/desktop/package.json | tailwind-merge | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | @jini-ai/admin | LINK-ARTIFACT: specifier appears in 117 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/agent-plugins | LINK-ARTIFACT: specifier appears in 10 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/agent-runtime | LINK-ARTIFACT: specifier appears in 4 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/agentic | LINK-ARTIFACT: specifier appears in 148 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/chat | LINK-ARTIFACT: specifier appears in 126 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/cms | LINK-ARTIFACT: specifier appears in 9 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/core | LINK-ARTIFACT: specifier appears in 42 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/integrations | LINK-ARTIFACT: specifier appears in 18 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/platform | LINK-ARTIFACT: specifier appears in 4 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/plugins | LINK-ARTIFACT: specifier appears in 3 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/protocol | LINK-ARTIFACT: specifier appears in 5 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/ui | LINK-ARTIFACT: specifier appears in 481 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/ui-kit | LINK-ARTIFACT: specifier appears in 22 files under apps/admin |
| dependencies | apps/admin/package.json | @jini-ai/user-management | LINK-ARTIFACT: specifier appears in 18 files under apps/admin |
| dependencies | apps/admin/package.json | @mcp-ui/client | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | @radix-ui/react-checkbox | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | @radix-ui/react-label | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | @radix-ui/react-radio-group | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | @radix-ui/react-select | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | @radix-ui/react-slot | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | class-variance-authority | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | clsx | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | micromark | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | micromark-extension-gfm | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | shiki | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/admin/package.json | tailwind-merge | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | packages/contracts/package.json | @jini-ai/analytics | LINK-ARTIFACT: specifier appears in 2 files under packages/contracts |
| dependencies | packages/contracts/package.json | @jini-ai/diagnostics | LINK-ARTIFACT: specifier appears in 3 files under packages/contracts |
| dependencies | apps/site-chat/package.json | @jini-ai/agentic | LINK-ARTIFACT: specifier appears in 3 files under apps/site-chat |
| dependencies | apps/site-chat/package.json | @jini-ai/chat | LINK-ARTIFACT: specifier appears in 17 files under apps/site-chat |
| dependencies | apps/site-chat/package.json | @jini-ai/protocol | LINK-ARTIFACT: specifier appears in 2 files under apps/site-chat |
| dependencies | apps/site-chat/package.json | @jini-ai/ui | LINK-ARTIFACT: specifier appears in 4 files under apps/site-chat |
| dependencies | apps/site-chat/package.json | @mcp-ui/client | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | @radix-ui/react-checkbox | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | @radix-ui/react-label | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | @radix-ui/react-radio-group | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | @radix-ui/react-select | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | @radix-ui/react-slot | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | class-variance-authority | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | clsx | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | shiki | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | apps/site-chat/package.json | tailwind-merge | unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini) |
| dependencies | packages/sdk/package.json | @jini-ai/plugins | LINK-ARTIFACT: specifier appears in 3 files under packages/sdk |
| unlisted | apps/website/src/assistant/__tests__/ask-choice-custom-answer.test.ts | ajv |  |
| unlisted | apps/website/src/assistant/__tests__/ask-choice-tool.test.ts | ajv |  |
| unlisted | apps/website/src/features/plugin-runtime/capability-tool-registrations.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/host-binding.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/pages/__tests__/tool-registrations.test.ts | ajv |  |
| unlisted | apps/website/src/features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts | ajv |  |
| unlisted | apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/theme/__tests__/heading-phone-overflow.test.ts | postcss |  |
| unlisted | apps/website/src/features/theme/__tests__/landing-deck-fab-clearance.test.ts | postcss |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/integration/activation.integration.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/built-ins/word-count/index.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/integration/declarative-runtime.integration.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-tier2-observe.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/integration/plugin-conflicts.integration.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts | ajv |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/invocation-core-deps.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/unit/invocation-core-deps.unit.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/plugin-export.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/__tests__/unit/plugin-export.unit.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/site-glue/__tests__/integration/content-lifecycle.integration.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/platform/site-dir/__tests__/integration/migration-backup-exclusion.integration.test.ts | minimatch |  |
| unlisted | apps/website/src/platform/site-dir/__tests__/integration/storage-secret-exclusion.integration.test.ts | minimatch |  |
| unlisted | apps/website/src/server/runtime/composition/charts-recharts-source.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/runtime/composition/__tests__/plugin-runtime-l005-characterization.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/runtime/composition/__tests__/plugin-runtime.provider-plugins.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/runtime/plugin-tier2/__tests__/tier2-runtime.integration.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/runtime/plugin-tier2/__tests__/worker.unit.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts | esbuild |  |
| unlisted | apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/built-ins/content-analyzer/__tests__/unit/plugin.unit.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/features/plugin-runtime/built-ins/word-count/__tests__/unit/word-count.unit.test.ts | @tovu/sdk |  |
| unlisted | apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts | esbuild |  |
| unlisted | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-sandbox.test.ts | esbuild |  |
| unlisted | apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/preview-route.unit.test.ts | @tovu/sdk |  |
| unlisted | apps/desktop/src/electron-builder-files.test.ts | app-builder-lib |  |
| unlisted | apps/desktop/src/packaging-selection.test.ts | temp-file |  |
| unlisted | apps/desktop/src/packaging-selection.test.ts | app-builder-lib |  |
| unlisted | apps/desktop/src/stage-payload-run.test.ts | app-builder-lib |  |
| unlisted | apps/admin/src/__tests__/unit/css-declarations.test-helper.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/assistant-toggle-tip-wrap-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/chat-fab-hide-preference.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/chat-fab-z-order-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/chat-settings-tip-phone-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/domain-dialog-class.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/phone-touch-targets-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/scroll-jump-layout-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/selection-ring-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/sitemap-modal-phone-css.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/__tests__/unit/slow-css-selectors.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/admin-themes/__tests__/admin-themes.unit.test.ts | postcss |  |
| unlisted | apps/admin/src/admin-themes/glass/__tests__/glass-theme.unit.test.ts | postcss |  |

### tovu: unused exports (in scope) — top 50 of 935, by file

| file | name | line |
|---|---|---|
| apps/website/src/features/plugin-runtime/host-binding.ts | PLUGIN_HOOK_SEMANTICS | 19 |
| apps/website/src/features/theme/static-render.ts | safeHref | 182 |
| apps/website/src/features/agent-plugins/lifecycle.ts | importContainedModule | 250 |
| apps/website/src/platform/db/schema.sqlite.ts | postRevisions | 271 |
| apps/website/src/platform/db/schema.sqlite.ts | pluginActivations | 302 |
| apps/website/src/platform/db/schema.sqlite.ts | settingDefinitions | 322 |
| apps/website/src/platform/db/schema.sqlite.ts | settingValuesGlobal | 355 |
| apps/website/src/platform/db/schema.sqlite.ts | menus | 423 |
| apps/website/src/platform/db/schema.sqlite.ts | navLocationBindings | 449 |
| apps/website/src/platform/db/schema.sqlite.ts | settingRevisions | 467 |
| apps/website/src/platform/db/schema.sqlite.ts | siteTitlePreexistingWorkspaces | 495 |
| apps/website/src/platform/db/schema.sqlite.ts | formSubmissionRemoteReceipts | 582 |
| apps/website/src/platform/db/schema.sqlite.ts | formDeliveryPlans | 600 |
| apps/website/src/platform/db/schema.sqlite.ts | formDeliveryJobs | 610 |
| apps/website/src/platform/db/schema.sqlite.ts | formReceiverPulls | 623 |
| apps/website/src/platform/db/schema.sqlite.ts | redirectRevisions | 682 |
| apps/website/src/platform/db/schema.sqlite.ts | redirectHits | 705 |
| apps/website/src/platform/db/schema.sqlite.ts | memberExternalIdentities | 743 |
| apps/website/src/platform/db/schema.sqlite.ts | memberTiers | 761 |
| apps/website/src/platform/db/schema.sqlite.ts | memberSubscriptions | 796 |
| apps/website/src/platform/db/schema.sqlite.ts | memberSessions | 816 |
| apps/website/src/platform/db/schema.sqlite.ts | memberMagicTokens | 836 |
| apps/website/src/platform/db/schema.sqlite.ts | memberConsents | 863 |
| apps/website/src/platform/db/schema.sqlite.ts | memberRevisions | 898 |
| apps/website/src/platform/db/schema.sqlite.ts | webhookSubscriptions | 963 |
| apps/website/src/platform/db/schema.sqlite.ts | webhookDeliveries | 993 |
| apps/website/src/platform/db/schema.sqlite.ts | identityUsers | 1038 |
| apps/website/src/platform/db/schema.sqlite.ts | ownerRecoveryCodes | 1052 |
| apps/website/src/platform/db/schema.sqlite.ts | ownerMfaFactors | 1063 |
| apps/website/src/platform/db/schema.sqlite.ts | ownerMfaPending | 1070 |
| apps/website/src/platform/db/schema.sqlite.ts | roles | 1099 |
| apps/website/src/platform/db/schema.sqlite.ts | policies | 1110 |
| apps/website/src/platform/db/schema.sqlite.ts | policyPermissions | 1123 |
| apps/website/src/platform/db/schema.sqlite.ts | rolePolicies | 1136 |
| apps/website/src/platform/db/schema.sqlite.ts | principalRoles | 1147 |
| apps/website/src/platform/db/schema.sqlite.ts | principalPolicies | 1158 |
| apps/website/src/platform/db/schema.sqlite.ts | databaseWriteWatermark | 1216 |
| apps/website/src/platform/db/schema.sqlite.ts | contentTypes | 1230 |
| apps/website/src/platform/db/schema.sqlite.ts | contentTypeRevisions | 1249 |
| apps/website/src/platform/db/schema.sqlite.ts | entryRevisions | 1300 |
| apps/website/src/platform/db/schema.sqlite.ts | taxonomies | 1326 |
| apps/website/src/platform/db/schema.sqlite.ts | terms | 1340 |
| apps/website/src/platform/db/schema.sqlite.ts | entryTerms | 1356 |
| apps/website/src/platform/db/schema.sqlite.ts | taxonomyRevisions | 1371 |
| apps/website/src/platform/db/schema.sqlite.ts | gatedMutationTokens | 1465 |
| apps/website/src/platform/db/schema.sqlite.ts | originSettings | 1486 |
| apps/website/src/platform/db/schema.sqlite.ts | mediaSlugHistory | 1585 |
| apps/website/src/platform/db/schema.sqlite.ts | assetBlobs | 1601 |
| apps/website/src/platform/db/schema.sqlite.ts | assetRenditions | 1646 |
| apps/website/src/platform/db/schema.sqlite.ts | transformDefinitions | 1667 |

### tovu: unused types (in scope) — top 50 of 2611, by file

| file | name | line |
|---|---|---|
| apps/website/src/features/plugin-runtime/capability-tool-registrations.ts | PluginCapabilityFieldSource | 32 |
| apps/website/src/features/plugin-runtime/invocation-core-deps.ts | CreatePluginInvocationCoreDepsRequired | 21 |
| apps/website/src/features/plugin-runtime/invocation-core-deps.ts | CreatePluginInvocationCoreDepsOptional | 27 |
| apps/website/src/features/plugin-runtime/invocation-core-deps.ts | PluginInvocationCoreDeps | 29 |
| apps/website/src/features/theme/static-render.ts | StaticHtmlMenu | 175 |
| apps/website/src/features/theme/static-render.ts | StaticCollectionList | 537 |
| apps/website/src/features/theme/static-render.ts | PostTemplateResolution | 910 |
| apps/website/src/features/theme/static-render.ts | TemplateBranchChoice | 1335 |
| apps/website/src/features/agent-plugins/lifecycle.ts | InstalledAgentPluginSkill | 43 |
| apps/website/src/features/agent-plugins/lifecycle.ts | InstallAgentPluginOptional | 43 |
| apps/website/src/features/agent-plugins/lifecycle.ts | UninstallAgentPluginOptional | 44 |
| apps/website/src/features/agent-plugins/lifecycle.ts | UninstallAgentPluginResult | 44 |
| apps/website/src/features/agent-plugins/lifecycle.ts | SeededAgentPluginOutcome | 45 |
| apps/website/src/features/agent-plugins/lifecycle.ts | RetiredAgentPluginOutcome | 45 |
| apps/website/src/features/agent-plugins/lifecycle.ts | RetiredAgentPluginSuccessorOutcome | 46 |
| apps/website/src/features/agent-plugins/lifecycle.ts | RetireBundledAgentPluginsOptional | 46 |
| apps/website/src/features/agent-plugins/lifecycle.ts | BundledAgentPluginDigests | 46 |
| apps/website/src/features/agent-plugins/lifecycle.ts | SeededBundledAgentPluginDigest | 47 |
| apps/website/src/features/agent-plugins/lifecycle.ts | InstalledDigestIdentity | 47 |
| apps/website/src/features/agent-plugins/lifecycle.ts | PackedAgentPluginArchive | 47 |
| apps/website/src/features/agent-plugins/lifecycle.ts | AgentPluginSearchSkill | 48 |
| apps/website/src/features/agent-plugins/lifecycle.ts | AgentPluginSearchMatch | 48 |
| apps/website/src/features/agent-plugins/lifecycle.ts | TrustedPluginVerdict | 49 |
| apps/website/src/features/agent-plugins/lifecycle.ts | AgentPluginDeliveryMode | 49 |
| apps/website/src/features/agent-plugins/lifecycle.ts | ResolveAgentPluginRefsResult | 49 |
| apps/website/src/features/agent-plugins/lifecycle.ts | SeedBundledAgentPluginsRequired | 63 |
| apps/website/src/features/agent-plugins/lifecycle.ts | RetireBundledAgentPluginsRequired | 64 |
| apps/website/src/features/agent-plugins/lifecycle.ts | TrustedPluginPackagesQuery | 65 |
| apps/website/src/features/deployments/deploy-config.ts | DeploymentSecret | 39 |
| apps/website/src/features/deployments/deploy-config.ts | DeploymentDescriptor | 40 |
| apps/website/src/features/deployments/deploy-config.ts | DeployConfigKit | 40 |
| apps/website/src/features/deployments/deploy-config.ts | HostDeployNotesPorts | 55 |
| apps/website/src/features/publish-trust/connect.ts | ConnectedDestination | 100 |
| apps/website/src/features/deployments/deploy-ops/run-ops.ts | DeployRequest | 14 |
| apps/website/src/features/deployments/deploy-ops/run-ops.ts | WaitClock | 15 |
| apps/website/src/features/agent-plugins/connect-card-ui.ts | AgentPluginCardIdentity | 14 |
| apps/website/src/features/agent-plugins/connect-card-ui.ts | AgentPluginCredentialCardForms | 14 |
| apps/website/src/features/agent-plugins/connect-card-ui.ts | AgentPluginAccessTokenFormMessages | 14 |
| apps/website/src/features/api-connections/budgets.ts | ConnectionBudgetScope | 20 |
| apps/website/src/features/api-connections/budgets.ts | ConnectionBudgetTarget | 20 |
| apps/website/src/features/api-connections/budgets.ts | ConnectionBudgets | 36 |
| apps/website/src/features/agent-plugins/tool-registrations.ts | AgentPluginSkillDetail | 37 |
| apps/website/src/features/agent-plugins/tool-registrations.ts | AgentPluginToolSource | 37 |
| apps/website/src/features/agent-plugins/tool-registrations.ts | AgentPluginToolIdentity | 37 |
| apps/website/src/features/agent-plugins/tool-registrations.ts | AgentPluginToolGate | 37 |
| apps/website/src/features/agent-plugins/tool-registrations.ts | IdentifiedAgentPluginSearchCandidate | 37 |
| apps/website/src/features/agent-plugins/access-token-tool.ts | TokenAuthTarget | 27 |
| apps/website/src/features/agent-plugins/access-token-tool.ts | SetAccessTokenResult | 27 |
| apps/website/src/features/agent-plugins/access-token-tool.ts | AgentPluginAccessTokenMessages | 27 |
| apps/website/src/features/agent-plugins/access-token-tool.ts | AgentPluginTokenValidator | 27 |

### tovu: unused duplicates (in scope) — top 50 of 2, by file

| file | name | line |
|---|---|---|
| apps/website/src/contracts/core/assistant-native-fallbacks.ts | resolveFullCliAccess = resolveAssistantNativeFallbacks | 54 |
| apps/website/src/platform/db/sqlite/database-journal-db.ts | journalKernel = openDatabaseJournalDb | 27 |

### jini: unused files — all 43

| file | in scope |
|---|---|
| scripts/lib/npm-pack-json.d.ts | no |
| scripts/testing/packed-fixture.d.ts | no |
| scripts/testing/packed-fixture.ts | no |
| examples/reference-web/vite.mcpui-view.config.ts | no |
| examples/reference-web/src/verify-mcpui-swap.tsx | no |
| examples/neutral-host/src/neutral-host/support/self-check.ts | no |
| packages/user-management/src/admin/__tests__/composition.typecheck.ts | no |
| packages/server/src/create-local-node-daemon.typecheck.ts | no |
| packages/server/src/__tests__/fixtures/graceful-shutdown-child.ts | no |
| packages/admin/src/core/module/__tests__/composition.typecheck.ts | no |
| packages/provider-plugins/src/charts-echarts/index.ts | yes |
| packages/provider-plugins/src/charts-recharts/index.ts | yes |
| packages/provider-plugins/src/formspree/index.ts | yes |
| packages/provider-plugins/src/google-forms/index.ts | yes |
| packages/agent-plugins/src/lifecycle/__tests__/fixtures/activation-writer-child.ts | no |
| packages/diagnostics/vitest.port.config.ts | no |
| packages/diagnostics/src/web-evidence/__tests__/web-evidence-playwright.port-check.ts | no |
| packages/ui/src/features/mcp-ui/__tests__/cards-contracts.typecheck.ts | no |
| packages/ui/src/features/mcp-ui/__tests__/pinned-cards.typecheck.ts | no |
| packages/ui/src/features/panel-kit/hooks/__tests__/focus-trap.test-helpers.ts | no |
| packages/agent-runtime/src/defs/__tests__/claude-filesystem.live.canary.ts | no |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts | yes |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx | yes |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts | yes |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts | yes |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx | yes |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx | yes |
| packages/cms/src/content-types/__tests__/contracts.typecheck.ts | no |
| packages/db/src/__tests__/fixtures/owner-lock-race-child.ts | no |
| packages/db/src/__tests__/fixtures/pglite-owner-child.ts | no |
| examples/cookie-consent-standalone/fake-vendor.js | no |
| packages/platform/src/secrets/__tests__/vault-contracts.typecheck.ts | no |
| packages/cookie-consent/src/client/entry.ts | yes |
| packages/sandbox/src/__tests__/fixtures/exit-worker.cjs | no |
| packages/sandbox/src/__tests__/fixtures/register-worker.cjs | no |
| packages/sandbox/src/__tests__/fixtures/reply-worker.cjs | no |
| packages/ui-kit/src/react/__tests__/binding.typecheck.ts | no |
| packages/core/src/args-convention.typecheck.ts | no |
| packages/core/src/compose.typecheck.ts | no |
| packages/core/src/settings/__tests__/principal-lookup.typecheck.ts | no |
| packages/sqlite/src/__tests__/packed-fixture.d.ts | no |
| packages/sqlite/src/__tests__/packed-fixture.ts | no |
| packages/chat/src/store/__tests__/types.fixture.ts | no |

### jini: unused / unlisted / unresolved dependencies and binaries — all

| category | package.json or file | name | note |
|---|---|---|---|
| dependencies | examples/reference-web/package.json | @jini-ai/http-kit |  |
| dependencies | examples/reference-web/package.json | @jini-ai/mcp |  |
| devDependencies | examples/reference-web/package.json | @modelcontextprotocol/ext-apps |  |
| devDependencies | examples/reference-web/package.json | @modelcontextprotocol/sdk |  |
| devDependencies | examples/reference-web/package.json | vite-plugin-singlefile |  |
| dependencies | examples/minimal-host/package.json | @jini-ai/db |  |
| dependencies | examples/minimal-host/package.json | @jini-ai/http-kit |  |
| dependencies | examples/minimal-host/package.json | @jini-ai/oauth |  |
| dependencies | examples/minimal-host/package.json | @jini-ai/registry |  |
| dependencies | examples/minimal-host/package.json | @jini-ai/sidecar |  |
| dependencies | packages/cms/package.json | unpdf |  |
| dependencies | packages/cms/package.json | mammoth |  |
| devDependencies | packages/cms/package.json | mammoth |  |
| devDependencies | packages/cms/package.json | unpdf |  |
| optionalPeerDependencies | packages/cms/package.json | @jini-ai/db |  |
| optionalPeerDependencies | packages/cms/package.json | @jini-ai/http-kit |  |
| optionalPeerDependencies | packages/cms/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/cms/package.json | dompurify |  |
| optionalPeerDependencies | packages/cms/package.json | express |  |
| optionalPeerDependencies | packages/cms/package.json | jsdom |  |
| optionalPeerDependencies | packages/cms/package.json | kysely |  |
| optionalPeerDependencies | packages/cms/package.json | sharp |  |
| devDependencies | package.json | @jini-ai/provider-plugins |  |
| devDependencies | package.json | dependency-cruiser |  |
| binaries | package.json | python3 |  |
| devDependencies | packages/user-management/package.json | argon2 |  |
| optionalPeerDependencies | packages/user-management/package.json | @jini-ai/admin |  |
| optionalPeerDependencies | packages/user-management/package.json | @jini-ai/agentic |  |
| optionalPeerDependencies | packages/user-management/package.json | @jini-ai/ui |  |
| optionalPeerDependencies | packages/user-management/package.json | @jini-ai/ui-kit |  |
| optionalPeerDependencies | packages/user-management/package.json | react |  |
| optionalPeerDependencies | packages/user-management/package.json | react-dom |  |
| devDependencies | packages/provider-plugins/package.json | @jini-ai/capability-providers |  |
| devDependencies | packages/provider-plugins/package.json | posthog-js |  |
| devDependencies | packages/agent-plugins/package.json | @jini-ai/cms |  |
| optionalPeerDependencies | packages/agent-plugins/package.json | yauzl |  |
| optionalPeerDependencies | packages/agent-plugins/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/agent-plugins/package.json | @cfworker/json-schema |  |
| optionalPeerDependencies | packages/agent-plugins/package.json | semver |  |
| optionalPeerDependencies | packages/agent-plugins/package.json | @jini-ai/commerce |  |
| devDependencies | packages/ui/package.json | @radix-ui/react-slot |  |
| devDependencies | packages/ui/package.json | tailwindcss |  |
| optionalPeerDependencies | packages/ui/package.json | @tanstack/react-query |  |
| optionalPeerDependencies | packages/ui/package.json | @excalidraw/excalidraw |  |
| optionalPeerDependencies | packages/ui/package.json | @lexical/react |  |
| optionalPeerDependencies | packages/ui/package.json | @lexical/utils |  |
| optionalPeerDependencies | packages/ui/package.json | @mcp-ui/client |  |
| optionalPeerDependencies | packages/ui/package.json | @radix-ui/react-checkbox |  |
| optionalPeerDependencies | packages/ui/package.json | @radix-ui/react-label |  |
| optionalPeerDependencies | packages/ui/package.json | @radix-ui/react-radio-group |  |
| optionalPeerDependencies | packages/ui/package.json | @radix-ui/react-select |  |
| optionalPeerDependencies | packages/ui/package.json | grapesjs |  |
| optionalPeerDependencies | packages/ui/package.json | lexical |  |
| optionalPeerDependencies | packages/ui/package.json | class-variance-authority |  |
| optionalPeerDependencies | packages/ui/package.json | clsx |  |
| optionalPeerDependencies | packages/ui/package.json | parse5 |  |
| optionalPeerDependencies | packages/ui/package.json | shiki |  |
| optionalPeerDependencies | packages/ui/package.json | tailwind-merge |  |
| optionalPeerDependencies | packages/ui/package.json | zod |  |
| devDependencies | packages/plugin-fixture-provider/package.json | @jini-ai/cookie-consent |  |
| devDependencies | packages/artifacts/package.json | @vitest/coverage-v8 |  |
| devDependencies | packages/agentic/package.json | jsdom |  |
| optionalPeerDependencies | packages/agentic/package.json | @jini-ai/protocol |  |
| optionalPeerDependencies | packages/agentic/package.json | @jini-ai/core |  |
| devDependencies | packages/ui-kit/package.json | vue |  |
| optionalPeerDependencies | packages/devops/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/devops/package.json | undici |  |
| optionalPeerDependencies | packages/devops/package.json | parse5 |  |
| optionalPeerDependencies | packages/devops/package.json | electron |  |
| optionalPeerDependencies | packages/server/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/server/package.json | @jini-ai/chat |  |
| optionalPeerDependencies | packages/server/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/server/package.json | kysely |  |
| optionalPeerDependencies | packages/daemon/package.json | node-pty |  |
| optionalPeerDependencies | packages/daemon/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/daemon/package.json | @electric-sql/pglite |  |
| optionalPeerDependencies | packages/daemon/package.json | pg |  |
| optionalPeerDependencies | packages/search/package.json | @jini-ai/agent-plugins |  |
| optionalPeerDependencies | packages/admin/package.json | react |  |
| optionalPeerDependencies | packages/admin/package.json | react-dom |  |
| optionalPeerDependencies | packages/admin/package.json | @jini-ai/agentic |  |
| optionalPeerDependencies | packages/admin/package.json | @jini-ai/ui |  |
| optionalPeerDependencies | packages/admin/package.json | @jini-ai/ui-kit |  |
| optionalPeerDependencies | packages/admin/package.json | @jini-ai/agent-plugins |  |
| optionalPeerDependencies | packages/admin/package.json | @jini-ai/cms |  |
| optionalPeerDependencies | packages/admin/package.json | @jini-ai/core |  |
| optionalPeerDependencies | packages/chat/package.json | react |  |
| optionalPeerDependencies | packages/chat/package.json | react-dom |  |
| optionalPeerDependencies | packages/chat/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/chat/package.json | @electric-sql/pglite |  |
| optionalPeerDependencies | packages/chat/package.json | pg |  |
| optionalPeerDependencies | packages/chat/package.json | @ag-ui/core |  |
| optionalPeerDependencies | packages/chat/package.json | @jini-ai/agent-runtime |  |
| optionalPeerDependencies | packages/chat/package.json | @jini-ai/ui |  |
| optionalPeerDependencies | packages/commerce/package.json | @jini-ai/db |  |
| optionalPeerDependencies | packages/commerce/package.json | kysely |  |
| optionalPeerDependencies | packages/commerce/package.json | express |  |
| optionalPeerDependencies | packages/commerce/package.json | react |  |
| optionalPeerDependencies | packages/commerce/package.json | @jini-ai/agentic |  |
| optionalPeerDependencies | packages/commerce/package.json | @jini-ai/ui |  |
| optionalPeerDependencies | packages/analytics/package.json | @jini-ai/agent-runtime |  |
| optionalPeerDependencies | packages/integrations/package.json | @jini-ai/db |  |
| optionalPeerDependencies | packages/integrations/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/integrations/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/integrations/package.json | @jini-ai/oauth |  |
| optionalPeerDependencies | packages/integrations/package.json | @cfworker/json-schema |  |
| optionalPeerDependencies | packages/registry/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/registry/package.json | @jini-ai/db |  |
| optionalPeerDependencies | packages/plugins/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/plugins/package.json | semver |  |
| optionalPeerDependencies | packages/plugins/package.json | kysely |  |
| optionalPeerDependencies | packages/plugins/package.json | @jini-ai/db |  |
| optionalPeerDependencies | packages/infra/package.json | @jini-ai/db |  |
| optionalPeerDependencies | packages/capability-providers/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/capability-providers/package.json | ws |  |
| optionalPeerDependencies | packages/capability-providers/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/vibecoding/package.json | react |  |
| optionalPeerDependencies | packages/vibecoding/package.json | parse5 |  |
| optionalPeerDependencies | packages/db/package.json | better-sqlite3 |  |
| optionalPeerDependencies | packages/db/package.json | @electric-sql/pglite |  |
| optionalPeerDependencies | packages/db/package.json | pg |  |
| optionalPeerDependencies | packages/db/package.json | @jini-ai/platform |  |
| optionalPeerDependencies | packages/platform/package.json | hast-util-from-parse5 |  |
| optionalPeerDependencies | packages/platform/package.json | hast-util-to-mdast |  |
| optionalPeerDependencies | packages/platform/package.json | mdast-util-to-markdown |  |
| optionalPeerDependencies | packages/platform/package.json | mdast-util-gfm-table |  |
| optionalPeerDependencies | packages/platform/package.json | parse5 |  |
| optionalPeerDependencies | packages/sandbox/package.json | @e2b/code-interpreter |  |
| unlisted | scripts/__tests__/connection-card.packed.test.ts | express |  |
| unlisted | AI-Dev-Shop/harness-engineering/agent-evals/tdd-evals/benchmark-suite/tdd-eval-2-outcome-matrix/seed-state/tests/components/RiskHoldBanner.test.tsx | @testing-library/react |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | zod |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @hookform/resolvers |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | react-hook-form |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @/components/ui/button |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @/components/ui/form |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @/components/ui/input |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @/components/ui/select |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @/components/ui/textarea |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | @/components/ui/use-toast |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | react |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | @tanstack/react-table |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | lucide-react |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | @/components/ui/button |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | @/components/ui/dropdown-menu |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | @/components/ui/input |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | @/components/ui/table |  |
| unlisted | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | react |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | @/components/ui/button |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | @/components/ui/card |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | @/components/ui/input |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | @/components/ui/label |  |
| unresolved | packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | @/components/ui/tabs |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx | react |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx | remotion |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/__tests__/BubbleScene.test.tsx | react |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/__tests__/BubbleScene.test.tsx | react-dom |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/avatarLibrary.tsx | react |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/avatarLibrary.tsx | remotion |  |
| unlisted | packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/__tests__/avatarLibrary.test.tsx | react |  |
| unlisted | packages/db/src/kernel/kernel-core.ts | interactiveTransactions |  |
| unlisted | packages/db/src/kernel/kernel-core.ts | backup |  |
| unlisted | packages/core/src/__tests__/optional-peer.test.ts | jini-test-absent-peer |  |

### jini: unused exports (in scope) — top 50 of 124, by file

| file | name | line |
|---|---|---|
| packages/server/src/builtin-features.ts | isExecutableDetectedAgent | 189 |
| packages/mcp/src/agent-install/install.ts | ANTIGRAVITY_MCP_CONFIG_SEGMENTS | 179 |
| packages/admin/src/seo/react/pages/SeoPage.tsx | default | 839 |
| packages/admin/src/forms/controllers/field-attributes-dialog.controller.ts | initialFieldAttributesDialogState | 12 |
| packages/admin/src/comments/react/pages/CommentsPage.tsx | default | 42 |
| packages/admin/src/forms/react/pages/FormEditor.tsx | default | 145 |
| packages/admin/src/forms/react/pages/FormsList.tsx | default | 165 |
| packages/admin/src/media/react/pages/MediaPage.tsx | default | 49 |
| packages/admin/src/media/react/tabs/LibraryTab.tsx | LibraryTab | 9 |
| packages/admin/src/security/react/pages/SecurityPage.tsx | SecurityPage | 5 |
| packages/admin/src/security/react/tabs/AccessTokensTab.tsx | AccessTokensTab | 5 |
| packages/admin/src/playground/react/pages/PlaygroundPage.tsx | PlaygroundPage | 6 |
| packages/admin/src/playground/react/tabs/CanvasTab.tsx | CanvasTab | 3 |
| packages/admin/src/source-control/react/pages/SourceControlPage.tsx | SourceControlPage | 6 |
| packages/admin/src/source-control/react/tabs/ProvidersTab.tsx | ProvidersTab | 5 |
| packages/admin/src/agent-plugins/react/pages/AgentPluginsPage.tsx | AgentPluginsPage | 7 |
| packages/admin/src/agent-plugins/react/tabs/InstalledTab.tsx | InstalledTab | 3 |
| packages/admin/src/agent-plugins/react/tabs/DownloadedTab.tsx | DownloadedTab | 3 |
| packages/admin/src/seo/react/hooks/SeoPage.hooks.ts | buildSeoSettingsPatch | 8 |
| packages/admin/src/seo/react/hooks/SeoPage.hooks.ts | resolveSeoTabId | 8 |
| packages/admin/src/seo/react/hooks/SeoModuleTabs.ts | SeoDefaultsModuleTab | 16 |
| packages/admin/src/seo/react/hooks/SeoModuleTabs.ts | SeoSitemapModuleTab | 17 |
| packages/admin/src/seo/react/hooks/SeoModuleTabs.ts | SeoEntriesModuleTab | 18 |
| packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx | widgetInstanceGuard | 19 |
| packages/admin/src/comments/react/hooks/QueueSection.hooks.ts | queueColumns | 35 |
| packages/provider-plugins/src/analytics-posthog/browser.ts | validatePostHogBrowserConfig | 8 |
| packages/provider-plugins/src/observability-opentelemetry/opentelemetry.ts | createInjectedOtlpTraceExporter | 86 |
| packages/provider-plugins/src/payments-stripe/provider.ts | STRIPE_CAPABILITIES | 9 |
| packages/provider-plugins/src/charts-recharts/client/provider.ts | UnsupportedChartSpecError | 2 |
| packages/provider-plugins/src/charts-echarts/descriptor.ts | isEChartsKind | 9 |
| packages/provider-plugins/src/charts-recharts/mount.tsx | UnsupportedChartSpecError | 11 |
| packages/agent-plugins/src/admin-surfaces/descriptor.ts | ADMIN_SURFACE_CSP_DIRECTIVES | 19 |
| packages/agent-plugins/src/admin-surfaces/descriptor.ts | isAllowedAdminSurfaceCspSource | 83 |
| packages/agent-plugins/src/admin-surfaces/delivery-bindings.ts | DELIVERY_BINDING_WITHHELD_MESSAGE | 51 |
| packages/commerce/src/payments/tools/catalog.ts | MAX_ID_LENGTH | 41 |
| packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts | ABOVE_HEADROOM_PX | 5 |
| packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts | MAX_BUBBLE_WIDTH_PX | 9 |
| packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts | EDGE_MARGIN_PX | 12 |
| packages/ui/src/features/admin-widgets/components/ScrollJump/ScrollJump.rules.ts | SCROLL_JUMP_MIN_VIEWPORTS | 2 |
| packages/ui/src/features/admin-widgets/components/ScrollJump/ScrollJump.rules.ts | SCROLL_JUMP_EDGE_SLACK_PX | 5 |
| packages/ui/src/features/html-editor/protected-elements.ts | protectedElementHtml | 17 |
| packages/ui/src/features/i18n/context.tsx | detectInitialLocale | 32 |
| packages/ui/src/features/i18n/context.tsx | resolveSystemLocale | 32 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_ID | 62 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_DE | 63 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_ZH_CN | 64 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_ZH_TW | 65 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_PT_BR | 66 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_RU | 67 |
| packages/ui/src/features/i18n/dictionaries/index.ts | SETTINGS_DIALOG_FA | 68 |

### jini: unused types (in scope) — top 50 of 266, by file

| file | name | line |
|---|---|---|
| packages/admin/src/seo/react/pages/SeoPage.tsx | SeoSectionProps | 84 |
| packages/admin/src/seo/react/pages/SeoPage.tsx | EntryPickerProps | 123 |
| packages/admin/src/seo/react/pages/SeoPage.tsx | SeoEntryPanelProps | 210 |
| packages/admin/src/seo/react/pages/SeoPage.tsx | SeoEntrySectionProps | 470 |
| packages/provider-plugins/src/charts-echarts/descriptor.ts | EChartsKind | 6 |
| packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts | InfoTipLine | 122 |
| packages/ui/src/features/i18n/context.tsx | LocalePersistencePort | 33 |
| packages/ui/src/features/i18n/context.tsx | SystemLocaleDetector | 33 |
| packages/ui/src/features/interactive-ui/providers/shadcn/button.tsx | ButtonProps | 39 |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogSidebar.tsx | TabbedDialogNavTab | 7 |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogSidebar.tsx | TabbedDialogNavItemProps | 9 |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogSidebar.tsx | TabbedDialogSidebarProps | 69 |
| packages/agent-runtime/src/model-discovery-adapters.ts | ProviderCatalogImport | 311 |
| packages/agent-runtime/src/claude-code-models.ts | ClaudeCodePickerCacheParse | 95 |
| packages/agent-runtime/src/claude-code-models.ts | ClaudeCodeModelsOptions | 272 |
| packages/agent-runtime/src/claude-stream.ts | EventSink | 76 |
| packages/agent-runtime/src/claude-stream.ts | BlockState | 81 |
| packages/agent-runtime/src/claude-stream.ts | ArtifactEchoContext | 115 |
| packages/agent-runtime/src/claude-stream.ts | McpServerStatus | 374 |
| packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts | PiImagePayload | 17 |
| packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts | PiRpcParams | 23 |
| packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts | PiSessionFileSnapshot | 94 |
| packages/vibecoding/src/node/store.ts | ManifestFile | 8 |
| packages/vibecoding/src/node/store.ts | Manifest | 9 |
| packages/db/src/testing/postgres-database.ts | PostgresDatabaseHelpers | 13 |
| packages/chat/src/core/util/markdown-context.ts | FencedCodeRange | 154 |
| packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts | AttachmentPreviewStatus | 45 |
| packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts | AttachmentTextPreview | 143 |
| packages/chat/src/react/components/SentAttachment.hooks.ts | SentAttachmentThumbnail | 41 |
| packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts | UseAgentRuntimePickerOptions | 169 |
| packages/devops/src/checks/hardwiring.ts | RuntimeImport | 12 |
| packages/user-management/src/server/agent-tool-registrations.ts | ValidatedIdentityInput | 199 |
| packages/user-management/src/admin/react/hooks/AuthBinding.hooks.ts | AuthScope | 3 |
| packages/user-management/src/admin/react/hooks/MembersBinding.hooks.ts | MembersScope | 3 |
| packages/user-management/src/admin/react/hooks/RolesBinding.hooks.ts | RolesScope | 3 |
| packages/user-management/src/admin/react/hooks/UsersBinding.hooks.ts | UsersScope | 3 |
| packages/user-management/src/admin/react/hooks/LoginPage.hooks.ts | AuthView | 9 |
| packages/user-management/src/react/users/UserRowParts.tsx | UserNameCellProps | 19 |
| packages/user-management/src/react/users/UserRowParts.tsx | UserStatusCellProps | 58 |
| packages/user-management/src/react/users/UserRowParts.tsx | UserGrantCellsProps | 73 |
| packages/devops/src/static-export/css-urls.ts | CssUrlToken | 2 |
| packages/devops/src/static-export/html-url-locations.ts | HtmlUrlLocation | 6 |
| packages/server/src/compose-jini-kernel.ts | Pack | 425 |
| packages/server/src/kernel-base.ts | ClosableEventLog | 60 |
| packages/mcp/src/server/tool-server.ts | McpDelegatedToolsOptions | 113 |
| packages/mcp/src/federation/approvals/remembered-approval.ts | ApprovalContext | 12 |
| packages/mcp/src/server/tool-result-pages.ts | ToolResultPages | 10 |
| packages/admin/src/media/react/hooks/MediaPorts.hooks.ts | MediaPorts | 4 |
| packages/admin/src/seo/react/hooks/SeoPorts.hooks.ts | SeoPorts | 6 |
| packages/admin/src/seo/models.ts | SeoEntryPanelOptions | 71 |

### jini: unused duplicates (in scope) — top 50 of 25, by file

| file | name | line |
|---|---|---|
| packages/admin/src/seo/react/pages/SeoPage.tsx | Seo = default | 744 |
| packages/admin/src/comments/react/pages/CommentsPage.tsx | CommentsPage = default | 13 |
| packages/admin/src/forms/react/pages/FormEditor.tsx | FormEditor = default | 16 |
| packages/admin/src/forms/react/pages/FormsList.tsx | FormsList = default | 41 |
| packages/admin/src/media/react/pages/MediaPage.tsx | MediaPage = default | 3 |
| packages/admin/src/media/react/tabs/LibraryTab.tsx | LibraryTab = default | 8 |
| packages/admin/src/security/react/pages/SecurityPage.tsx | SecurityPage = default | 4 |
| packages/admin/src/security/react/tabs/AccessTokensTab.tsx | AccessTokensTab = default | 4 |
| packages/admin/src/playground/react/pages/PlaygroundPage.tsx | PlaygroundPage = default | 5 |
| packages/admin/src/playground/react/tabs/CanvasTab.tsx | CanvasTab = default | 2 |
| packages/admin/src/source-control/react/pages/SourceControlPage.tsx | SourceControlPage = default | 5 |
| packages/admin/src/source-control/react/tabs/ProvidersTab.tsx | ProvidersTab = default | 4 |
| packages/admin/src/agent-plugins/react/pages/AgentPluginsPage.tsx | AgentPluginsPage = default | 6 |
| packages/admin/src/agent-plugins/react/tabs/InstalledTab.tsx | InstalledTab = default | 2 |
| packages/admin/src/agent-plugins/react/tabs/DownloadedTab.tsx | DownloadedTab = default | 2 |
| packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx | WidgetInstanceEditor = default | 30 |
| packages/admin/src/agent-plugins/react/tabs/MarketplaceTab.tsx | MarketplaceTab = default | 4 |
| packages/admin/src/media/react/tabs/ProvidersTab.tsx | ProvidersTab = default | 4 |
| packages/admin/src/security/react/tabs/RootKeyTab.tsx | RootKeyTab = default | 13 |
| packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx | WidgetsLibrary = default | 32 |
| packages/admin/src/widgets/react/pages/WidgetRegions.tsx | WidgetRegions = default | 23 |
| packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx | WidgetRegionEditor = default | 27 |
| packages/ui/src/features/charts/wire.ts | rechartsBarChartPropsSchema = rechartsLineChartPropsSchema | 8 |
| packages/agentic/src/core/a2ui/common-types.ts | ComponentIdSchema = ChildSchema | 24 |
| packages/chat/src/core/todos.ts | latestTodoWriteInputFromMessages = latestTodoWriteInput | 123 |

## 4. Import cycles — top 50 of 181 rows (`cycles.tsv` lists every one)

Kinds: `cycle-path` = one dependency-cruiser `no-circular` violation path; `module-scc` = strongly-connected component of files; `*-runtime` = same with `import type` edges removed; `feature-scc`/`feature-pair` = Tovu `apps/{website,admin}/src/features/<f>` collapsed; `package-*` = Jini packages via `@jini-ai/*` specifiers.

| repo | kind | id / run | size | edge types | members / path |
|---|---|---|---|---|---|
| tovu | feature-scc-runtime | frscc-1 | 24 | runtime-imports-only | website:api-connections \| website:consent \| website:content-types \| website:custom-credentials \| website:deployments \| website:entries \| website:form-destinations \| website:media \| website:media-import \| website:navigation \| website:post \| website:project-keys \| website:publish-content \| website:publish-trust \| website:redirects \| website:settings \| website:site-backup \| website:site-export \| website:site-inspection \| website:source-control \| website:taxonomy \| website:theme \| website:trash \| website:widgets |
| tovu | feature-scc-runtime | frscc-2 | 3 | runtime-imports-only | admin:pages \| admin:posts \| admin:themes |
| tovu | feature-scc-runtime | frscc-3 | 2 | runtime-imports-only | admin:dashboard \| admin:publish-content |
| tovu | feature-scc | fscc-1 | 32 | feature-level | website:agent-plugins \| website:api-connections \| website:consent \| website:content-types \| website:custom-credentials \| website:deployments \| website:email-templates \| website:entries \| website:external-mcp \| website:form-destinations \| website:media \| website:media-import \| website:member-login \| website:members \| website:navigation \| website:pages \| website:post \| website:project-keys \| website:publish-content \| website:publish-trust \| website:redirects \| website:settings \| website:site-backup \| website:site-export \| website:site-guide \| website:site-inspection \| website:source-control \| website:taxonomy \| website:theme \| website:trash \| website:vendor-credentials \| website:widgets |
| tovu | feature-scc | fscc-2 | 3 | feature-level | admin:pages \| admin:posts \| admin:themes |
| tovu | feature-scc | fscc-3 | 2 | feature-level | website:database \| website:recovery |
| tovu | feature-scc | fscc-4 | 2 | feature-level | admin:dashboard \| admin:publish-content |
| jini | module-scc-runtime | rscc-1 | 2 | runtime-edges-only | packages/admin/src/comments/react/components/QueueSection.tsx \| packages/admin/src/comments/react/hooks/QueueSection.hooks.ts |
| jini | module-scc-runtime | rscc-2 | 2 | runtime-edges-only | packages/cms/src/forms/errors.ts \| packages/cms/src/forms/stale-form.ts |
| tovu | module-scc | scc-1 | 15 | incl-type-only | apps/website/src/features/agent-plugins/bundled-contribution-sources.ts \| apps/website/src/features/agent-plugins/layout.ts \| apps/website/src/features/agent-plugins/lifecycle.ts \| apps/website/src/features/agent-plugins/memory.ts \| apps/website/src/features/agent-plugins/service-ports.ts \| apps/website/src/features/agent-plugins/supersession.ts \| apps/website/src/features/api-connections/byo-client.ts \| apps/website/src/features/api-connections/connect.ts \| apps/website/src/features/api-connections/contribution.ts \| apps/website/src/features/api-connections/host-bindings.ts \| apps/website/src/features/api-connections/host.ts \| apps/website/src/features/api-connections/shared-api.ts \| apps/w …(see cycles.tsv) |
| jini | module-scc | scc-1 | 8 | incl-type-only | packages/admin/src/forms/react/components/FieldAttributesDialog.tsx \| packages/admin/src/forms/react/components/FieldSettingsRows.tsx \| packages/admin/src/forms/react/components/FieldSettingsSection.tsx \| packages/admin/src/forms/react/components/FormEditorFieldsBody.tsx \| packages/admin/src/forms/react/components/FormEditorFieldsBodyParts.tsx \| packages/admin/src/forms/react/components/FormFieldsEditor.tsx \| packages/admin/src/forms/react/components/FormProviderSettings.tsx \| packages/admin/src/forms/react/hooks/forms-view.hooks.ts |
| jini | module-scc | scc-2 | 7 | incl-type-only | packages/cms/src/core/form-schema.ts \| packages/cms/src/forms/descriptor-rules.ts \| packages/cms/src/forms/field-registry.ts \| packages/cms/src/forms/forms.ts \| packages/cms/src/forms/portable-validation.ts \| packages/cms/src/forms/submission-evidence.ts \| packages/cms/src/forms/types.ts |
| jini | module-scc | scc-3 | 5 | incl-type-only | packages/core/src/contracts/mail.ts \| packages/core/src/contracts/mail/adapter-module.ts \| packages/core/src/contracts/mail/engine-contracts.ts \| packages/core/src/contracts/mail/ports.ts \| packages/core/src/contracts/mail/provider.ts |
| tovu | module-scc | scc-2 | 4 | incl-type-only | apps/desktop/src/desktop-agent-service.ts \| apps/desktop/src/site-dir-store.ts \| apps/desktop/src/startup-env.ts \| apps/desktop/src/tovu-server.ts |
| jini | module-scc | scc-4 | 4 | incl-type-only | packages/core/src/contracts/vault.ts \| packages/core/src/contracts/vault/ports.ts \| packages/core/src/contracts/vault/records.ts \| packages/core/src/contracts/vault/vendor-credential-sets.ts |
| tovu | module-scc | scc-3 | 3 | incl-type-only | apps/website/src/features/plugin-runtime/agent-plugin-tool-binding.ts \| apps/website/src/features/plugin-runtime/host-tool-binding.ts \| apps/website/src/features/plugin-runtime/tool-registrations.ts |
| tovu | module-scc | scc-4 | 3 | incl-type-only | apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts \| apps/admin/src/features/pages/lib/theme-page-publish-state.ts \| apps/admin/src/features/pages/rules.ts |
| jini | module-scc | scc-5 | 3 | incl-type-only | packages/admin/src/consent/react/ConsentFields.tsx \| packages/admin/src/consent/react/ConsentSettingsPanel.tsx \| packages/admin/src/consent/react/settings-panel.hooks.ts |
| jini | module-scc | scc-6 | 3 | incl-type-only | packages/admin/src/react/OverlayHost.hooks.ts \| packages/admin/src/react/OverlayHost.tsx \| packages/admin/src/react/overlays.ts |
| jini | module-scc | scc-7 | 3 | incl-type-only | packages/agentic/src/skills/install/github.ts \| packages/agentic/src/skills/install/ports.ts \| packages/agentic/src/skills/install/validation.ts |
| jini | module-scc | scc-8 | 3 | incl-type-only | packages/analytics/src/product/ai-generations.ts \| packages/analytics/src/product/fanout.ts \| packages/analytics/src/product/index.ts |
| jini | module-scc | scc-9 | 3 | incl-type-only | packages/chat/src/react/components/AttachmentGallery.hooks.ts \| packages/chat/src/react/components/AttachmentGallery.rules.ts \| packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts |
| jini | module-scc | scc-10 | 3 | incl-type-only | packages/core/src/contracts/oauth.ts \| packages/core/src/contracts/oauth/details.ts \| packages/core/src/contracts/oauth/flow.ts |
| jini | module-scc | scc-11 | 3 | incl-type-only | packages/ui/src/features/media-providers/react/components/MediaProviderCard.tsx \| packages/ui/src/features/media-providers/react/components/MediaProvidersTab.tsx \| packages/ui/src/features/media-providers/react/components/media-providers-tab-labels.ts |
| tovu | module-scc | scc-5 | 2 | incl-type-only | apps/website/src/features/agent-plugins/connect-sign-in-wait.ts \| apps/website/src/features/agent-plugins/connect-tool.ts |
| tovu | module-scc | scc-6 | 2 | incl-type-only | apps/website/src/features/agent-plugins/customize-tool.ts \| apps/website/src/features/agent-plugins/install-tool.ts |
| tovu | module-scc | scc-7 | 2 | incl-type-only | apps/website/src/features/plugin-runtime/install-tool-binding.ts \| apps/website/src/features/plugin-runtime/install-tool.ts |
| tovu | module-scc | scc-8 | 2 | incl-type-only | apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx \| apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx |
| tovu | module-scc | scc-9 | 2 | incl-type-only | apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts \| apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx |
| jini | module-scc | scc-12 | 2 | incl-type-only | packages/admin/src/comments/react/components/QueueSection.tsx \| packages/admin/src/comments/react/hooks/QueueSection.hooks.ts |
| jini | module-scc | scc-13 | 2 | incl-type-only | packages/admin/src/comments/react/components/SettingsSection.tsx \| packages/admin/src/comments/react/hooks/SettingsSection.hooks.ts |
| jini | module-scc | scc-14 | 2 | incl-type-only | packages/admin/src/comments/react/hooks/CommentsPage.hooks.ts \| packages/admin/src/comments/react/pages/CommentsPage.tsx |
| jini | module-scc | scc-15 | 2 | incl-type-only | packages/admin/src/seo/models.ts \| packages/admin/src/seo/rules.ts |
| jini | module-scc | scc-16 | 2 | incl-type-only | packages/agent-plugins/src/admin-surfaces/protocol.ts \| packages/agent-plugins/src/admin-surfaces/theme.ts |
| jini | module-scc | scc-17 | 2 | incl-type-only | packages/agent-plugins/src/lifecycle/search-projection.ts \| packages/agent-plugins/src/lifecycle/search.ts |
| jini | module-scc | scc-18 | 2 | incl-type-only | packages/agentic/src/core/dom/model-context.ts \| packages/agentic/src/core/dom/native-model-context.ts |
| jini | module-scc | scc-19 | 2 | incl-type-only | packages/chat/src/embed-widget/react/header.hooks.ts \| packages/chat/src/embed-widget/react/header.tsx |
| jini | module-scc | scc-20 | 2 | incl-type-only | packages/chat/src/react/components/ConversationList.hooks.ts \| packages/chat/src/react/components/ConversationList.tsx |
| jini | module-scc | scc-21 | 2 | incl-type-only | packages/cms/src/forms/errors.ts \| packages/cms/src/forms/stale-form.ts |
| jini | module-scc | scc-22 | 2 | incl-type-only | packages/cms/src/forms/ports.ts \| packages/cms/src/forms/write-service.ts |
| jini | module-scc | scc-23 | 2 | incl-type-only | packages/cms/src/navigation/menu-service.ts \| packages/cms/src/navigation/repo.memory.ts |
| jini | module-scc | scc-24 | 2 | incl-type-only | packages/cms/src/taxonomy/list.ts \| packages/cms/src/taxonomy/write-service.ts |
| jini | module-scc | scc-25 | 2 | incl-type-only | packages/cms/src/widgets/html/html-embeds.ts \| packages/cms/src/widgets/html/plugin-export.ts |
| jini | module-scc | scc-26 | 2 | incl-type-only | packages/commerce/src/payments/ops/intent-recovery.ts \| packages/commerce/src/payments/ops/reconcile-snapshot.ts |
| jini | module-scc | scc-27 | 2 | incl-type-only | packages/core/src/settings/agent-value-write-tools.ts \| packages/core/src/settings/tool-registrations.ts |
| jini | module-scc | scc-28 | 2 | incl-type-only | packages/daemon/src/http/research-tavily.adapter.ts \| packages/daemon/src/http/research.ts |
| jini | module-scc | scc-29 | 2 | incl-type-only | packages/integrations/src/media-providers/task-lifecycle.ts \| packages/integrations/src/media-providers/task-store.ts |
| jini | module-scc | scc-30 | 2 | incl-type-only | packages/mcp/src/federation/messages.ts \| packages/mcp/src/federation/trust.ts |
| jini | module-scc | scc-31 | 2 | incl-type-only | packages/mcp/src/federation/approvals/revocation-reason.ts \| packages/mcp/src/federation/approvals/revocation.ts |
| jini | module-scc | scc-32 | 2 | incl-type-only | packages/plugins/src/host/contributions.ts \| packages/plugins/src/host/ports.ts |

## 5. Argument rule — top 50 of 14009 violations by parameter count (`args.tsv` has all 14009 violations + unsure rows)

| repo | file | function | line | params | exported | why |
|---|---|---|---|---|---|---|
| tovu | apps/website/src/server/inbound/public-http/routes/site/pages.ts | renderViaTemplate | 1562 | 9 | yes | >2 params |
| jini | packages/agent-plugins/github/source-control/commit-site.mjs | buildTree | 286 | 8 | no | >2 params |
| tovu | apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | primaryLabelFor | 251 | 7 | no | >2 params |
| jini | packages/cms/src/seo/seo.ts | buildOpenGraph | 223 | 7 | no | >2 params |
| jini | packages/daemon/src/agent-executor/codex/home-staging.ts | prepareCodexHomeForRun | 151 | 7 | no | >2 params |
| jini | packages/daemon/src/routines/schedule.ts | matchesWallClock | 133 | 7 | no | >2 params |
| jini | packages/devops/src/checks/published-types/index.ts | checkCompile | 157 | 7 | no | >2 params |
| jini | scripts/check-subpath-isolation.ts | appendExportTarget | 125 | 7 | no | >2 params |
| tovu | apps/website/src/server/inbound/public-http/routes/site/pages.ts | resolveMarketingPageOrOverride | 1971 | 6 | yes | >2 params |
| tovu | apps/website/src/server/inbound/public-http/routes/site/pages.ts | renderTemplateBranchIfEligible | 2134 | 6 | yes | >2 params |
| jini | packages/ui/src/features/html-editor/react/hooks/useInteractiveHtmlEditor.ts | useInteractiveHtmlEditor | 272 | 6 | yes | >2 params |
| jini | packages/ui/src/renderers/annotation-canvas/drawing.ts | compositeMarksOntoCanvas | 151 | 6 | yes | >2 params |
| tovu | apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | applySavedPage | 477 | 6 | no | >2 params |
| tovu | apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | applySaveFailure | 592 | 6 | no | >2 params |
| tovu | apps/admin/src/features/roles/hooks/use-roles.hooks.ts | runRowDelete | 175 | 6 | no | >2 params |
| tovu | apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts | runGuardedDelete | 135 | 6 | no | >2 params |
| tovu | apps/website/src/assistant/byok-tool-surface.ts | runExecuteDelegatedTool | 359 | 6 | no | >2 params |
| tovu | apps/website/src/assistant/byok-tool-surface.ts | executeMetaTool | 732 | 6 | no | >2 params |
| tovu | apps/website/src/features/deployments/static-publish/adapter.ts | publishAndMapOutcome | 463 | 6 | no | >2 params |
| tovu | apps/website/src/features/deployments/static-publish/publish-run.ts | recordHistoryIfPublished | 152 | 6 | no | >2 params |
| tovu | apps/website/src/features/member-login/link-service.ts | activateAndLink | 84 | 6 | no | >2 params |
| tovu | apps/website/src/features/navigation/import-menu.ts | rebindLocation | 100 | 6 | no | >2 params |
| tovu | apps/website/src/features/theme/build-conformance.ts | visitGeneratedTreeEntry | 294 | 6 | no | >2 params |
| tovu | apps/website/src/features/theme/theme-files.ts | writeFileAtomically | 609 | 6 | no | >2 params |
| tovu | apps/website/src/platform/db/repos/media-repo.ts | retireSlug | 152 | 6 | no | >2 params |
| tovu | apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts | placeIntoRegion | 44 | 6 | no | >2 params |
| tovu | apps/website/src/server/inbound/public-http/http/site/render.ts | renderStaticTierHomePage | 3578 | 6 | no | >2 params |
| tovu | apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts | sendMediaRenditionResult | 541 | 6 | no | >2 params |
| tovu | apps/website/src/server/runtime/composition/modules/site-assistant.ts | runSiteAssistantPreflight | 553 | 6 | no | >2 params |
| tovu | apps/website/src/server/runtime/configuration/seed.ts | seededPost | 96 | 6 | no | >2 params |
| jini | packages/agent-plugins/github/source-control/commit-site.mjs | writeRef | 318 | 6 | no | >2 params |
| jini | packages/agent-plugins/github/source-control/commit-site.mjs | resolveCommitPrerequisites | 338 | 6 | no | >2 params |
| jini | packages/agent-plugins/github-pages/targets/github-pages.mjs | createGitHubCommit | 290 | 6 | no | >2 params |
| jini | packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs | runAction | 268 | 6 | no | >2 params |
| jini | packages/chat/src/react/features/chat-pane/components/ChatPane.tsx | resolveRuntimeAccessView | 80 | 6 | no | >2 params |
| jini | packages/cms/src/seo/seo.ts | resolveShareImages | 177 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/embed-service.ts | writeHostBody | 326 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/embed-service.ts | writePostHostBody | 377 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/resolver-service.ts | resolveWidgetInstances | 192 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/resolver-service.ts | buildMediaImageIr | 658 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/resolver-service.ts | resolveOneMediaEmbed | 748 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/resolvers/recent-entries.ts | resolveLegacyInstances | 161 | 6 | no | >2 params |
| jini | packages/cms/src/widgets/resolvers/recent-entries.ts | resolveCollectionInstance | 204 | 6 | no | >2 params |
| jini | packages/db/src/data-modules/data-module.ts | recordMigration | 702 | 6 | no | >2 params |
| jini | packages/db/src/data-modules/data-module.ts | applyIndexAdd | 819 | 6 | no | >2 params |
| jini | packages/db/src/data-modules/data-module.ts | applyIndexRecreate | 837 | 6 | no | >2 params |
| jini | packages/db/src/transfer/copy-engine.ts | copyScript | 254 | 6 | no | >2 params |
| jini | packages/integrations/src/api-connections/finish-authorization.ts | stageSwitch | 114 | 6 | no | >2 params |
| jini | packages/mcp/src/federation/hosted/store.ts | resolveStdioTarget | 558 | 6 | no | >2 params |
| jini | packages/mcp/src/federation/stdio/default-connect.ts | connectMcpStdioSessionWithSpawnTimeout | 76 | 6 | no | >2 params |

## 6. Type-safety escapes — top 50 of 940 files (`typesafety.tsv` lists every hit with line)

| repo | file | any | non-null ! | ts-ignore/expect-error/nocheck | eslint-disable | total |
|---|---|---|---|---|---|---|
| jini | packages/chat/src/react/components/Markdown.tsx | 0 | 37 | 0 | 0 | 37 |
| jini | packages/user-management/src/admin/conformance/index.ts | 0 | 26 | 0 | 0 | 26 |
| jini | packages/platform/src/net/endpoint-policy.ts | 0 | 19 | 0 | 0 | 19 |
| jini | packages/infra/src/events/outbox/fenced-conformance.ts | 0 | 18 | 0 | 0 | 18 |
| tovu | apps/desktop/src/project-ipc.ts | 3 | 14 | 0 | 0 | 17 |
| jini | packages/platform/src/web/html-to-markdown.ts | 0 | 17 | 0 | 0 | 17 |
| tovu | apps/website/src/features/source-control/credential-setup.ts | 0 | 16 | 0 | 0 | 16 |
| jini | packages/cookie-consent/src/render/css-parser.ts | 0 | 15 | 0 | 0 | 15 |
| jini | packages/daemon/src/http/connectors.ts | 0 | 14 | 0 | 1 | 15 |
| tovu | apps/website/src/features/theme/visitor-publication.ts | 0 | 14 | 0 | 0 | 14 |
| tovu | apps/desktop/src/tovu-server.ts | 0 | 12 | 0 | 0 | 12 |
| tovu | apps/website/src/features/site-backup/archive-manifest.ts | 12 | 0 | 0 | 0 | 12 |
| jini | packages/ui/src/features/html-editor/editor-blocks.ts | 0 | 12 | 0 | 0 | 12 |
| tovu | apps/admin/src/features/deployment/StaticSiteTab.tsx | 0 | 11 | 0 | 0 | 11 |
| tovu | apps/website/src/features/deployments/publish-credentials/store.ts | 0 | 11 | 0 | 0 | 11 |
| jini | packages/devops/src/static-export/html-url-locations.ts | 0 | 11 | 0 | 0 | 11 |
| jini | packages/search/src/digest.ts | 0 | 11 | 0 | 0 | 11 |
| tovu | apps/desktop/src/renderer/source-test-harness.ts | 10 | 0 | 0 | 0 | 10 |
| tovu | apps/website/src/features/publish-content/apply-loop.ts | 0 | 10 | 0 | 0 | 10 |
| jini | packages/analytics/src/ingest.ts | 0 | 10 | 0 | 0 | 10 |
| jini | packages/cms/src/media/content-type-sniffer.ts | 0 | 10 | 0 | 0 | 10 |
| jini | packages/cms/src/media/document-ingress.ts | 0 | 10 | 0 | 0 | 10 |
| jini | packages/cookie-consent/src/node/index.ts | 0 | 10 | 0 | 0 | 10 |
| jini | packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx | 0 | 10 | 0 | 0 | 10 |
| tovu | apps/website/src/features/site-export/export-html-policy.ts | 0 | 9 | 0 | 0 | 9 |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts | 0 | 9 | 0 | 0 | 9 |
| jini | packages/chat/src/store/sql/store.ts | 2 | 7 | 0 | 0 | 9 |
| jini | packages/commerce/src/browser/checkout.ts | 0 | 9 | 0 | 0 | 9 |
| jini | packages/devops/src/deploy/ops-tools.ts | 0 | 9 | 0 | 0 | 9 |
| jini | packages/diagnostics/src/observability/instrumentation.ts | 5 | 0 | 0 | 4 | 9 |
| jini | packages/integrations/src/media-providers/video-request.ts | 0 | 9 | 0 | 0 | 9 |
| tovu | apps/website/src/features/site-backup/archive-extensions.ts | 0 | 8 | 0 | 0 | 8 |
| tovu | apps/website/src/server/runtime/composition/modules/assistant-chats.ts | 0 | 8 | 0 | 0 | 8 |
| jini | packages/agent-plugins/src/lifecycle/credential-card-metadata.ts | 0 | 8 | 0 | 0 | 8 |
| jini | packages/daemon/src/http/model-proxy.ts | 0 | 6 | 0 | 2 | 8 |
| jini | packages/ui/src/features/lexical-rich-text-editor/mention-parser.ts | 0 | 8 | 0 | 0 | 8 |
| tovu | apps/admin/src/features/consent/use-consent-page.hooks.ts | 0 | 4 | 0 | 3 | 7 |
| tovu | apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts | 0 | 7 | 0 | 0 | 7 |
| tovu | apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts | 0 | 7 | 0 | 0 | 7 |
| tovu | apps/admin/src/features/taxonomy/TermPicker.tsx | 0 | 7 | 0 | 0 | 7 |
| tovu | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 0 | 1 | 6 | 0 | 7 |
| jini | packages/agent-runtime/src/model-discovery-adapters.ts | 0 | 7 | 0 | 0 | 7 |
| jini | packages/core/src/tool-metadata.ts | 0 | 7 | 0 | 0 | 7 |
| jini | packages/devops/src/checks/memory-soak.ts | 0 | 7 | 0 | 0 | 7 |
| jini | packages/devops/src/static-export/transforms.ts | 0 | 7 | 0 | 0 | 7 |
| jini | packages/provider-plugins/src/observability-opentelemetry/index.ts | 0 | 7 | 0 | 0 | 7 |
| jini | packages/registry/src/versioning.ts | 0 | 7 | 0 | 0 | 7 |
| jini | packages/ui/src/features/tab-strip/react/components/TabBar.hooks.tsx | 0 | 7 | 0 | 0 | 7 |
| tovu | apps/desktop/src/desktop-resources.ts | 0 | 6 | 0 | 0 | 6 |
| tovu | apps/website/src/features/deployments/static-publish/domain-publish-tool.ts | 0 | 6 | 0 | 0 | 6 |

### Every `any` / `@ts-*` directive hit (70)

| repo | check | file | line |
|---|---|---|---|
| tovu | other_any | apps/desktop/src/owner-store-cli.ts | 138 |
| tovu | colon_any | apps/desktop/src/project-ipc.ts | 326 |
| tovu | other_any | apps/desktop/src/project-ipc.ts | 326 |
| tovu | colon_any | apps/desktop/src/project-ipc.ts | 326 |
| tovu | colon_any | apps/desktop/src/renderer/source-test-harness.ts | 7 |
| tovu | colon_any | apps/desktop/src/renderer/source-test-harness.ts | 21 |
| tovu | other_any | apps/desktop/src/renderer/source-test-harness.ts | 21 |
| tovu | other_any | apps/desktop/src/renderer/source-test-harness.ts | 24 |
| tovu | as_any | apps/desktop/src/renderer/source-test-harness.ts | 25 |
| tovu | other_any | apps/desktop/src/renderer/source-test-harness.ts | 31 |
| tovu | other_any | apps/desktop/src/renderer/source-test-harness.ts | 32 |
| tovu | colon_any | apps/desktop/src/renderer/source-test-harness.ts | 38 |
| tovu | colon_any | apps/desktop/src/renderer/source-test-harness.ts | 43 |
| tovu | colon_any | apps/desktop/src/renderer/source-test-harness.ts | 50 |
| tovu | colon_any | apps/desktop/src/sites-mcp-tools.ts | 105 |
| tovu | other_any | apps/desktop/src/workspace-chat-ipc.ts | 78 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 60 |
| tovu | other_any | apps/website/src/features/site-backup/archive-manifest.ts | 73 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 90 |
| tovu | other_any | apps/website/src/features/site-backup/archive-manifest.ts | 97 |
| tovu | other_any | apps/website/src/features/site-backup/archive-manifest.ts | 108 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 120 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 130 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 133 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 136 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 139 |
| tovu | colon_any | apps/website/src/features/site-backup/archive-manifest.ts | 151 |
| tovu | as_any | apps/website/src/features/site-backup/archive-manifest.ts | 172 |
| tovu | colon_any | apps/website/src/features/theme/liquid-allowlist.ts | 156 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 124 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 127 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 130 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 132 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 134 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0012_secrets_vault.ts | 137 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts | 31 |
| tovu | ts_ignore | apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts | 35 |
| tovu | colon_any | apps/website/src/server/inbound/public-http/http/site/liquid-render.ts | 57 |
| tovu | colon_any | apps/website/src/server/inbound/public-http/http/site/liquid-render.ts | 61 |
| jini | colon_any | packages/chat/src/store/sql/store.ts | 83 |
| jini | colon_any | packages/chat/src/store/sql/store.ts | 92 |
| jini | ts_expect_error | packages/cms/src/widgets/resolvers/index.ts | 47 |
| jini | ts_expect_error | packages/cms/src/widgets/resolvers/index.ts | 56 |
| jini | other_any | packages/core/src/daemon.ts | 12 |
| jini | other_any | packages/core/src/daemon.ts | 12 |
| jini | other_any | packages/core/src/daemon.ts | 24 |
| jini | other_any | packages/core/src/daemon.ts | 24 |
| jini | other_any | packages/core/src/daemon.ts | 42 |
| jini | other_any | packages/core/src/pack-lifecycle.ts | 17 |
| jini | other_any | packages/core/src/pack-lifecycle.ts | 17 |
| jini | other_any | packages/db/src/core/row-values.ts | 3 |
| jini | colon_any | packages/db/src/core/row-values.ts | 18 |
| jini | other_any | packages/db/src/data-modules/plugin-store.ts | 15 |
| jini | colon_any | packages/diagnostics/src/observability/instrumentation.ts | 60 |
| jini | colon_any | packages/diagnostics/src/observability/instrumentation.ts | 63 |
| jini | colon_any | packages/diagnostics/src/observability/instrumentation.ts | 65 |
| jini | colon_any | packages/diagnostics/src/observability/instrumentation.ts | 128 |
| jini | colon_any | packages/diagnostics/src/observability/instrumentation.ts | 128 |
| jini | other_any | packages/http-kit/src/pack-http.ts | 23 |
| jini | other_any | packages/http-kit/src/pack-http.ts | 23 |
| jini | other_any | packages/integrations/src/media-providers/dispatch/polling-adapter.ts | 69 |
| jini | other_any | packages/mcp/src/server/stdio-hosting.ts | 85 |
| jini | other_any | packages/mcp/src/server/tool-server.ts | 138 |
| jini | other_any | packages/mcp/src/server/tool-server.ts | 138 |
| jini | ts_expect_error | packages/oauth/src/discovery.ts | 7 |
| jini | other_any | packages/server/src/feature.ts | 28 |
| jini | other_any | packages/server/src/feature.ts | 28 |
| jini | other_any | packages/sidecar/src/json-file.ts | 19 |
| jini | other_any | packages/sidecar/src/json-ipc.ts | 398 |
| jini | colon_any | packages/sidecar/src/types.ts | 130 |

## 7. Other

### `await import(` in prod code — all 35

| repo | file | line |
|---|---|---|
| tovu | apps/admin/src/lib/agent-screenshot.ts | 272 |
| tovu | apps/desktop/src/desktop-agent.ts | 216 |
| tovu | apps/desktop/src/desktop-capture.ts | 82 |
| tovu | apps/desktop/src/desktop-mcp-http.ts | 17 |
| tovu | apps/desktop/src/main/index.ts | 468 |
| tovu | apps/desktop/src/renderer/app-render-harness.ts | 45 |
| tovu | apps/desktop/src/renderer/app-render-harness.ts | 47 |
| tovu | apps/desktop/src/renderer/app-render-harness.ts | 48 |
| tovu | apps/website/src/assistant/external-mcp-connection-source.ts | 157 |
| tovu | apps/website/src/cli/program.ts | 72 |
| tovu | apps/website/src/cli/program.ts | 80 |
| tovu | apps/website/src/cli/program.ts | 81 |
| tovu | apps/website/src/features/plugin-runtime/host-binding.ts | 120 |
| tovu | apps/website/src/platform/headless-browser/desktop-render.ts | 15 |
| tovu | apps/website/src/platform/headless-browser/playwright-loader.ts | 9 |
| tovu | apps/website/src/server/inbound/public-http/http/site/render.ts | 3607 |
| tovu | apps/website/src/server/inbound/public-http/http/site/render.ts | 3623 |
| tovu | apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts | 70 |
| tovu | apps/website/src/server/runtime/composition/modules/assistant-tool-access-lowering.ts | 13 |
| tovu | apps/website/src/server/runtime/composition/storage-secret.ts | 105 |
| jini | packages/admin/src/comments/react/index.ts | 28 |
| jini | packages/admin/src/forms/react/index.ts | 27 |
| jini | packages/admin/src/media/react/index.ts | 44 |
| jini | packages/admin/src/media/react/index.ts | 78 |
| jini | packages/admin/src/redirects/react/index.ts | 17 |
| jini | packages/admin/src/seo/react/index.ts | 18 |
| jini | packages/admin/src/seo/react/index.ts | 23 |
| jini | packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts | 143 |
| jini | packages/agent-runtime/src/providers/connection-guard.ts | 263 |
| jini | packages/agent-runtime/src/providers/connection-guard.ts | 264 |
| jini | packages/agent-runtime/src/providers/connection-guard.ts | 381 |
| jini | packages/cli/src/prompt.ts | 109 |
| jini | packages/db/src/owner-store/migrations/0000_owner_store.ts | 36 |
| jini | packages/diagnostics/src/web-evidence/playwright-runtime.ts | 75 |
| jini | packages/user-management/src/react/auth/passkey-browser.ts | 7 |

### Files > 500 lines — top 50 of 276 (`big-files.tsv`)

| repo | file | lines |
|---|---|---|
| tovu | apps/admin/src/features/plugins/plugins-i18n.ts | 4707 |
| tovu | apps/admin/src/lib/api.ts | 4493 |
| tovu | apps/website/src/server/inbound/public-http/http/site/render.ts | 3702 |
| tovu | apps/admin/src/features/themes/themes-i18n.ts | 3656 |
| tovu | apps/admin/src/components/shared-components-i18n.ts | 3450 |
| tovu | apps/admin/src/features/posts/posts-i18n.ts | 3273 |
| tovu | apps/website/src/server/runtime/composition/deps.ts | 3129 |
| tovu | apps/website/src/server/inbound/public-http/routes/site/pages.ts | 3115 |
| tovu | apps/admin/src/features/ai-assistant/ai-assistant-i18n.ts | 2922 |
| tovu | apps/website/src/server/runtime/composition/app.ts | 2680 |
| tovu | apps/website/src/features/post/post.ts | 2610 |
| tovu | apps/admin/src/features/deployment/deployment-i18n.tsx | 2563 |
| tovu | apps/admin/src/features/security/security-i18n.ts | 2409 |
| tovu | apps/website/src/platform/db/schema.sqlite.ts | 2398 |
| tovu | apps/admin/src/features/dashboard/dashboard-i18n.ts | 2218 |
| tovu | apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts | 2197 |
| tovu | apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | 2134 |
| tovu | apps/admin/src/features/posts/PostEditor.tsx | 2105 |
| tovu | apps/admin/src/features/consent/consent-dictionary.ts | 1947 |
| tovu | apps/desktop/src/project-ipc.ts | 1944 |
| tovu | apps/admin/src/features/media/media-i18n.ts | 1889 |
| tovu | apps/website/src/server/routes/types.ts | 1743 |
| tovu | apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | 1722 |
| tovu | apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | 1652 |
| tovu | apps/admin/src/features/seo/seo-i18n.ts | 1608 |
| tovu | apps/admin/src/features/users/users-i18n.ts | 1584 |
| tovu | apps/admin/src/features/media/Media.tsx | 1580 |
| tovu | apps/website/src/features/post/tool-registrations.ts | 1540 |
| tovu | apps/admin/src/features/roles/roles-i18n.ts | 1525 |
| tovu | apps/admin/src/features/themes/ThemeExplore.tsx | 1499 |
| tovu | apps/admin/src/features/pages/pages-i18n.ts | 1462 |
| tovu | apps/admin/src/features/widgets/widgets-i18n.ts | 1450 |
| tovu | apps/admin/src/features/forms/forms-i18n.ts | 1429 |
| tovu | apps/admin/src/features/pages/PageEditor.tsx | 1428 |
| tovu | apps/admin/src/features/deployment/StaticSiteTab.tsx | 1426 |
| tovu | apps/admin/src/lib/admin-nav-i18n.ts | 1407 |
| tovu | apps/admin/src/features/recovery/recovery-i18n.tsx | 1402 |
| tovu | apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | 1395 |
| tovu | apps/website/src/features/theme/static-render.ts | 1393 |
| tovu | apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | 1392 |
| tovu | apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | 1358 |
| tovu | apps/website/src/features/theme/theme-files.ts | 1348 |
| tovu | apps/admin/src/panels.tsx | 1312 |
| tovu | apps/admin/src/features/collections/collections-i18n.ts | 1307 |
| tovu | apps/website/src/server/inbound/admin-http/routes/themes/explore.ts | 1286 |
| tovu | apps/admin/src/features/taxonomy/taxonomy-i18n.ts | 1283 |
| tovu | apps/admin/src/features/menus/menus-i18n.ts | 1273 |
| tovu | apps/admin/src/features/trash/trash-i18n.ts | 1243 |
| tovu | apps/website/src/platform/db/schema.postgres.ts | 1241 |
| tovu | apps/admin/src/App.hooks.ts | 1235 |

### Functions > 80 lines — top 50 of 652 (`long-functions.tsv`)

| repo | file | function | line | lines |
|---|---|---|---|---|
| tovu | apps/website/src/server/runtime/composition/deps.ts | composeSiteRouteDeps | 1047 | 1980 |
| tovu | apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | createSiteScope | 186 | 1466 |
| tovu | apps/website/src/server/runtime/composition/app.ts | createRouteDeps | 466 | 1257 |
| tovu | apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | useThemeExplore | 907 | 801 |
| tovu | apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | usePostEditor | 576 | 800 |
| tovu | apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | usePageEditor | 676 | 690 |
| tovu | apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | onStarted | 668 | 665 |
| tovu | apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | usePublishContentConfirm | 522 | 637 |
| tovu | apps/website/src/server/runtime/composition/app.ts | createApp | 2030 | 578 |
| tovu | apps/admin/src/features/settings/SettingsUi.tsx | SettingsUi | 289 | 505 |
| tovu | apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts | useAccessTokens | 389 | 503 |
| tovu | apps/website/src/features/theme/tool-registrations.ts | buildThemesRegistrations | 562 | 441 |
| tovu | apps/website/src/features/post/tool-registrations.ts | buildPostRegistrations | 903 | 425 |
| tovu | apps/admin/src/features/roles/hooks/use-roles.hooks.ts | useRoles | 208 | 408 |
| tovu | apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts | createAssistantRunFinalizer | 366 | 406 |
| tovu | apps/website/src/features/publish-content/apply-loop.ts | createPublishContentApplyPort | 500 | 402 |
| tovu | apps/website/src/features/publish-content/apply-loop.ts | applyReport | 531 | 369 |
| tovu | apps/admin/src/features/posts/PostEditor.tsx | Toolbar | 205 | 352 |
| tovu | apps/admin/src/components/AssistantDock/AssistantDock.tsx | AssistantDock | 317 | 342 |
| tovu | apps/website/src/server/runtime/composition/tool-catalog-manifest.ts | installFirstPartyToolContributors | 347 | 330 |
| tovu | apps/website/src/server/runtime/composition/modules/assistant-byok.ts | createAssistantByokModule | 510 | 320 |
| tovu | apps/admin/src/features/themes/ThemeExplore.tsx | ThemeExploreContent | 1163 | 316 |
| tovu | apps/admin/src/App.tsx | AdminShell | 578 | 289 |
| tovu | apps/admin/src/features/posts/PostEditor.tsx | PostEditor | 1511 | 285 |
| tovu | apps/website/src/features/trash/table-adapter.ts | createTableTrashAdapter | 76 | 285 |
| tovu | apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts | useVisitorCredentialForm | 409 | 282 |
| tovu | apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts | useCollectionEntryEditor | 103 | 280 |
| tovu | apps/desktop/src/project-ipc.ts | registerSiteIpcHandlers | 1572 | 278 |
| tovu | apps/website/src/server/runtime/composition/commerce.ts | composeCommerce | 65 | 273 |
| tovu | apps/website/src/features/widgets/tool-registrations.ts | buildWidgetsRegistrations | 226 | 267 |
| tovu | apps/website/src/server/inbound/admin-http/dev-auth.ts | registerAuthRoutes | 589 | 265 |
| tovu | apps/desktop/src/renderer/use-find-in-page.hooks.ts | useFindInPage | 427 | 254 |
| tovu | apps/website/src/server/runtime/composition/modules/site-assistant.ts | createSiteAssistantModule | 570 | 254 |
| tovu | apps/website/src/features/taxonomy/tool-registrations.ts | buildTaxonomyRegistrations | 183 | 250 |
| tovu | apps/website/src/platform/site-dir/local-site-supervisor.ts | createLocalSiteSupervisor | 61 | 247 |
| tovu | content/themes/__original-themes__/static/tovu-starter/scripts/main.js | <anonymous> | 1 | 242 |
| tovu | content/themes/__original-themes__/static/tovu-theme/scripts/main.js | <anonymous> | 1 | 242 |
| tovu | content/themes/static/tovu-starter/scripts/main.js | <anonymous> | 1 | 242 |
| tovu | content/themes/static/tovu-theme/scripts/main.js | <anonymous> | 1 | 242 |
| tovu | apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts | registerAdminPublishSiteRoutes | 232 | 240 |
| tovu | apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | useMenuEditor | 191 | 237 |
| tovu | apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | useExecutionConfig | 164 | 235 |
| tovu | apps/admin/src/features/pages/PageEditor.tsx | PageEditor | 728 | 230 |
| tovu | apps/website/src/features/publish-content/apply-loop.ts | applyOneRow | 262 | 228 |
| tovu | apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts | useStaticPublish | 154 | 226 |
| tovu | apps/website/src/cli/commands/serve.ts | serveBootedSite | 269 | 226 |
| tovu | apps/website/src/cli/program.ts | createProgram | 47 | 222 |
| tovu | apps/website/src/features/pages/tool-registrations.ts | buildPagesRegistrations | 525 | 217 |
| tovu | apps/website/src/features/recovery/tool-registrations.ts | buildRecoveryRegistrations | 183 | 217 |
| tovu | apps/website/src/features/theme/publish-content.ts | buildHandler | 603 | 215 |

