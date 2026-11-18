# S13 — the literal as ordered runs, stage objects, root ≤50, debt rows, E3 handoff check

Responsibility: statement 183 (`f0613d9e` 2134-2714) + the root's final shape (DESIGN §2.2, §2.5). Budget ≤240k. Commits: ≈20.
Prerequisites: S12. COMMON §2, §3, §9 (this sheet replaces §9 rule 2 at commit 3).
```bash
node designs/deps-split/work/literal-keys.cjs . | head -1   # STOP if the property count is not 260 (or report the delta and its commit)
```

| commit | change |
|---|---|
| 1 | `site-deps/route-deps/context.ts`: `export type SiteRootContext` = `{ dbPath, overrides, logger, createApp: typeof createApp, exportSite: typeof exportSite, late: SiteRootLate }` + one field per name the literal reads (from `work/literal-keys.tsv` column 4 and shorthand keys), typed `ReturnType<…>`/existing types (`import type` only) |
| 2…18 | one run per commit, top to bottom (DESIGN §2.5 first keys; exact lines from the refreshed `literal-keys.tsv` break column): `export function <run>RouteDeps(required: SiteRootContext, _optional = {})` returns that run's properties **verbatim**, reads as `required.x`; the closure literal is replaced run by run with `...<run>RouteDeps(ctx)` (the closure builds `ctx` once, above the literal, from its local names). `export-site-app` uses `required.createApp`/`required.exportSite`; nothing under `site-deps/` imports `app.ts` or `features/site-export` |
| 19 | `route-deps/assemble.ts` `assembleSiteRouteDeps(required: SiteRootContext, _optional = {}): NewsletterRouteDeps & ByokToolSurfaceDeps` spreads the runs in order; the closure becomes `const routeDeps = assembleSiteRouteDeps(ctx)` |
| 20 | Root shape (replaces COMMON §9 rule 2): stage results stop being destructured; the root holds `foundation`, `bootData`, … objects and passes them to later stages and to `ctx`; late getters become `() => publishing.mediaRepo` etc. (DESIGN §2.2). Root ≤50 code lines; if not, apply the fallback in DESIGN §2.3 (H2 lines into the connections stage with `setBindSharedApiOAuth`) — no other fallback |
| 21 | debt rows: run `npm run check:size`; the `deps.ts` `<file>` and `composeSiteRouteDeps#1` rows are now stale — remove them with the script's own mechanism (COMMON §7); `error-gate-debt.json:2238` (`catch-reads-error` 2) follows the two catches to their new files only through `npm run check:errors`' own update path; if it has none, STOP and report |
| 22 | refresh all `work/*.tsv`; report |

## STOP
```bash
D=apps/website/src/server/runtime/composition
npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs $D/deps.ts $(find $D/site-deps -name '*.ts' -not -path '*__tests__*') || echo "STOP: owner limits"
test "$(grep -rn 'createConsoleLogger(' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "STOP: E3 handoff — exactly one logger construction (deps.ts) expected"
grep -n 'import { createApp }\|import { exportSite }' $D/deps.ts | tail -2; tail -n +1 $D/deps.ts | grep -n '^import' | tail -1   # the two must be the last import lines (DESIGN R5)
```
(Read the third command's output: the last `^import` line number must be one of the two printed lines; otherwise STOP.)
Gates: COMMON §5 (now **without** the `deps.ts` exemption) + the S0 shape snapshot unchanged + the wide test run (`server/__tests__/{unit,integration,routes}`) compared with `fail-wide.txt`.

Done when: `wc -l deps.ts` ≤ 500 code lines (eslint `max-lines` passes), every file passes the limits config, all S0 pins and source readers green, no new gate line vs base. Then H1 step 4 is done; report "deps.ts unfrozen for H1 step 5 (size-02 steps 4-7)".
