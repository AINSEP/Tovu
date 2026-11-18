# S13 — the literal as ordered runs, the root's final shape, debt rows, E3 handoff check

Responsibility: the `routeDeps` literal (`f0613d9e` 2131-2714) + the root's final shape (DESIGN §2.2, §2.5). Budget ≤240k. Commits: ≈23. Prerequisites: S12; COMMON §1-§3, §9 (`DS_SHEET=S13`; this sheet replaces §9 rule 2 at commit 21).

| commit | change |
|---|---|
| 1 | **Census first.** `work/literal-keys.cjs` learns the post-split shape: if `routeDeps`' initializer is an object literal → today's output; if it is a call `assembleSiteRouteDeps(…)` → read `site-deps/route-deps/assemble.ts`, follow its spreads in order into each run function's returned object literal, and emit the same columns (key, form, reads, break-before) with `file:line`. Plus the write rows from `deps.ts` **and** `site-deps/**`. Proof: on the unmodified S12 tree the new script's output equals the committed TSV byte for byte (`gates.sh facts`) |
| 2 | `site-deps/route-deps/context.ts`: `export type SiteRootContext` = `{ dbPath, overrides, logger, createApp: typeof createApp, exportSite: typeof exportSite, late: SiteRootLate, … }` + one field per name the literal reads (TSV column `reads` + shorthand keys), typed via `ReturnType<…>` / existing types with `import type` only (no runtime import of `app.ts` or the exporter) |
| 3…19 | one run per commit, top to bottom (DESIGN §2.5 first keys; exact breaks from the refreshed TSV): `export function <run>RouteDeps(required: SiteRootContext, _optional = {})` returns that run's entries **verbatim** as `return { … } satisfies Partial<SiteRouteDeps>;` (`SiteRouteDeps = NewsletterRouteDeps & ByokToolSurfaceDeps`). `satisfies` gives every arrow its contextual type, exactly as the literal's declared type does today (e.g. `runExportSite: (options, _optional = {}) => …` stays parameter-annotation-free under `strict`), and keeps each run's inferred return type precise. If `tsc` reports an implicit `any` in a run anyway, annotate that run's return type as `Pick<SiteRouteDeps, …its keys…>` — never add `any`. Reads become `required.x`; every **self-read** of `routeDeps` (TSV: 2255, 2267, 2632, 2640, 2644, 2645, 2710, 2712, 2708) becomes `required.late.routeDeps()` inside the same arrow (call time, same TDZ). The closure's literal is replaced run by run with `...<run>RouteDeps(ctx)`; the closure builds `ctx` once above it from its local names |
| 20 | `site-deps/route-deps/assemble.ts` `assembleSiteRouteDeps(required: SiteRootContext, _optional = {}): SiteRouteDeps` spreads the runs in order; the closure becomes `const routeDeps = assembleSiteRouteDeps(ctx)` |
| 21 | Root shape (replaces COMMON §9 rule 2): stage results stop being destructured where a later stage takes the whole object; getters read `() => publishing.mediaRepo` etc.; every root await stays verbatim except renamed identifiers — the boot-order test's await list is updated **in this commit** to the new spellings (same count, same order). Root ≤50 code lines, else DESIGN §2.2's fallback, nothing else |
| 22 | Debt rows: COMMON §7. `check:size`'s `Delete stale debt entry:` lines for the `composition/deps.ts` `<file>` and `composeSiteRouteDeps` rows are removed exactly (node one-liner); `error-gate-debt.json`'s `deps.ts` `catch-reads-error` count is transferred to the files that now hold those catches (exact counts from `check:errors`). Each removed/transferred row is named in the report |
| 23 | Refresh all `work/*.tsv`; `gates.sh sheet-end`; report |

## Carries
| behaviour (base lines) | pin |
|---|---|
| key order, evaluation order and overwrite precedence: `...agentPluginConnections` (2279), `...compositionConsentOptions(…)` (2289), `...identity` then `principalRepo`/`removeUser`/`isInTrash` (2373-2378), `...resolvedMailer.operations` (2411), `...bindCredentialsHostPorts(…)` (2708) — runs are contiguous and spread in file order | S0 pin 1 (observed keys + `typeof`, **kept**: `Partial`/`Pick` typing cannot see a dropped optional key, `routes/types.ts:1303-1304` shows such keys) and S0 pin 2 (precedence) |
| optional capabilities stay absent when absent: the conditional `...(outboundTestOrigins.length > 0 ? { outboundTestOrigins } : {})` and every `?:` key | S0 pin 1 (snapshot has no key that the base lacks) |
| late self-reads stay late (9 sites) | S0 pin 1 (assembly does not throw); the S0 late-contract pins; `exportSiteBound` calls in `site-export-real-composition` tests (wide) |
| backup/version helpers `resolveSiteBackupSources` + `readTovuVersion` (579-600) and consent helper `compositionConsentOptions` (2955-2964) **move into the run file that calls them** (single user, COMMON §9 rule 6) — or, if two runs use one, into `route-deps/helpers.ts` imported by both; never left behind in `deps.ts` unwired | `forbid` below; `site-backup-wiring` (wide); `site-consent.ports.unit.test.ts` |
| module evaluation order: the exporter and `app.ts` load last; runs receive `createApp`/`exportSite` as context values | `gates.sh imports` (every commit) |
| one logger construction for E3 | `expect-count` below |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
files=$(find "$D/site-deps" -name '*.ts' -not -path '*__tests__*' | LC_ALL=C sort)   # find fails → set -e stops
npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs "$D/deps.ts" $files
$G expect-count S13-ONE-LOGGER 1 'createConsoleLogger\(' $D/deps.ts $D/site-deps
$G imports
$G forbid S13-HELPER-LEFT '^(export )?(async )?function (resolveSiteBackupSources|readTovuVersion|compositionConsentOptions)\(' $D/deps.ts
$G forbid S13-IMPLICIT-ANY ': any\b|as any\b' $D/site-deps/route-deps
```
Gates: COMMON §5 — `limits` now holds `deps.ts` to the full owner limits like every other file (its old findings are gone, so any finding is new) — plus `gates.sh sheet-end`.

Done when: `deps.ts` passes the limits config, every `site-deps` file passes it, all S0 pins and source readers green, no new gate line vs base. Report "deps.ts unfrozen for H1 step 5 (size-02 steps 4-7)". E3 may start only when `bash designs/deps-split/work/gates.sh e3-ready` exits 0 on the merged base after H1 step 5.
