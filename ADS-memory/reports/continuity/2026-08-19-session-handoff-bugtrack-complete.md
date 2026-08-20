# Handoff — Tovu, 2026-08-19

**Target:** claude · **Branch:** `general-work` @ `55380bbd` (pushed; `origin/main` is 6 behind)
**Focus:** finish the architecture debate's plan (steps 2-3), then the two small cleanups.

---

## ⛔ READ FIRST — two facts that change what you'd otherwise do

1. **GitHub Actions is billing-blocked and we are NOT using it.** Jobs die in ~3s with "recent account
   payments have failed or your spending limit needs to be increased," **zero steps executed**. `gh run
   list` shows a plain `failure` — the tell is 0 steps and seconds, not minutes. **Nothing in the repo
   can fix it. Do not dispatch anyone at it.** The owner explicitly chose to run CI locally instead:
   ```
   npm run ci:local          # all 8 gates, reports every one, ~4 min
   npm run test:rerun-failing # re-runs only what failed last
   ```
2. **The 11-context architecture rewrite is DEAD — unanimously, including its author.** Do not
   re-propose it. See `ADS-memory/reports/swarm-consensus/runs/2026-08-19-tovu-architecture-redesign-consensus.md`.

---

## State: everything is green and pushed

- **22 commits**, 103 files, +7023/-608. `git status` is clean of our work.
- **8/8 CI gates PASS** (verified at `55380bbd`).
- **0 failing tests.** Started the session at 75.
- **Uncommitted files in the tree belong to OTHER sessions** (ADR-013/049, theme-v2 progress ledger,
  4 admin plugin-catalog files, ~15 untracked ADS-memory reports). **Leave them alone.** They were
  accidentally `git stash`-ed once tonight and restored via `git stash apply stash@{0}`; that stash
  entry still exists as a safety net, alongside 3 older entries from other sessions.

## What got done — two separate workstreams, do not conflate them

### Bug track — COMPLETE
75 failing tests → 0. Then an external audit (Codex 5.6-sol xhigh) found 19 defects; four subagents fixed
all 19. Then **three independent auditors** (Sonnet 5, sol, terra — no communication) attacked those
fixes and found 7 gaps; all 7 are now fixed.

**Four genuine product bugs, not test problems:**
- GitHub publishing deleted every unrelated file on the target branch (had already run against a real repo)
- Unpublished pages stayed live on S3 indefinitely
- SEO (`<title>`, canonical, OG, JSON-LD) silently dropped on every static-tier page
- Export flagged every rendered page as unreferenced

Design record for the hardest piece: `ADS-memory/reports/continuity/2026-08-19-publish-manifest-hardening-handoff.md`

### Architecture track — STEP 1 OF 3 ONLY
A six-participant debate (Claude Opus 5, gpt-5.6-sol, gpt-5.6-terra, gemini-3.1-pro, gemini-3.7-flash,
Sonnet 5 subagent) unanimously rejected the 8-12 week rewrite. What survives is ~1.5 weeks.

| Step | Status |
|---|---|
| 1. Rename the metric, print membership | ✅ `bf24571c` |
| 2. Close boundary violations + widen the dependency-cruiser rule | ❌ **not started** |
| 3. Narrow `AssistantToolRegistryDeps` | ❌ **not started** |

---

## DO THIS FIRST — debate plan step 2

**9 `feature-no-express-or-admin-imports` violations remain, and they are WARNINGS, not errors.**

Verified facts (do not re-derive):
- `RouteDeps` is **already decomposed** — `src/server/routes/types.ts` exports **24 named capability
  slices**; `RouteDeps` is their intersection. Anyone proposing "decompose RouteDeps" has not read it.
- The gate is **half-blind**: `.dependency-cruiser.cjs:41` scopes the rule to `from: ^src/features`, so
  `src/assistant/`, `src/widgets/` and `src/export/` import server-owned types invisibly.
- The **correct pattern already exists** in `src/comments/tool-registrations.ts` and
  `src/features/post/tool-registrations.ts` — a locally-declared narrow interface. Copy it.
- **`features/deployments` genuinely CANNOT narrow directly.** `startExportRun` passes `routeDeps` to
  `runExportSite`, which boots a second in-process `createApp(routeDeps)`; a narrower type fails `tsc`
  because `runExportSite` is contravariant in its parameter. **The fix is to close over `RouteDeps` at
  the composition root and pass down a BOUND function** (`runSiteExport({outputDir, clean, basePath})`)
  so the domain never names `RouteDeps`.

Then widen the rule past `^src/features` and ratchet production violations to **0**.

**Step 3:** narrow `AssistantToolRegistryDeps`'s consumer signature one `contribute*Tools()` at a time.
**Do NOT touch the registry mechanism** — `src/server/tool-catalog-manifest.ts` already explicitly calls
all 25 contributors, and changing it risks reopening the assistant↔domain cycle that shape removed.

**Stopping rule the panel insisted on:** cap architecture work at 10-15 engineer-days. Then ship.
No content-model convergence, no bulk file moves, no contracts package.

## Also open (small)
- **A spec now contradicts the code.** `ADS-memory/specs/custom-publish-provider-contract.md` §7 says
  "no delete is the safer default" — that was the S3 bug. Reconcile it.
- **Strip or disable `.github/workflows/ci.yml`.** The owner wants this now that local CI is proven.
  Recommend disabling the triggers rather than deleting, so re-enabling is one line.
- **`origin/main` is 6 commits behind** `general-work`.

## Traps that cost real time tonight — carry these forward
- **Never `git stash` in any form.** The stash stack and working tree are shared with concurrent
  sessions. An auditor ran `git stash -u` for a clean baseline and swallowed 7 files of someone else's
  work. Recovery is `git stash apply` (never `pop`).
- **Never `git add -A`.** Two agents committing simultaneously produced a union commit (`8c7effea`)
  containing both their work. Do the `--cached` verification in the SAME command as the commit.
- **Do not trust this repo's code comments.** THREE confidently-worded, evidence-shaped comments were
  proven false tonight — including the one that rationalized the CRITICAL data-loss bug by citing a doc
  in `commit-site.ts` that does not exist. Put "verify against the source the comment cites" in briefs.
- **Never run the full test suite locally** — measured 5.4 GB across 13 workers. `TEST_CONCURRENCY=2`
  brings it to 0.42 GB. `ci-local.sh` already defaults to 2.
- **cbm-mcp reports `ready` with a matching `head_sha` while being stale.** Probe for a function you know
  landed recently before trusting it. Re-indexed today at `c600f219`.
- **`agy`/Gemini headless auto-denies every tool** — including MCP. Telling it a graph is "available"
  makes it try, and the whole response is lost at exit 0 with 0 bytes. Give it a no-tools preamble, or
  a read-only staged copy plus `--dangerously-skip-permissions`.
- **Subagents go idle without reporting.** Three did tonight with uncommitted work. Check `git status`
  before assuming failure.

## Next-agent opening prompt
> Read `AI-Dev-Shop/AGENTS.md` first, then
> `ADS-memory/reports/continuity/2026-08-19-session-handoff-bugtrack-complete.md`.
>
> GitHub Actions is billing-blocked — ignore it and use `npm run ci:local` (8 gates, currently all
> PASS). The tree is green at `55380bbd` with 0 failing tests.
>
> Continue the architecture plan at **step 2**: close the 9 remaining
> `feature-no-express-or-admin-imports` violations, widen `.dependency-cruiser.cjs`'s rule past
> `^src/features` (it currently cannot see `assistant/`, `widgets/`, `export/`), and ratchet production
> violations to 0. `RouteDeps` is ALREADY sliced into 24 capability interfaces — copy the narrow-deps
> pattern from `src/comments/tool-registrations.ts`. `features/deployments` cannot narrow directly
> (contravariance); pass it a bound `runSiteExport` function closed over `RouteDeps` at the composition
> root instead. Do NOT touch the tool registry.
>
> Uncommitted files in the tree belong to other sessions — stage explicit paths only, never `git add -A`,
> and never `git stash`.
