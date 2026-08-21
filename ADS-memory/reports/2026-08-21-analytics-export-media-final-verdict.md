# analytics / export / media — final verdict

Generated 2026-08-21 · Branch `general-work` · Coordinator (Claude Opus 5)

This answers the question that opened the session: **"analytics/export/media is not done and needs to
be at 100%."** Written to be readable without having followed the night's investigation.

## The answer

```
                        LINE      BRANCH      FUNC
                      100.00%     97.00%    100.00%

missing:  0 lines     13 branches     0 functions      (421/434 branches hit)
```

(Updated 2026-08-21 after the `normalizeBasePath` branch closed — see below. Was 14 branches / 96.77%
(420/434). Re-summed directly from a fresh scoped lcov run across all 14 files, not derived from the
rounded percentage.)

**Line and function coverage are at 100%.** Branch coverage is at 97.00%, and **every remaining branch
is in one file**, `src/export/site-exporter.ts`.

For comparison, the 2026-08-20 handoff claimed **99.59 / 87.73 / 98.61** and marked the area done. The
area is now better than that claim on all three axes.

## Per file

| file | line | branch | func |
|---|---:|---:|---:|
| `analytics/config.settings.ts` | 100.00 | 100.00 | 100.00 |
| `analytics/index.ts` | 100.00 | 100.00 | n/a |
| `analytics/ingest.ts` | 100.00 | 100.00 | 100.00 |
| `analytics/ports.ts` | 100.00 | 100.00 | 100.00 |
| `analytics/repo.memory.ts` | 100.00 | 100.00 | 100.00 |
| `analytics/salt.ts` | 100.00 | 100.00 | 100.00 |
| `export/index.ts` | 100.00 | 100.00 | n/a |
| `export/route-manifest.ts` | 100.00 | 100.00 | 100.00 |
| **`export/site-exporter.ts`** | 100.00 | **90.08** | 100.00 |
| `media/bootstrap.ts` | 100.00 | 100.00 | 100.00 |
| `media/index.ts` | 100.00 | 100.00 | n/a |
| `media/provider-credential-store.memory.ts` | 100.00 | 100.00 | 100.00 |
| `media/provider-credential-store.ts` | 100.00 | 100.00 | 100.00 |
| `media/tool-registrations.ts` | 100.00 | 100.00 | 100.00 |

`n/a` func = a re-export barrel with no function bodies of its own. Not a gap.

## The one remaining file: `site-exporter.ts`, 13 branches (was 14)

**Full re-triage completed 2026-08-20/21**, using exact V8 coverage offsets (not lcov's line numbers —
see Measurement integrity below) cross-checked against a manual esbuild transform reproducing tsx's own
options (`minifyWhitespace: true, keepNames: true, sourcemap: true` — read directly out of
`node_modules/tsx/dist/index-XurvG3JN.mjs`). Every one of the original 14 zero-hit `BRDA` ranges was
mapped to an exact source line and read in context. The previous "~5 / ~4 / ~5" grouping in this
document was an approximation from before this mapping existed; the counts below are exact and
supersede it — one of the previously-unlabelled branches turned out to be closeable, so the true count
was 14 → now 13.

**Closed (1): `normalizeBasePath`'s leading-slash short-circuit.** `trimmed.startsWith("/") ? trimmed :
...` — the `? trimmed` (already-prefixed) side had never run because every existing test passed
`basePath: "my-repo"` (no leading slash); the function's own doc comment names `"/repo"` and `"/repo/"`
as equivalent inputs that had simply never been tried. Closed with one new test using the existing
`exportSite`/`createRouteDeps()` seam, no production change — commit `a326388e`. Branch coverage:
117/131 (89.31%) → **118/131 (90.08%)**.

By cause, all 13 remaining, **none is a deletion**:

- **no-seam (6)** — up from the 3 originally named; offset-mapping surfaced 3 more in the same family:
  - `writeRedirectRoute`'s non-3xx failure, its `?? route.redirectTarget` fallback, and its
    `!location` failure (3 branches, one scenario: a missing `Location` header). Two independent
    attempts to reach these failed for informative reasons, and **both failures are good news about the
    product**: swapping `redirectRepo` to desync the manifest from the live resolver doesn't work,
    because the redirect phase handler binds its repo **by object identity at `createRouteDeps()`
    construction**, not per request (unlike `postRepo`, which is re-read); and an external cross-origin
    redirect target never yields a 3xx at all, because the anti-open-redirect oracle **fails closed**
    for unverified origins. Locked in as **security characterization tests** (`a1b820ab`, `623e563e`).
  - `assetOutputFile`'s two path-containment guards (`resolved !== path.join(...)` and
    `!resolved.startsWith(outputDir + sep)`, both `return null`) plus `fetchOneAsset`'s corresponding
    `{ ok: false, reason: "...refused" }` branch when `assetOutputFile` returns `null` (3 branches, one
    scenario: a crawled asset URL that resolves outside `outputDir`). Traced every real caller: URLs
    from `extractCssUrls` are resolved through `new URL(ref, ...).pathname`, which normalizes `..`
    before this guard ever sees it, so a CSS reference cannot trigger it. URLs from `extractAssetUrls`
    (HTML `href`/`src`) are raw substrings gated only by a hardcoded prefix
    (`/theme-assets/`, `/agent-icons/`, `/m/`) — a literal `href="/theme-assets/../../x"` in a
    **rendered page** would reach it, but producing that would require a theme file, and
    `src/themes/static/` is off limits this session (shared with other live sessions, per this file's
    own earlier note and the standing rule against writing there). No production surface exists to
    inject one without a fixture theme. This is a security guard genuinely unreachable **today** for a
    seam reason, not a correctness reason — per this session's own standing rule, it stays.
- **type-required (7)** — up from the ~4 originally named; the pattern is broader than just
  `Headers.get("content-type")`/regex-capture, it also covers `Array.prototype.split()[0]` under this
  repo's `noUncheckedIndexedAccess`, which types every array index as possibly-`undefined` even though
  `split()` always returns ≥1 element at runtime:
  - `extractAssetUrls`: `match[1] ?? ""` (regex capture) and `value.split("#")[0] ?? value` (split index)
  - `extractCssUrls`: `match[2] ?? ""` (regex capture)
  - `assetOutputFile`: `url.split("?")[0] ?? url` (split index)
  - `writeContentRoute`, `writeNotFoundRoute`, `fetchOneAsset`: three separate instances of
    `res.headers.get("content-type") ?? undefined`
  
  All seven are empirically dead — Express always sets Content-Type on a real response, the capturing
  regexes always match ≥1 character, and `split()` always returns ≥1 element — but **required by the
  compiler's nullable/possibly-undefined types**. Removing any of them breaks `tsc`.

**Nothing here was "fixed" by adding production surface to create a test seam.** The one branch that
did get closed used the seam that already existed (`ExportSiteRouteDeps.createSiteApp`, same as
`5b03f173`) — no new seam, no production change.

## Measurement integrity

The night's central discovery was that a **full-repo** `npm run test:cov` produces corrupt per-file
numbers for 89% of this repo (dual module instantiation merged into one `SF:` block). This measurement
therefore comes from a **scoped** run, and was integrity-checked before being quoted:

- **esbuild interop shim markers across all 14 files: 0.** (`__toCommonJS` / `__copyProps` / `__toESM` /
  `__export`.) The lcov is clean; the dual-instantiation artifact is absent.
- **Duplicate `FN:` names: 4.** Independently identified by `cov-aem-2` as `<static_initializer>`
  colliding **on name only** — 4× in `analytics/ports.ts` at four distinct line numbers, 2× in
  `media/provider-credential-store.ts`. Every instance is hit, so `FNH/FNF` still reads 100%. **The
  function figure above is a real 100%, not a range.** Note this is a different thing from the
  repo-wide `FN:`-concatenation artifact: these are genuinely distinct static initializers that happen
  to share a generated name, not one function listed twice.

This measurement was reproduced independently by `cov-aem-2` — its own fresh scoped run and its own
parser, executed before it read this file — and matched byte for byte, including all 14 zero-hit `BRDA`
branches (that reproduction predates the `normalizeBasePath` fix above; it verified the 14-branch state,
not the current 13-branch one).

**2026-08-21 re-verification** (after closing `normalizeBasePath`): re-ran the same scoped command,
re-summed `LF/LH/FNF/FNH/BRF/BRH` per file directly from the lcov text (not from any rounded
percentage) across exactly the 14 files this report names, each appearing as exactly one `SF:` block (no
dual-instantiation) — 434 total branches, 421 hit, 13 zero-hit, matching the file-level triage above
exactly. Also cross-checked the 13 remaining zero-hit branches against raw `NODE_V8_COVERAGE` output
(exact byte offsets, immune to lcov's line-number corruption) run twice — before and after the fix — to
confirm only the `normalizeBasePath` range changed from zero to nonzero and nothing else shifted.

Reproduce with:

```
TEST_CONCURRENCY=2 node --import tsx --test --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<out>.lcov \
  --test-reporter=dot --test-reporter-destination=/dev/null \
  "src/analytics/**/*.test.ts" "src/export/**/*.test.ts" "src/media/**/*.test.ts"
```

Do **not** measure this area with a full `npm run test:cov` — it reported the same area at
89.16 / 86.30 / 73.49, all three figures corrupt.

## Two production bugs fixed along the way

Both were found by writing tests, not by reading code, and both were shipping wrong data:

1. **Every iPhone and iPad was recorded as a Mac.** `classifyOsFamily` tested `mac os|macintosh` before
   `iphone|ipad|ios`, and every real Apple mobile Safari user-agent contains the literal `"like Mac OS X"`
   by WebKit convention. The `ios` branch had **never fired on a real device** — it was "covered" only by
   a synthetic UA that omitted that substring. Every iOS figure this product ever reported is wrong.
   Test `5365a0bb` (red), fix `2bc8b2e6` (green).
2. **The same IPv6 address counted as two visitors.** `truncateIp` split on `":"` and filtered empty
   segments without expanding `"::"` first, so `"::1"` returned `"1::"`. `"2001:db8::1"` and
   `"2001:db8:0:0:0:0:0:1"` are one address and hashed to different buckets.
   Test `7351d9da` (red), fix `88d6f5d0` (green).

**The `truncateIp` bug had a passing test the whole time.** It asserted only *determinism* — same input,
same output — which the bug satisfied perfectly. Full coverage, green test, corrupt data. The lesson is
recorded: name the function's real invariant (here, an *equivalence* across input spellings) and ask
whether the assertion would still pass if the function were broken the way it is most likely broken.
