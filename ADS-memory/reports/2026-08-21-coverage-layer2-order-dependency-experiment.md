# Coverage layer-2 order-dependency experiment — result

**Date:** 2026-08-21
**Status:** COMPLETE — 6/6 runs, no flip in either arm.

## What this tests

The prior bisection (`2026-08-21-coverage-dual-instantiation-root-cause.md`) found two separate
corruption layers on `src/media/provider-credential-store.ts` when run with the `src/server/http/**`
12-file test cluster plus the 4 `src/media/**` tests:

- **Layer 1** — `FN:`/`FNDA:` table concatenates with a phantom CJS shadow (`FNF:43 FNH:29` vs the
  clean scoped `FNF:20 FNH:20`), plus 6 esbuild shim markers (`__toCommonJS`/`__copyProps`/`__toESM`/
  `__export`) in the `SF:` block. Reproduced 5/5 in every prior run touching this cluster.
- **Layer 2** — `LH:` line-hit deflation (`LH:294` = full corruption vs `LH:357` = clean lines). This
  is the part that actually changes the reported coverage percentage. It **flipped between runs of the
  same nominal file set**: 3 full / 4 partial across 7 prior runs (rounds 10, 10b, and three
  `TEST_CONCURRENCY=1` repeats), across both `=1` and `=2`.

A confound was found and disclosed rather than absorbed: every one of those 7 "identical repeat" runs
built its file list with an **unsorted `find`**, and `find`'s enumeration order was directly confirmed
unstable across back-to-back invocations on this filesystem. So none of those 7 runs are provably
order-controlled — the layer-2 flip could be pure order-of-module-load rather than a genuine internal
race in Node's V8 coverage merge.

This experiment pins order explicitly and tests two arms, 3 runs each, to settle which explanation the
data supports.

## Setup

- **Anchor file:** `src/media/provider-credential-store.ts`.
- **File set, verified before starting:** `find src/server/http -path '*/__tests__/*' -name
  '*.test.ts'` = **12 files**. `find src/media -name '*.test.ts'` = **4 files**. Both counts matched
  the prior bisection's set exactly — confirmed before any run.
- **Arm A (sorted ascending):** the 12 http files (`sort`) followed by the 4 media files (`sort`),
  concatenated into one file, `armA-filelist.txt`. Every one of Arm A's 3 runs invoked `node --test`
  against the **literal same file** (not regenerated from `find` between runs) — this is a stronger
  pinning guarantee than re-running `find` and diffing, since there is no `find`-enumeration step at
  all after the list is built once. SHA-256 of the list: `6241d6f1a5562ec663507eec594c7f6fb5015570fc64e82609f34f1e0ccf4f99`.
- **Arm B (sorted descending):** same 16 files, `sort -r` on each group, concatenated the same way,
  one fixed file (`armB-filelist.txt`) reused for all 3 runs. SHA-256:
  `af1ad21abb73e661f4644fb1d49a941b1220e194bf88ef2a76bee2dda2b8035a`.
- **Concurrency:** `--test-concurrency=1` throughout (matches the prior `=1` runs this experiment is
  compared against).
- **Command:** exact shape from `package.json`'s `test:cov` (`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`,
  `--experimental-test-module-mocks`, `--experimental-test-coverage`, same exclude pattern), writing
  lcov to a scratch dir instead of `development/coverage/`. Never touched `development/coverage/`.
- **Machine safety:** `ps -eo args | grep -c '[e]xperimental-test-coverage'` checked and confirmed `0`
  immediately before every one of the 6 runs. No overlap with any other session's coverage run.

### Note on the `media` question the dispatch asked me to check explicitly

The prior report's `TEST_CONCURRENCY=1 ×3` section text says "the exact 12-file cluster" / "Same
12-file `src/server/http/**` set" without re-stating media inclusion in that sentence, unlike rounds
8/10/10b/11/12 which are explicitly written as "media + N files." I could not find an unambiguous
re-confirmation that media was included in the `=1` runs specifically. I'm treating it as included
(matching round 10's setup, and consistent with the fact that `LH:294`/`LH:357` only mean anything if
the anchor file is actually loaded by something in the run — none of the 12 http files import it, per
the report's own exhaustive 1-hop grep) but flagging this as an inference, not a re-verified fact, per
the instruction not to silently absorb a possible difference from the baseline.

## Results

| Arm | Run | Wall time | Shim markers | FNF/FNH | LH/LF |
|---|---|---:|---:|---|---|
| A (ascending) | 1 | 135s | 6 | 43/29 | 357/357 (clean) |
| A (ascending) | 2 | 92s | 6 | 43/29 | 357/357 (clean) |
| A (ascending) | 3 | 128s | 6 | 43/29 | 357/357 (clean) |
| B (descending) | 1 | 82s | 6 | 43/29 | 357/357 (clean) |
| B (descending) | 2 | 71s | 6 | 43/29 | 357/357 (clean) |
| B (descending) | 3 | 88s | 6 | 43/29 | 357/357 (clean) |

**All 6 runs across both arms produced the identical signature**: 6 shim markers, `FNF:43 FNH:29`
(layer 1 present, matching the canonical corrupted function table), `LH:357 LF:357` (layer 2 absent —
lines fully clean, matching the "partial" signature seen in some prior rounds, never the "full" `LH:294`
corruption).

## Verdict

**Both arms internally consistent (3/3 each) AND identical to each other.** Per the pre-registered
reading rule: **order is not the lever** — reversing the entire file list (ascending vs. descending) did
not change the outcome at all, for either layer.

**This does not by itself prove there is no order-dependency of any kind**, and it does not prove a
genuine internal race either. What it rules out specifically: simple global list-direction (ascending
vs. descending, the one axis this experiment manipulated) is not what determined layer 2's prior
flip-flopping. It leaves open, un-tested by this experiment:
- Whether some *other* specific ordering (not just forward/reverse of this one grouping) would trigger
  the full `LH:294` corruption — this experiment tested exactly 2 of the very large number of possible
  orderings of 16 files.
- Whether interleaving the two groups differently (rather than always running all 12 http files before
  or after all 4 media files as one block) matters — both arms kept the http/media grouping intact and
  only reversed within/between groups uniformly.

**One observation worth flagging without overclaiming:** the historical baseline for this exact file
set was 3 full / 4 partial across 7 runs (~43% full-corruption rate, unsorted `find` order, uncontrolled
between runs). This experiment got 0 full / 6 partial with two specific pinned orders. Under the
historical rate, seeing 0/6 by chance alone has roughly a 3–4% probability (`0.57^6 ≈ 0.034`) — suggestive
that *these two particular orderings* may sit outside whatever condition previously produced full
corruption, but 6 runs is too small a sample and 2 orderings too narrow a probe to call this decisive
either way. I am not treating it as proof of an order-dependency mechanism; I am flagging it as a
reason not to treat "order is not the lever" as the final word on layer 2, only as the final word on
*this specific manipulation* (global sort direction).

## Recommendation for the next step, if this is pursued further

The cheapest next probe, if desired: re-run with a *third*, structurally different ordering — e.g.
interleave http and media files instead of keeping them as two blocks, or use one of the actual
unsorted `find` outputs captured verbatim (not regenerated) from a run that is known to have hit
`LH:294` historically, if any such raw ordering was ever logged. Absent that, the honest state of layer
2 is: **not explained by global sort direction; still an open non-determinism whose trigger condition
is unknown.**

## Run artifacts

All 6 lcov files and their extracted `provider-credential-store.ts` `SF:` blocks are under
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/b0d70569-ae26-463a-a2a7-7d0c2d25db78/scratchpad/cov-order/`
(`armA-run{1,2,3}.lcov.info`, `armB-run{1,2,3}.lcov.info`, plus `.block.txt` extracts and stdout logs).
This is scratch space, not committed — the pinned file lists' SHA-256 hashes above are the durable
record of exactly what ran.
