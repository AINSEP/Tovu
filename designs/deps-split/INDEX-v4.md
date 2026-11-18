# deps-split v4 — index

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`, combine-3 + fix), Jini `d37821a4` (same branch name). Measured here: `deps.ts` 3,037 lines, 310 imports (1-415), `composeSiteRouteDeps` 955-2935, 215 root statements (`v4/evidence/root-statements-2d82735a.tsv`), 1,190 code lines in the body, literal 2135-2715 (373 code lines, 260 entries, 7 spreads), 9 root awaits (1033, 1036, 1043, 1065, 1796, 1823, 1845, 1980, 2933).

Read `REVISION-4.md` for why this shape converges. Every sheet is self-contained: anchors, hash, inputs, outputs, imports, readers, test code and the gate are in the sheet. Nothing is carried between sheets; the only order dependency is "the previous sheet's commit is on the branch".

## Setup (once per session; container facts measured on the tip)
```bash
set -euo pipefail
cd ../Jini && pnpm install --frozen-lockfile && pnpm -r build && cd ../Tovu
# npm ci runs workspace "prepare" builds that need the linked Jini; drop them for the install only
for p in packages/*/package.json; do node -e 'const f=process.argv[1],p=require("./"+f);if(p.scripts&&p.scripts.prepare){delete p.scripts.prepare;require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")}' "$p"; done
npm ci --ignore-scripts
git checkout -- packages
JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" npm run link:jini
npm run build -w packages/contracts -w packages/sdk
git diff --quiet
```

## Gate status on the tip (`v4/evidence/gates-2d82735a.txt`, Node 22 container)
| command | exit | used as |
|---|---|---|
| `typecheck`, `typecheck:tests` | 0, 0 (51 s, 92 s) | plain gate |
| `check:size`, `check:complexity`, `check:errors -- --strict`, `check:hooks` | 0, 0, 0, 0 | plain gate (`check:size` with `SIZE_BASE_REF=<parent>`, as CI) |
| `check:architecture` | **1** (base-red) | parent-relative: `--update` on the clean parent, plain check on the candidate. Proven on the tip: update exit 0, then check exit 0 |
| `check:boundaries` | **14** (feature-ranks 0 problems; depcruise 14 errors, 78 warnings) | feature-ranks plain; depcruise parent-relative with its own `--output-type baseline` / `--ignore-known`. Proven on the tip: ignore-known exit 0 |
| `build:server` | (CI step; run per commit) | plain gate |
| slice test set (70 files, below) | recorded in `v4/evidence/gates-2d82735a.txt` when the run finished; S-sheets compare by test name only if it lists failures | plain gate |

## Order (one commit per sheet; est. tokens = executor budget incl. gate output)
| # | sheet | moves (tip lines) | code lines | est. tokens |
|---|---|---|---|---|
| M1 | overrides (`CreateSiteRouteDepsOverrides` 425-504 + `assertOverridesPairedOrAbsent`, `pluginFailureThresholdOverride`, `resolveThemesDirOverride`, `resolveSiteBindingOverride`, `resolveWorkspaceIdOverride` → `site-deps/overrides.ts`; 1 type importer: `__tests__/deps-observability-wiring.integration.test.ts:15`) | module level | ~95 | 60k — **sheet not yet written (next run)** |
| M2 | open-store (`StoreCloseRegistration`, `prepareCompositionStorage`, `openCompositionStore`, `resolveChatDbPath`, owner sweeps → `site-deps/open-store.ts`) | 653-760 | ~75 | 60k — **next run** |
| M3 | provider-identity (`providerPluginBoot`, `composeProviderConfig`, `credentialProject`, `acceptedSiteId`, `siteIdentityFor`, `projectStoreFor` → `site-deps/provider-identity.ts`; importer: `deps-provider-plugin-boot.integration.test.ts:15`) | 847-929 | ~60 | 60k — **next run** |
| B01-B25 | `v4/B*.md` (written, below) | | | 45-70k each |
| L1-Ln | literal runs (contiguous key runs between the 7 spreads, `Pick<…>`-typed) | 2135-2715 | 373 | **next run** |
| H2-H4 | `compositionSharedOAuth`/`compositionCommerce`, `configureSiteSharing` (68 code, split), `configureSiteImports` → module functions with real inputs | 2789-2930 | ~100 | **next run** |
| R | measure root; owner decision if > 50 (REVISION-4 §Open) | | | 20k |

| sheet | tip lines | code | inputs | getters | outputs |
|---|---|---|---|---|---|
| [B01](v4/B01-agent-plugin-bootstrap.md) agent-plugin-bootstrap | 965-990 | 14 | 4 | 2 | 7 |
| [B02](v4/B02-media-storage.md) media-storage | 994-1023 | 17 | 8 | 3 | 7 |
| [B03](v4/B03-store-basics.md) store-basics | 1067-1088 | 9 | 3 | 0 | 5 |
| [B04](v4/B04-plugin-runtime.md) plugin-runtime | 1093-1116 | 16 | 10 | 4 | 1 |
| [B05](v4/B05-identity-settings.md) identity-settings | 1117-1185 | 42 | 7 | 0 | 18 |
| [B06](v4/B06-boot-data.md) boot-data | 1186-1285 | 42 | 7 | 0 | 9 |
| [B07](v4/B07-events-origin.md) events-origin | 1286-1366 | 33 | 3 | 0 | 8 |
| [B08](v4/B08-trash-stores.md) trash-stores | 1367-1391 | 7 | 5 | 0 | 7 |
| [B09](v4/B09-trash-follow-up-hooks.md) trash-follow-up-hooks | 1392-1459 | 62 | 18 | 5 | 1 |
| [B10](v4/B10-trash-adapters.md) trash-adapters | 1460-1516 | 48 | 15 | 4 | 2 |
| [B11](v4/B11-trash-service.md) trash-service | 1517-1547 | 21 | 6 | 1 | 5 |
| [B12](v4/B12-redirects.md) redirects | 1548-1585 | 32 | 10 | 0 | 1 |
| [B13](v4/B13-database-journal.md) database-journal | 1586-1615 | 12 | 5 | 0 | 6 |
| [B14](v4/B14-content-repos.md) content-repos | 1616-1637 | 9 | 3 | 0 | 9 |
| [B15](v4/B15-content-resolvers-comments.md) content-resolvers-comments | 1639-1694 | 39 | 24 | 5 | 5 |
| [B16](v4/B16-site-keys-members.md) site-keys-members | 1695-1790 | 13 | 3 | 0 | 8 |
| [B17](v4/B17-assistant-credentials.md) assistant-credentials | 1800-1822 | 6 | 5 | 0 | 5 |
| [B18](v4/B18-provider-config.md) provider-config | 1826-1844 | 9 | 5 | 0 | 2 |
| [B19](v4/B19-mail-http.md) mail-http | 1892-1958 | 31 | 16 | 0 | 7 |
| [B20](v4/B20-content-stores.md) content-stores | 1959-1979 | 4 | 1 | 0 | 4 |
| [B21](v4/B21-publishing-stores-themes.md) publishing-stores-themes | 1981-2013 | 17 | 9 | 0 | 8 |
| [B22](v4/B22-publish-apply.md) publish-apply | 2014-2077 | 58 | 36 | 0 | 1 |
| [B23](v4/B23-outbound-connections.md) outbound-connections | 2078-2113 | 23 | 17 | 0 | 4 |
| [B24](v4/B24-pre-assembly.md) pre-assembly | 2115-2134 | 16 | 18 | 1 | 8 |
| [B25](v4/B25-after-assembly-forms-search.md) after-assembly-forms-search | 2717-2785 | 44 | 21 | 0 | 1 |

B-sheet budget: 25 × ~55k ≈ 1.4M executor tokens (ceiling 70k each; the largest are B09, B15, B22). Run strictly in order: B01 needs M1; B18 needs M3; every sheet's type rule needs M1 (`overrides`) and M2 (`StoreCloseRegistration`).

## Slice test set (every sheet runs exactly these + its own test)
Every `*.test.ts` under `apps/website/src` that calls `createSiteRouteDeps`, minus `*.postgres.test.ts` and `*.unrun.*` (67 files), plus the 9 source readers of `deps.ts` (`external-mcp-oauth-loopback-wiring.unit`, `production-readiness-boot.integration`, `create-sqlite-route-deps-for-workspace.integration`, `serving-app-boot-wiring.unit`, `composition-boot-order.unit`, `chat-orphan-check.integration`, `wiring-identity`, `agent-daemon-import-graph.unit`, `stock-content-dirs.unit`) — 70 distinct files, listed verbatim in each sheet's step 6.
