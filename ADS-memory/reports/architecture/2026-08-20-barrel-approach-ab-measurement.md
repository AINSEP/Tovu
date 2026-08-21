# Barrel Approach A vs B — measured, not modeled

**Date:** 2026-08-20 · **Status:** measurement only, nothing landed — both experiments applied and
reverted in an isolated worktree, working tree verified clean (`git status`) before and after each.

> ## ⚠️ COORDINATOR ADDENDUM — the worktree was 226 commits stale. Read this before citing numbers.
>
> Verified after the fact: the experiment worktree branched from **`64d776bc` (2026-08-19)**, which is
> **226 commits behind** the `general-work` HEAD the report was written against (`ad411490`). Evidence:
> its `check-architecture.baseline.json` still carries the pre-rename **`coreSize`** key rather than
> `bidirectionalHubs`, and `hubsAtThresholds` is absent from its copy of `check-architecture.ts`.
>
> **What still holds — everything decisive:**
> - **The A-vs-B comparison itself.** Both approaches were built and measured against the *same* base,
>   so every relative finding is internally valid.
> - **The lint result — and this is the report's single most actionable finding.** A: 72→72 violations,
>   zero new. B: 72→97, **+25 new `no-deep-imports:assistant` warnings**. This is deterministic
>   dependency-cruiser output, not a graph statistic, so it does not depend on the base commit at all.
> - **"Both approaches add exactly +1 to the blocking metric."** The mechanism — `deepImports()`
>   excluding only `src/${module}/index.ts` by exact string — is base-independent.
> - **The runtime tie.** A's narrow specifier (8.9 ms median) vs B's (9.9 ms) is inside noise. The
>   coordinator's prior was that A and B would be indistinguishable on runtime; confirmed.
>
> **What does NOT transfer:**
> - **Every absolute number.** The report's baseline reads `201` API-surface files / `139` hubs / `862`
>   files. Current `general-work` is `202` / `151` / `870`, and the baseline was deliberately
>   re-captured in `3d989a5f`. Do not quote the absolute figures as current state.
> - **⚠️ "B regresses `core size` 139→140" is SUSPECT and should not be used to decide between A and B.**
>   That number was measured under the **floating-median** hub metric — the exact defect fixed in
>   `3d989a5f` (see `2026-08-20-hub-decomposition-hypotheses.md` §2 and §7). Adding one graph node
>   under a floating threshold can move the count for reasons unrelated to real coupling. Under frozen
>   medians a genuinely new above-median node would still plausibly cost +1, but that has **not been
>   measured** and the report's figure is not evidence for it either way.
>
> **Net effect on the conclusion: none.** A still wins, but on a narrower and cleaner basis than the
> report's summary implies — the decisive axis is the +25 lint warnings, not the `core size` delta.
> Re-running on current HEAD was judged not worth it, since the deciding evidence is base-independent.
>
> **Also note the report's own honest caveat (§6, unchanged):** the version of Approach B that was
> measured is the *trimmed* one — alias + file move. Codex's fuller proposal (a new blocking
> `check-public-imports.ts` gate with `ARCH-PUBLIC-*` diagnostics) was never built, so B's claimed
> "sole door, mechanically enforced" advantage was never actually on the table in this measurement.
> Nothing here tests it.

**Scope:** the 25-of-47 `#src/assistant/index` importers that need exactly one symbol pair,
`registerToolContributor`/`type ToolContributor`, from `src/assistant/tool-contribution-registry.ts`.
Prior context: `ADS-memory/reports/architecture/2026-08-20-mini-barrel-proposal-rejected.md` (a 12-file
`assistant/tools/index.ts` mini-barrel, rejected by two independent peers; **not re-litigated here**).

---

## Bottom line

- **Runtime import cost: nearly identical between A and B, confirming the prior.** Both approaches
  land the 25 majority callers on an effectively-leaf module (~8–26 ms, ~83–86 MiB RSS in this
  environment) instead of the full barrel (~450–800 ms, ~128–138 MiB RSS). The extra re-export hop
  Approach B adds is not measurable above run-to-run noise.
- **The blocking gate metric (`module API surface (files exposed)`) regresses by exactly +1 under
  BOTH approaches** — your expectation was right, and it is a real, `--update`-requiring regression
  in both cases, not a wash. Neither approach reduces or holds it flat.
- **The two approaches are NOT equivalent once you look past runtime cost — B costs more on two axes
  A doesn't touch:**
  1. **Lint, as literally specified in the brief:** Approach A is 100% clean (dependency-cruiser
     violation count unchanged, 72→72). Approach B, built exactly as described (alias + file move,
     no dependency-cruiser edit), adds **25 new `no-deep-imports:assistant` warnings** — one per
     caller reaching `src/assistant/public/tool-contributions.ts`, which is not `index.ts` and isn't
     on the `EXTRA_TO_EXEMPT` allow-list. `check-architecture.ts`'s "exact-string index.ts" rule and
     dependency-cruiser's `internals` regex don't grant new files any special status just because a
     `package.json` alias points at them — the compiler-level "narrow door" and the lint-level
     "declared public surface" are two different mechanisms that don't talk to each other here.
  2. **`check:architecture`, a second metric only B disturbs:** B regresses `core size` (a RATCHET,
     non-blocking metric) 139→140 in addition to the shared `moduleApiSurfaceFiles` regression,
     because it adds a genuinely new node to the file graph (the re-export file itself). A adds zero
     new nodes — it just re-points an existing edge at an already-existing file — so `core size` and
     total file count are untouched.
- **Blast radius is comparable but not equal:** A touches 27 files (25 callers + `index.ts` +
  `.dependency-cruiser.cjs`), 38/−37 lines. B touches 28 files (the same 25 + 1 + `package.json` +
  one brand-new file), 43/−36 lines, and it's the only one of the two that creates a new file.

If the question is "which one do I ship," on this evidence **A is strictly cheaper on every axis
measured except file count-vs-line-count parity**, and B's theoretical advantage (Codex's "sole door,
mechanically enforced" argument) was not realized by what got built here — the version of B in the
dispatch brief has no enforcement Approach A's `EXTRA_TO_EXEMPT` doesn't already have, and costs an
extra lint regression to get it. The stronger version of B (Codex's own proposal) additionally wanted
a new blocking `check-public-imports.ts` gate — **not built here**, out of scope for what the brief
asked for; that gate, if it existed, might change this conclusion and would need its own measurement.

---

## Method

- One clean worktree, one baseline `npm run check:architecture` / `depcruise` run before any change.
- Applied Approach A in full, measured, reverted via `git checkout --` on every touched tracked file
  (verified `git status` empty). Applied Approach B in full on the now-clean tree, measured, reverted
  the same way (`git reset` + delete the new file + `git checkout --`), verified `git status` empty
  again at the very end.
- Import cost: fresh `node --import tsx` subprocess per run, in-process `performance.now()` around a
  single `await import(<absolute-file-url>)` call (excludes Node+tsx boot, which is identical across
  every condition and would otherwise dominate the signal — matches the peer's framing of "cost of
  importing this specifier," not "cost of spawning a process"). RSS via
  `process.memoryUsage().rss` read immediately after the import resolves. 5 runs per condition.
- **This worktree ran concurrently with several other active agents in the same session** (test
  fixers, coverage runners, a second barrel peer). Wall-clock numbers below show real contention —
  compare within a condition-pair measured back-to-back, not across approaches measured minutes
  apart. RSS is far more stable across the whole session and is the more trustworthy of the two.

---

## 1. Gate delta — `npm run check:architecture` (not run with `--update`)

| metric | baseline | Approach A | Approach B | tier |
|---|---:|---:|---:|---|
| files (production) | 862 | 862 | **863** | — |
| propagation cost (all-import) | 12.20% | 12.09% (improved) | 12.12% (improved, less than A) | ratchet |
| propagation cost (runtime-only) | 1.85% | 1.69% (improved) | 1.69% (improved) | ratchet |
| back-edges into composition root | 11 | 11 | 11 | **hard** |
| module cycles (mutual pairs, runtime-only) | 0 | 0 | 0 | **hard** |
| largest SCC (runtime-only) | 0 | 0 | 0 | **hard** |
| **module API surface (files exposed)** | **201** | **202 (+1, regressed)** | **202 (+1, regressed)** | **hard — BLOCKS** |
| deep-import edges (informational) | 518 | 543 (+25) | 543 (+25) | — |
| core size (count/total) | 139/862 (16.13%) | 139/862 (16.13%, unchanged) | **140/863 (16.22%, +1 regressed)** | ratchet |

Both A and B: `check:architecture` exits **FAILED — 1 metric(s) regressed against a hard constraint**
(`module API surface (files exposed)`, 201→202). This is exactly the expected mechanical outcome —
`EXTRA_TO_EXEMPT` (A) and a `package.json` `imports` alias (B) both silence dependency-cruiser's own
lint, but neither touches `check-architecture.ts`'s independent `deepImports()` function, which
excludes only `src/${module}/index.ts` by exact string. Both approaches move the 25 edges off that
one excluded file onto a new one, so both add exactly 1 newly-exposed file. **Landing either requires
a deliberate `--update` in the same commit** — this was flagged as a known limitation in the prior
mini-barrel report and is now directly confirmed, not just theorized.

The one place they diverge: **B also regresses `core size`** (139→140, ratchet/non-blocking) because
`src/assistant/public/tool-contributions.ts` is a brand-new graph node (25 files reach it, it reaches
`tool-contribution-registry.ts`) — a new node the total-file-count and hub-counting metrics both see.
A never creates a new file, so it can't move either of those. B also improves propagation cost
slightly less than A (12.12% vs 12.09%) for the same reason — one more node in the reachable-set BFS.

## 2. Lint — `npx depcruise --config .dependency-cruiser.cjs src`

| | baseline | Approach A | Approach B |
|---|---:|---:|---:|
| total violations | 72 (0 errors, 72 warnings) | **72 (0 errors, 72 warnings) — unchanged** | **97 (0 errors, 97 warnings) — +25** |
| `no-deep-imports:assistant` | 8 | **8 — unchanged** | **33 (+25 new)** |

Approach A: zero new violations of any kind — confirmed by full diff of the two `depcruise` outputs
(the only difference was an unrelated `7265→7263 dependencies cruised` count in the summary line).

Approach B (built exactly as specified — new file + `package.json` alias, **no** dependency-cruiser
edit): 25 new `warn no-deep-imports:assistant: <caller> → src/assistant/public/tool-contributions.ts`
lines, one per caller. Sample:
```
warn no-deep-imports:assistant: src/widgets/tool-registrations.ts → src/assistant/public/tool-contributions.ts
warn no-deep-imports:assistant: src/webhooks/tool-registrations.ts → src/assistant/public/tool-contributions.ts
warn no-deep-imports:assistant: src/seo/tool-registrations.ts → src/assistant/public/tool-contributions.ts
```
Severity is `warn` (assistant isn't in `PROMOTED_NO_DEEP_IMPORTS`), so `check:boundaries`' exit code
is unaffected either way — but the violation count is a real, visible regression that A doesn't
have. **To reach lint parity with A, B would need its own `EXTRA_TO_EXEMPT` entry for
`^src/assistant/public/tool-contributions\.ts$`** — which the brief's description of B never
mentioned adding, and which, if added, is strictly more moving parts than A for the same outcome
(new file + new alias + still needs the same allow-list entry A uses alone).

## 3. Typecheck — `npx tsc --noEmit -p tsconfig.json`

- Baseline: clean.
- Approach A: clean, **after fixing my own mistake** — see §6.
- Approach B: clean immediately, no gotcha.

## 4. Import cost — fresh `tsx` subprocess, in-process timing, 5 runs each

All paths below resolve to the same physical bytes whichever specifier string names them — a
`package.json` alias costs nothing extra at import time, it's a static string substitution the
module resolver does before any code runs. Benchmarked by absolute file path for a clean A/B
comparison.

| condition | runs (ms) | median ms | RSS range (MiB) |
|---|---|---:|---|
| bare node+tsx boot (no target import) | — | 0 (n/a) | 83.0–84.0 |
| `tool-contribution-registry.ts` (pre-change, either approach's ultimate leaf) | 15.5, 16.9, 18.9, 22.6, 26.3 | **18.9** | 79.1–84.4 |
| Approach A narrow specifier (`tool-contribution-registry.ts`, post-change) | 7.9, 8.0, 8.9, 10.0, 10.2 | **8.9** | 83.7–85.8 |
| Approach B narrow specifier (`public/tool-contributions.ts`, one hop) | 8.4, 8.8, 9.9, 10.3, 54.3* | **9.9** | 82.7–86.3 |
| full barrel, pre-change | 1680.7, 1792.7, 1957.6, 2816.0, 3702.5 | 1957.6 | 128.3–135.0 |
| full barrel, post-Approach-A | 511.6, 512.6, 593.8, 691.8, 731.0 | 593.8 | 128.0–137.8 |
| full barrel, post-Approach-B | 444.98, 459.4, 468.4, 475.4, 794.6* | 468.4 | 131.7–135.4 |

\* one cold-start outlier per set, consistent with filesystem/session cache variance, not a
component of either approach's actual cost — the other 4 runs in each set are tight.

**Reading this:** A's narrow specifier and B's narrow specifier are statistically indistinguishable
(8.9 ms vs 9.9 ms median, ~1 ms apart, well inside run-to-run noise) — the extra re-export file B
adds is a genuine leaf with zero runtime deps of its own, so hopping through it costs nothing
measurable. The pre-change vs post-change full-barrel numbers moved a lot in absolute terms (1957 ms
→ ~530–600 ms), but that drop is **the same 2-line removal in both A and B** (both experiments end
with the same lighter `index.ts`), and the swing is at least partly session load — this environment
had 6 other agents active throughout the run. RSS is the steadier signal and tells the same story:
narrow imports sit at ~83–86 MiB (essentially just the Node+tsx floor), full-barrel imports sit at
~128–138 MiB regardless of which approach shrank it. **Your prior holds: A and B do not differ
meaningfully on runtime cost.**

## 5. Blast radius

| | Approach A | Approach B |
|---|---:|---:|
| files touched | 27 | 28 |
| new files created | 0 | 1 (`src/assistant/public/tool-contributions.ts`, 10 lines) |
| lines changed (`git diff --stat`) | 38 insertions(+), 37 deletions(−) | 43 insertions(+), 36 deletions(−) |
| config files touched | `.dependency-cruiser.cjs` (1 array entry) | `package.json` (1 `imports` entry) |

Both touch the identical 25 caller files + `src/assistant/index.ts`. A's only other touch is the
allow-list array. B's other touches are the new file plus the `package.json` alias declaration.

## 6. What broke or surprised me

- **My own mistake, not a design flaw:** `#src/*` in `package.json` is a *wildcard* pattern
  (`"#src/*": "./src/*.ts"`) — every existing `#src/...` specifier in this codebase omits the `.js`/
  `.ts` extension (`#src/assistant/index`, `#src/core/runtime-mode`, etc.), because the wildcard's
  `*` capture gets `.ts` appended by the mapping itself. I first wrote Approach A's new specifier as
  `#src/assistant/tool-contribution-registry.js` (matching the `.js`-suffixed convention used in
  *relative* imports elsewhere in this codebase), which produced a doubled extension
  (`tool-contribution-registry.js.ts`) and 25 `TS2307: Cannot find module` errors. Fixed by dropping
  the `.js` suffix to match the existing `#src/...` convention; typecheck went clean immediately
  after. Approach B's alias is a single exact-string key (not a wildcard), so it has no such trap —
  worth noting as a small, genuine ergonomics point in B's favor for whoever writes the specifier by
  hand, even though it didn't change either approach's final measured outcome.
- **`emit-dist-package-json.mjs` handles the new alias correctly, verified by actually running it**
  (not just reading the code, per the brief's explicit ask): it iterates `Object.entries(rootPkg.
  imports)` generically and retargets any `.ts`-suffixed value to `.js`. Ran it against Approach B's
  `package.json` and got exactly the expected `dist/package.json`:
  ```json
  "imports": {
    "#assistant/tool-contributions": "./src/assistant/public/tool-contributions.js",
    "#src/*": "./src/*.js"
  }
  ```
  No special-casing needed, nothing to fix. (Cleaned up the resulting `dist/` — it's gitignored and
  never touched tracked state.)
- **The `no-deep-imports:assistant` lint hit on B was not anticipated by the brief's description of
  Approach B** — the brief describes B as "declared capability entrypoint" without mentioning a
  dependency-cruiser change, and it reads as though the `package.json` alias is itself the
  enforcement mechanism. It isn't, for this specific lint rule: dependency-cruiser resolves the
  specifier back to a concrete file path before evaluating any rule, so `#assistant/tool-
  contributions` and a hand-written relative import to the same file are indistinguishable to it.
  This is worth flagging clearly since it's the single most actionable finding in this report.
- **Codex's fuller proposal (`check-public-imports.ts`, a new *blocking* gate with `ARCH-PUBLIC-*`
  diagnostics) was not built** — the dispatch brief's description of Approach B is a trimmed version
  (alias + file move only), and that's what was measured. If the fuller version is ever wanted, it
  would need its own measurement pass; nothing here should be read as having tested it.
- Nothing else broke. Both experiments reverted cleanly; `git status` was empty before Approach A,
  before Approach B, and after Approach B — no cross-contamination between runs.
