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

## Gate status on the tip (`v4/evidence/gates-2d82735a.txt`, Node 22 container; tests on Node 24)
| command | exit | used as |
|---|---|---|
| `typecheck`, `typecheck:tests` | 0, 0 (51 s, 92 s) | plain gate |
| `check:size`, `check:complexity`, `check:errors -- --strict`, `check:hooks` | 0, 0, 0, 0 | plain gate (`check:size` with `SIZE_BASE_REF=<parent>`, as CI) |
| `check:architecture` | **1** (base-red) | parent-relative: `--update` on the clean parent, plain check on the candidate. Proven on the tip: update exit 0, then check exit 0 |
| `check:boundaries` | **14** (feature-ranks 0 problems; depcruise 14 errors, 78 warnings) | feature-ranks plain; depcruise parent-relative with its own `--output-type baseline` / `--ignore-known`. Proven on the tip: ignore-known exit 0 |
| `build:server` | (CI step; run per commit) | plain gate |
| slice test set (70 files, below) | **1** — 360 tests: 352 pass, **8 fail**; 646 s at `--test-concurrency=1` (Node 24.22.3, run as root; inside the 25-min cap) — `v4/evidence/tests-2d82735a.txt` | base-red by name: step 6 passes when its failing tests are exactly the 8 names in the evidence file (the runner's exit 1 is expected; compare names, never counts). This is why every sheet's "Base status" line runs step 6 on the parent at step 1 |

The 8 base-red tests: `serve-command-wiring.unit` ×2, `composition-boot-order.unit` ×2 (one anchors `await publishTrustRevocationStoreFor(kernel)`; the tip writes `({ kernel })`), `agent-plugin-set-enabled.integration` ×2, `index-bind-host-wiring.unit` ×1, `deps-provider-plugin-boot.integration` ×1 (EACCES: root ignores the chmod, so it should pass for a non-root user). None is caused by a deps-split sheet. A sheet stops if any other test turns red, or if one of these 8 fails a different way.

## Order (one commit per sheet; est. tokens = executor budget incl. gate output)
**M1 → M2, M3 → B01…B25 → H1, H2 → L1…L6 → H3, H4 → R.** 39 sheets, all written (`v4/`). Each sheet checks its own range by anchor + sha256 at step 1, so this order lists prerequisites. It is not a freeze:
- M1 runs first. Every later sheet's type rule imports `CreateSiteRouteDepsOverrides` from `./overrides.js`, and B01/B04 import the override resolvers from it.
- M2 and M3 run after M1 (both import it). Every sheet's type rule needs M2's `StoreCloseRegistration`; B18 and L6 import `credentialProject` from M3.
- B01-B25 run after M1-M3, in number order (as written).
- H2 runs before L2, because L2's hash is taken on the text after H2 rewrites `...compositionSharedOAuth()` inside the literal.
- L1-L6 run in number order, because each L test pins the previous run's call as its neighbour.
- H1, H3 and H4 need only the B-sheets. R needs everything: its step-1 hash covers the whole root after all 38 other sheets.

**Parallel groups.** Lanes may *prepare* a group's sheets at the same time, but commits still land one at a time. Each commit does `git pull --rebase` and re-runs steps 5-6 when deps.ts changed, as step 7 says. The groups are {M2, M3}, {B01…B25} (disjoint ranges, range-local hashes), and {H1, H3, H4} running alongside {H2 → L1…L6}. On a rebase, the only manual merge allowed is in deps.ts's import block, keeping both sides' additions and deletions. Any other conflict is STOP. Running everything serially is always correct.

| sheet | tip lines | code | inputs | getters | functions | est. tokens |
|---|---|---|---|---|---|---|
| [M1](v4/M1-overrides.md) overrides | 419-504, 506-521, 523-534, 553-561, 563-571, 762-772 | 46 | – | – | 6 decls | 50k |
| [M2](v4/M2-open-store.md) open-store | 536-551, 653-660, 662-667, 669-722, 724-733, 735-752, 754-760 | 68 | – | – | 7 decls | 55k |
| [M3](v4/M3-provider-identity.md) provider-identity | 846-849, 851-872, 874-885, 887-892, 894-909, 911-929 | 49 | – | – | 6 decls | 55k |
| B01-B25 | table below | | | | | 45-70k each |
| [H1](v4/H1-chat-orphans-project-keys.md) chat-orphans-project-keys | 1045-1060, 1862-1878 | 21 | 13 | 1 | 2 | 50k |
| [H2](v4/H2-shared-oauth-commerce.md) shared-oauth-commerce | 2787-2798, 2802-2813 | 19 | 23 | 0 | 2 | 50k |
| [L1](v4/L1-route-deps-content-chat.md) route-deps-content-chat | 2136-2186, 2187-2208 | 51 | 21 | 0 | 2 | 55k |
| [L2](v4/L2-route-deps-assistant-mcp.md) route-deps-assistant-mcp | 2210-2260, 2261-2282, 2284-2292 | 65 | 47 | 1 | 3 | 70k |
| [L3](v4/L3-route-deps-site-providers.md) route-deps-site-providers | 2294-2355, 2356-2376 (+ helper 573-594) | 57 | 43 | 0 | 2 | 65k |
| [L4](v4/L4-route-deps-members-mail.md) route-deps-members-mail | 2378-2412, 2416-2495 | 67 | 34 | 0 | 2 | 65k |
| [L5](v4/L5-route-deps-comments-plugins.md) route-deps-comments-plugins | 2496-2567, 2568-2645 | 88 | 47 | 1 | 2 | 70k |
| [L6](v4/L6-route-deps-publish-credentials.md) route-deps-publish-credentials | 2646-2704 | 31 | 15 | 1 | 1 | 50k |
| [H3](v4/H3-site-sharing.md) site-sharing (split: 68 → ~28 + ~45) | 2838-2913 | 68 | 17 | 0 | 2 | 65k |
| [H4](v4/H4-site-imports.md) site-imports | 2916-2930 | 12 | 6 | 0 | 1 | 40k |
| [R](v4/R-root-phases.md) root phases (7 phases, 262 typed fields, 112 leftover imports, 1 size-debt row) | whole root | 129 → 49 | – | 14 | 7 | 110k |

Budget: M 160k + B ≈ 1.4M + H 205k + L 375k + R 110k ≈ **2.25M executor tokens**. Ceiling: 70k per sheet, 120k for R.

The L runs leave the 7 spreads and the 5 trailing entries (`mediaGenerationHttpClient` … `staticSiteContext`, 5 code lines) in the root literal; a call for runs of ≤4 one-line entries would save nothing. After all sheets the literal is 26 lines: 12 run calls, 7 spreads, 5 entries, and its 2 frame lines.

B-sheets (written by the previous run; B05, B07, B15, B17, B19, B24 corrected in 4b — see REVISION-4b-REPORT):

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


## Slice test set (every sheet runs exactly these + its own test)
Every `*.test.ts` under `apps/website/src` that calls `createSiteRouteDeps`, minus `*.postgres.test.ts` and `*.unrun.*` (67 files), plus the 9 source readers of `deps.ts` (`external-mcp-oauth-loopback-wiring.unit`, `production-readiness-boot.integration`, `create-sqlite-route-deps-for-workspace.integration`, `serving-app-boot-wiring.unit`, `composition-boot-order.unit`, `chat-orphan-check.integration`, `wiring-identity`, `agent-daemon-import-graph.unit`, `stock-content-dirs.unit`) — 70 distinct files, listed verbatim in each sheet's step 6.
