# analytics / export / media — final verdict

Generated 2026-08-21 · Branch `general-work` · Coordinator (Claude Opus 5)

This answers the question that opened the session: **"analytics/export/media is not done and needs to
be at 100%."** Written to be readable without having followed the night's investigation.

## The answer

```
                        LINE      BRANCH      FUNC
                      100.00%     96.77%    100.00%

missing:  0 lines     14 branches     0 functions
```

**Line and function coverage are at 100%.** Branch coverage is at 96.77%, and **every remaining branch
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
| **`export/site-exporter.ts`** | 100.00 | **89.31** | 100.00 |
| `media/bootstrap.ts` | 100.00 | 100.00 | 100.00 |
| `media/index.ts` | 100.00 | 100.00 | n/a |
| `media/provider-credential-store.memory.ts` | 100.00 | 100.00 | 100.00 |
| `media/provider-credential-store.ts` | 100.00 | 100.00 | 100.00 |
| `media/tool-registrations.ts` | 100.00 | 100.00 | 100.00 |

`n/a` func = a re-export barrel with no function bodies of its own. Not a gap.

## The one remaining file: `site-exporter.ts`, 14 branches

Triaged. **None is a deletion.** By cause:

- **no-seam (~5)** — `writeRedirectRoute`'s non-3xx / missing-`Location` paths and
  `prefixRootRelativePath`'s "not root-relative" path. Two independent attempts to reach these failed
  for informative reasons, and **both failures are good news about the product**:
  - swapping `redirectRepo` to desync the manifest from the live resolver doesn't work, because the
    redirect phase handler binds its repo **by object identity at `createRouteDeps()` construction**,
    not per request (unlike `postRepo`, which is re-read — that asymmetry is why the equivalent trick
    works for posts);
  - an external cross-origin redirect target never yields a 3xx at all, because the anti-open-redirect
    oracle **fails closed** for unverified origins.

  Both behaviors are now locked in as **security characterization tests** (`a1b820ab`, `623e563e`) so a
  future refactor can't silently undo them.
- **type-required (~4)** — `?? undefined` / `?? ""` fallbacks after `Headers.get("content-type")` or a
  regex capture group. Express always sets Content-Type on a real response and the capturing regexes
  always match ≥1 character, so these are empirically dead but **required by the compiler's nullable
  types**. Removing them breaks `tsc`.
- **remainder** — CSS-crawl edge paths adjacent to the second-hop crawl closed in `5b03f173`.

**Nothing here should be "fixed" by adding production surface to create a test seam.** That was
considered and rejected; the seam that did get used (`ExportSiteRouteDeps.createSiteApp`) already
existed for this purpose.

## Measurement integrity

The night's central discovery was that a **full-repo** `npm run test:cov` produces corrupt per-file
numbers for 89% of this repo (dual module instantiation merged into one `SF:` block). This measurement
therefore comes from a **scoped** run, and was integrity-checked before being quoted:

- **esbuild interop shim markers across all 14 files: 0.** (`__toCommonJS` / `__copyProps` / `__toESM` /
  `__export`.) The lcov is clean; the dual-instantiation artifact is absent.
- **Duplicate `FN:` names: 4** (3 in `analytics/ports.ts`, 1 in `media/provider-credential-store.ts`).
  Present but **harmless here** — every instance is hit, so `FNH/FNF` still reads 100%. The function
  figure above is therefore a real 100%, not a range.

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
