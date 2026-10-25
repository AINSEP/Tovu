# L4 — Stryker measure-only, Jini `packages/cms` (non-UI source)

Jini @ 3e2fbae8 (`cloud/overnight-1024-jini`). Stryker 9.6.x + vitest-runner, concurrency 3, perTest coverage, incremental, `StringLiteral` excluded, type checks off. REPORT ONLY — no source/test edits, nothing pushed to Jini.

## 1. Headline
- **Whole package ran — nothing skipped for time.** 208 files with mutants (269 matched; the rest are type/barrel files with 0 mutants). 22,820 instrumented, of which 4,156 are StringLiteral-ignored → **18,664 effective mutants**.
- Killed 16,763 + timeout 102 = 16,865 · survived 1,773 · no-coverage 26 · **score 90.36 %** (detected / (detected+survived+nocov), ignored excluded).
- Wall: setup ~15 min (incl. 2 min dry run on 4,001 tests), mutation ~1 h 30 m (12 chunks, ≈ 200 mutants/min). Total ≈ 1 h 50 m of the 4 h cap. Rough tokens ≈ 0.15 M of ~1 M.
- Files sorted worst-first: `data/cumulative-summary.txt`. Survivors for every file with score < 80 % or ≥ 10 survivors (up to 10 each, with source line + replacement): `data/survivors-all-files-lt80-or-ge10.txt` (72 files).

### Per-directory
| dir | files | killed | surv | nocov | score |
|---|---|---|---|---|---|
| media | 28 | 2512 | 393 | 0 | 86.5 |
| consent | 13 | 2041 | 317 | 10 | 86.2 |
| navigation | 10 | 751 | 97 | 2 | 88.4 |
| taxonomy | 7 | 553 | 66 | 0 | 89.3 |
| trash | 6 | 446 | 47 | 0 | 90.5 |
| entries | 8 | 591 | 61 | 0 | 90.6 |
| workspace | 6 | 151 | 15 | 0 | 91.0 |
| widgets | 35 | 3277 | 322 | 2 | 91.0 |
| seo | 8 | 687 | 56 | 9 | 91.4 |
| comments | 12 | 613 | 47 | 3 | 92.5 |
| forms | 34 | 2765 | 208 | 0 | 93.0 |
| listing | 5 | 343 | 23 | 0 | 93.7 |
| redirects | 17 | 1139 | 75 | 0 | 93.8 |
| core | 4 | 102 | 6 | 0 | 94.4 |
| content-types | 12 | 697 | 35 | 0 | 95.2 |
| presentation | 2 | 48 | 2 | 0 | 96.0 |
| routing | 1 | 149 | 3 | 0 | 98.0 |

## 2. Suspected source bugs
**None found.** Nothing in the survivors looks like wrong behaviour; every high-signal survivor is an unasserted-but-plausible behaviour (see §4). `plugin-export.ts` was included (no STRYKER-RUN-2.md existed at start): 201 mutants, 85.2 %, 25 survivors.

## 3. Worst files (full table in data/cumulative-summary.txt)
| file | mut | surv | nocov | score |
|---|---|---|---|---|
| entries/agent-tools.ts | 94 | 28 | 0 | 28.2 |
| media/blob-gc-lock.ts | 7 | 5 | 0 | 28.6 |
| media/agent-tools.ts | 135 | 34 | 0 | 33.3 |
| media/transform-lock.ts | 8 | 5 | 0 | 37.5 |
| widgets/registry.ts | 222 | 66 | 0 | 43.1 |
| navigation/agent-tools.ts | 93 | 15 | 0 | 60.5 |
| seo/feed.ts | 62 | 5 | 9 | 65.9 |
| forms/delivery/deliver-job.ts | 29 | 8 | 0 | 69.2 |
| taxonomy/agent-tools.ts | 157 | 18 | 0 | 71.4 |
| consent/html/resources.ts | 206 | 52 | 0 | 72.6 |
| media/sanitize-svg.ts | 152 | 28 | 0 | 76.3 |
| consent/node/index.ts | 238 | 44 | 0 | 78.0 |
| media/document-read.ts | 128 | 24 | 0 | 78.6 |
| forms/notify-subscriber.ts | 47 | 8 | 0 | 79.5 |
| media/repo.memory.ts | 215 | 43 | 0 | 79.8 |

## 4. Triaged survivors (heuristic by mutator + source line read; sample-checked, not exhaustively)
- **(a) real gap — tool/JSON schemas never asserted** (`*/agent-tools.ts`, `widgets/registry.ts`): ObjectLiteral→`{}`, `required: [...]`→`[]`, `additionalProperties:false→true` on `inputSchema`. ~150 survivors across entries/media/navigation/taxonomy/content-types agent-tools and the widget registry. Missing assertion: snapshot/deep-equal each tool's `inputSchema` (or validate sample good/bad inputs against it). Security-relevant: `additionalProperties:true` or dropped `required` silently loosens what agents may send.
- **(a) media/sanitize-svg.ts (SECURITY)**: `hasUnsafeCss` regex variants survive (`\s*`→`\S*` in the `url(#local)` stripper, dropped `url|image-set|src|expression` alternation anchors), and line 33 `name.startsWith("on") || name==="xml:base" || hasUnsafeCss(value)` survives `→false`/`&&`/`endsWith` — i.e. no test pins each of: `onload=` stripped, `xml:base` stripped, unsafe CSS stripped independently; `value.trim()` removal (leading-space `javascript:` style bypass) unasserted; line 36 `image`+raster-data-URI condition `→true` unasserted. Write one test per clause with minimal payloads.
- **(a) media/content-type-sniffer.ts**: boundary arithmetic on magic-byte length checks (`offset + expected.length`, ftyp box `offset+4 > boxEnd`, `Math.min`→`max` on declared box size, sniff window) and `<?xml` → html/svg discrimination (`→true`). Need truncated-buffer and xml-prolog-non-svg/non-html fixtures — upload-type spoofing guard.
- **(a) forms/write-service.ts / deliver-job.ts / notify-subscriber.ts**: `FormFieldValidationError.fieldErrors` content (`[]`, `{}`) and `name.length <` boundary (min length `<=`) not asserted; deliver-job `untyped?.ok`/`error` non-object fallback to `delivery-failed` never exercised with a non-object error.
- **(a) consent**: css.ts/css-parser.ts regex mutants (px unit anchor `$`, rgba separators, `\s`→`\S`) = CSS validator accepts/rejects inputs no test tries; `html/gate.ts` line 52 script-gate condition (`tagName==='script' && token && attr`) each conjunct `→true` survives — a non-script/ wrong-token tag being gated is untested; `express/index.ts` cookie-id regex `{16,128}` bounds and `/^\/(admin|api|...)/` path exclusion anchor; `html/resources.ts` 52 survivors (not individually triaged — see data file).
- **(a) seo/feed.ts**: sort order comparator never exercised (line 51 NOCOV) and the `kind==="post"` filter `→true`; add a mixed-kind, unsorted feed fixture.
- **(a) navigation/tool-registrations.ts**: alias/`id`-collision branch (lines 152–153, `hasOwn(input,"id") || aliases.length>1`) no coverage → legacy-alias rejection untested.
- **(a) widgets/resolver-service.ts**: no-coverage at line 196; line 200 `referencedIds.size > 0` guard (skip repo query) unasserted (`>=`/`true` survive) — extra DB round-trip not detected; `preview:false` context flag (line 275) unasserted.
- **(b) equivalent / low value**: `media/blob-gc-lock.ts` and `media/transform-lock.ts` — `lockTails.get(key)===settledTail` cleanup of the lock-tail map (only a memory-growth effect; observable via a map-size probe if you want it killed). Many `ArrayDeclaration → ["Stryker was here"]` on `?? []` defaults are equivalent when the array is only iterated.
- **(c) noise**: remaining ObjectLiteral/ArrayDeclaration survivors on error `details`/`notes` payloads; `repo.memory.ts` files (in-memory test doubles — gaps there only matter as contract drift vs the real adapters).

## 5. No-coverage (code no test executes) — only 26 mutants
`consent/css.ts` 64, 77 · `consent/html/gate.ts` 72, 148 · `seo/feed.ts` 51 (sort comparator, 9 mutants) · `navigation/tool-registrations.ts` 152–153 · `widgets/page-embed-types.ts` 44 · `widgets/resolver-service.ts` 196 · `comments/repo.memory.ts` 102 (+ a few more in comments). See `data/survivors-all-files-lt80-or-ge10.txt` `NOCOV` lines.

## 6. NOT RUN
Nothing in scope was skipped: all `src/**/*.ts` non-test, non-`.d.ts`, non-`.tsx` files were mutated. 61 matched files produced 0 mutants (types/barrels). Test-side exclusions (see §7).

## 7. What these numbers do NOT catch
- **Three test files excluded from the run** (they introspect real source files and fail inside the Stryker sandbox even unmutated): `src/__tests__/subpath-isolation.contract.test.ts`, `src/content-types/__tests__/universal-entries.boundary.test.ts`, `src/widgets/__tests__/marker-target-parity.unit.test.ts`. Mutants only those tests would kill are inflated survivors (esp. widget marker/registry and import-safe boundaries). Config: `data/vitest.stryker.config.ts`.
- Type checks off (`disableTypeChecks`, no checker plugin) so type-invalid mutants count as survivors/killed arbitrarily; StringLiteral mutants excluded (4,156) — error messages / identifiers / event names / event keys not mutation-tested; "killed" = any test in the package suite, so indirect kills inflate score; missing *inputs* and unimplemented behaviour are invisible; `.tsx`/UI and `infra`/`db` sibling packages not mutated (a symlink to packages/infra was needed for one `seo` test); in-memory repos are test doubles, not the real DB adapters.
- Triage is heuristic (mutator class + source line); only ~12 files read in detail.

## 8. Top 10 tests to write first (risk-ranked)
1. `media/sanitize-svg`: one payload per unsafe clause — `on*` attr, `xml:base`, `url(`/`image-set(`/`src(`/`expression(`, `@import`, backslash/comment escapes, whitespace-padded values, non-raster `<image>` data URI.
2. `media/content-type-sniffer`: truncated/short buffers for each magic number, ftyp box boundary, `<?xml` that is neither html nor svg, text-sniff window.
3. All `*/agent-tools.ts` + `widgets/registry.ts`: assert each tool `inputSchema` (required, additionalProperties:false, property types) via deep-equal or good/bad fixtures — loosening permissions on agent input.
4. `consent/html/gate.ts`: non-script tags and wrong runtime token must not be gated; each conjunct of line 52; plus `consent/express` cookie id regex bounds (15/16/128/129 chars) and excluded path prefixes.
5. `consent/css.ts` + `css-parser.ts`: reject/accept tables for px lengths, rgba components/alpha, multi-value counts, comments `/* */` and unterminated tokens (also covers NOCOV 64/77).
6. `forms/write-service`: assert `fieldErrors` entries for notify.* and name length boundaries (min−1, min, max, max+1).
7. `forms/delivery/deliver-job`: non-object / missing error from a delivery attempt maps to `delivery-failed`.
8. `navigation/tool-registrations`: legacy alias vs `id` collision and multiple aliases (NOCOV 152–153).
9. `widgets/resolver-service`: no repo query when `referencedIds` is empty; `preview:false` passed through; NOCOV 196.
10. `seo/feed`: mixed-kind, unordered entries → only posts, newest first (NOCOV 51); `seo/sitemap` (18 survivors) boundary cases.

Reproduction notes: stryker run with cwd=`packages/cms`; needed `packages/cms/tsconfig.base.json` copy (a `forms/tsconfig.json` outside src extends `../../../tsconfig.base.json`), `.stryker-tmp/infra` symlink → `packages/infra`, `cleanTempDir:false`, and the custom vitest config above. None of this was committed to Jini.

L4 DONE 2026-10-25T17:43Z — wall ≈ 1 h 50 m, rough tokens ≈ 0.15 M
