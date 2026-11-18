# S13 — the literal as ordered runs, the root measured (stages only if needed), debt rows, E3 handoff check

Responsibility: the `routeDeps` literal (`b5fbf2a5` 2131-2714) + the root's final shape (DESIGN §2.2, §2.5). Budget ≤230k. Commits: ≈22. Prerequisites: S12; COMMON §1-§4, §9 (`DS_SHEET=S13`; this sheet replaces §9 rule 2 at its root-shape commit).

| commit | change |
|---|---|
| 1 | `site-deps/route-deps/context.ts`: `export type SiteRootContext` = `{ dbPath, overrides, logger, createApp: typeof createApp, exportSite: typeof exportSite, late: SiteRootLate, … }` + one field per name the literal reads (run `node designs/deps-split/work/literal-keys.cjs . > "$W/literal.tsv"` — the literal is still an object literal, so the census works unchanged — column `reads` + shorthand keys), typed via `ReturnType<…>` / existing types with `import type` only (no runtime import of `app.ts` or the exporter) |
| 2…18 | one run per commit, top to bottom (DESIGN §2.5 first keys; exact breaks from `$W/literal.tsv`, regenerated before each commit): `export function <run>RouteDeps(required: SiteRootContext, _optional = {})` returns that run's entries **verbatim** as `return { … } satisfies Partial<SiteRouteDeps>;` (`SiteRouteDeps = NewsletterRouteDeps & ByokToolSurfaceDeps`). `satisfies` gives every arrow its contextual type, exactly as the literal's declared type does today (e.g. `runExportSite: (options, _optional = {}) => …` stays annotation-free under `strict`), and keeps each run's inferred return type precise. If `typecheck` reports an implicit `any` in a run anyway, annotate that run's return as `Pick<SiteRouteDeps, …its keys…>` — never `any`. Reads become `required.x`; every **self-read** of `routeDeps` becomes `required.late.routeDeps()` inside the same arrow (call time, same TDZ): 8 sites on `b5fbf2a5` (`preferences` 2252, `externalMcpOAuth` 2264, `createSiteApp` 2629, `resolveStorefrontProducts` 2637, `resolveActiveThemeId` 2641, `listPublishedPosts` 2642, `exportSiteBound` 2707, `staticSiteContext` 2708 — the last reads it four times), plus any the S0 base added (`wave3/import-cycle-b-2`; take them from `$W/literal.tsv`). The closure's literal is replaced run by run with `...<run>RouteDeps(ctx)`; the closure builds `ctx` once above it from its local names |
| 19 | `site-deps/route-deps/assemble.ts` `assembleSiteRouteDeps(required: SiteRootContext, _optional = {}): SiteRouteDeps` spreads the runs in order; the closure becomes `const routeDeps = assembleSiteRouteDeps(ctx)` |
| 20 | **Measure the root, then decide stages.** Count `composeSiteRouteDeps`'s code lines with the repository size config and the owner's 50-line warn line (COMMON §6 command, on `deps.ts` only). ≤50: no stage file, done. Over 50: group **adjacent synchronous slice calls with no root statement between them** into `site-deps/stages/<segment>.ts` functions (DESIGN §2.2 table names the segments), one group per commit, stopping as soon as the root is ≤50. Never a stage of stages, never a stage spanning an await, a root cell write, `const kernel = store.content;` or `const storeBound = …`. If grouping alone cannot reach 50, the H2 fallback of DESIGN §2.3 (`setBindSharedApiOAuth` / `markPluginHostReady` callbacks) is the only other move; still over 50 = `STOP-S13-ROOT-SIZE` with the measured number |
| 21 | Debt rows (COMMON §5): `check:size` prints `Delete stale debt entry:` for the `composition/deps.ts` `<file>` row and the `composeSiteRouteDeps#1` row (`size-debt.json:1230-1242` on `b5fbf2a5`, under `.violations`) — delete exactly those entries; `error-gate-debt.json`'s `deps.ts` `catch-reads-error` row (value 2 on `b5fbf2a5`: `readTovuVersion` 598 and the `siteTitleReady.catch` 1181) is transferred to the files that now hold those catches. `check:size` and `check:errors -- --strict` in the §5 block prove the edit; name every removed/transferred row in the report |
| 22 | report |

## Carries
| behaviour (lines on `b5fbf2a5`) | test |
|---|---|
| key order, evaluation order and overwrite precedence: `...agentPluginConnections` (2279), `...compositionConsentOptions(…)` (2289), `...identity` then `principalRepo`/`removeUser`/`isInTrash` (2373-2378), `...resolvedMailer.operations` (2411), and any spread the S0 base adds (`refactor/import-cycle-b` had `...bindCredentialsHostPorts(…)` at the literal's end; `b5fbf2a5` has none) — runs are contiguous and spread in file order | S0 pin 1 (observed keys + `typeof`, **kept**: `Partial`/`Pick` typing cannot see a dropped optional key; `routes/types.ts:1303-1304` shows such keys) and S0 pin 2 (precedence) |
| optional capabilities stay absent when absent: the conditional `...(outboundTestOrigins.length > 0 ? { outboundTestOrigins } : {})` and every `?:` key | S0 pin 1 (the snapshot has no key the base lacks) |
| late self-reads stay late (8 sites + any the base added) | S0 pin 1 (assembly does not throw); the S0 late-contract pins; `site-backup-wiring.integration.test.ts` (calls `staticSiteContext` through the assembled deps) |
| backup/version helpers `resolveSiteBackupSources` + `readTovuVersion` (579-600) and the consent helper `compositionConsentOptions` (2956) **move into the run file that calls them** (single user, COMMON §9 rule 6) — or, if two runs use one, into `route-deps/helpers.ts` imported by both | STOP block; `site-backup-wiring.integration.test.ts`; `site-consent.ports.unit.test.ts` |
| module evaluation order: the exporter and `app.ts` load last; runs receive `createApp`/`exportSite` as context values | STOP block (last four imports of `deps.ts`; no `site-deps` import of them) |
| one logger construction for E3; the 17 production `createConsoleLogger(` calls stay 17 | STOP block |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts
)   # plus SR_TESTS (which holds S0 pins 1 and 2) and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
test -d "$D/site-deps"
find "$D/site-deps" -name '*.ts' -not -path '*__tests__*' > "$W/site-deps-files"
mapfile -t SD < "$W/site-deps-files"
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function": ["error", {"max": 50, "skipBlankLines": true, "skipComments": true, "IIFEs": true}]}' "$D/deps.ts" "${SD[@]}"   # owner's 50 on the root and every slice; file 500 from the config itself
grep -rn 'createConsoleLogger(' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S13-ONE-LOGGER"; exit 1; }
grep -rn --include='*.ts' --exclude='*.test.ts' --exclude-dir=__tests__ 'createConsoleLogger(' apps/website/src > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 17 || { cat "$W/hits"; echo "STOP-S13-LOGGER-COUNT (17 on b5fbf2a5)"; exit 1; }
grep -nE '^import ' "$D/deps.ts" > "$W/imports"
awk 'END { exit NR < 4 }' "$W/imports"
awk '{ l[NR] = $0 } END { for (i = NR - 3; i <= NR; i++) print l[i] }' "$W/imports" | sed 's/^[0-9]*://' > "$W/last4"
printf '%s\n' 'import { exportSite } from "#src/features/site-export/index";' 'import { createApp } from "./app.js";' 'import { siteAppBootWorkByDeps } from "./site-app-boot-work.js";' 'import { startSettingsRegistration } from "./settings-registration.js";' > "$W/last4.expected"
diff "$W/last4.expected" "$W/last4" || { echo "STOP-S13-IMPORT-ORDER"; exit 1; }
grep -rnE "from ['\"](\.\./)+(app|deps|site-app-boot-work|settings-registration)\.js['\"]|features/site-export" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S13-SITE-DEPS-IMPORTS"; exit 1; }
grep -nE '^(export )?(async )?function (resolveSiteBackupSources|readTovuVersion|compositionConsentOptions)\(' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S13-HELPER-LEFT"; exit 1; }
grep -rnE ': any\b|as any\b' "$D/site-deps/route-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S13-IMPLICIT-ANY"; exit 1; }
```
(`import type` lines of `site-deps` naming `typeof createApp`/`typeof exportSite` are type-only and allowed; the import-check pattern matches runtime `from` specifiers of those four modules and any `features/site-export` path — if a type import trips it, write it as `import type { … } from` on its own line and narrow the pattern to non-`type` lines in the same commit, saying so in the report.)

Done when: `deps.ts` and every `site-deps` file pass the size config with the 50-line function rule, all S0 pins and source readers are green, no new architecture/boundaries finding line, the debt rows are gone or transferred. Report "deps.ts unfrozen for H1 step 5 (size-02 steps 6-7)". E3 starts only when INDEX's E3 ready check exits 0 on the merged base after H1 step 5.
