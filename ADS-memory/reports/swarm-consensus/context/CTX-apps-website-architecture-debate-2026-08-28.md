# Swarm Consensus Context Packet

**Date:** 2026-08-28
**Slug:** apps-website-architecture-debate
**Project Type:** brownfield
**Question:** Is the code in `apps/website/src` (a Node/TypeScript/Express backend) actually well-built by professional engineering standards, across 16 named quality dimensions? Where are the real problems, how severe are they, and what would you do about them?
**Intended Consumers:** Primary model + peer CLIs (agy/Gemini x2, Codex)

## Goal
An independent, adversarial second opinion on code quality in `apps/website/src`, to decide whether the codebase needs targeted fixes, a moderate refactor pass, or something more structural — and to produce concrete, ranked proposed fixes for whatever is actually wrong. This is Round 1 of a debate: answer independently, from the data below. You will see other participants' reasoning in Round 2.

## Scope
**In scope:** `apps/website/src` only (a large, brownfield, actively-developed TypeScript/Express backend — ~1,908 modules, ~1,431 source files by one measure). Node.js CLI product ("Tovu"), Express-based HTTP server, SQLite/Postgres persistence via Drizzle ORM, a plugin/agent-tool system on top.

**Out of scope for this debate:** `apps/admin` (a separate React SPA), `apps/site-chat`, `development/` tooling, `AI-Dev-Shop/` (this orchestration framework itself). Do not propose fixes to those.

## Architecture Summary
Composition-root / ports-and-adapters style: business logic in `features/*` (39 subdirectories) takes typed port interfaces; concrete adapters (SQLite repos, HTTP client, mailer, blob store) are constructed in `server/runtime/composition/{app.ts,deps.ts}`. HTTP routes live in `server/inbound/admin-http/routes/*` and `server/inbound/public-http/`. 26 of ~40 top-level domains have a committed `INFO.md` describing their own architecture/known limitations. The codebase was recently reorganized (branch `restructure/apps-website-phased`) — files moved internally (e.g. `server/app.ts` → `server/runtime/composition/app.ts`), and git's own rename detection could not bridge some of those moves (confirmed: `git log --follow` on old paths returns nothing for several files) — so any git-history-based analysis (churn, hotspots, "who touches what together") may undercount files that were heavily reorganized.

## 16 Dimensions To Evaluate
1. Blast radius of a change (how far does breaking one thing spread)
2. Tangled/coupled code generally
3. Dependency injection usage — done well or done badly?
4. Modularity — does code stay inside its stated domain boundaries?
5. Cyclomatic complexity
6. Cognitive complexity (how hard is it to hold in your head, distinct from cyclomatic)
7. Coupling & cohesion — fan-in/fan-out specifically
8. Duplication — copy-pasted logic vs. shared code
9. Churn × complexity ("hotspots" — frequently-changed AND complex files, the highest-risk combination)
10. Circular dependencies / layering violations
11. Test coverage, especially cross-referenced against which complex files have thin coverage
12. File/function size (raw LOC as a cheap complexity proxy)
13. Dead code / unused exports
14. Type safety gaps (`any` usage, weak/loose TypeScript)
15. API surface size per module (bigger public surface = harder to change safely)
16. Change coupling — files that are always edited together despite no direct import link (a hidden-dependency signal invisible from imports alone)

## Relevant Files And Artifacts
| Path | Why it matters |
|---|---|
| `apps/website/src/**` | The actual code under review — read whatever files you want, at whatever depth helps you form a real judgment, not just the excerpts below |
| Raw metrics (embedded below, full data also in this packet's directory as `code-metrics.md`) | Cyclomatic/cognitive complexity, duplication, coupling, cycles, churn, coverage — all machine-measured, tool + command recorded for every number |
| 26 `INFO.md` files (staged alongside this packet) | Each top-level domain's own committed description of what it owns and its known limitations — a fast map into the codebase, but not a substitute for reading real source when you want to verify a claim |

**File access note:** you have the FULL `apps/website/src` tree available (either via real repo access at `/Users/la/Programming/Tovu`, or a staged full copy — see your dispatch instructions for which applies to you). Read as much or as little as you need; the summary above is a starting point, not a ceiling.

## Constraints
- This is a real, actively-developed product, not a greenfield exercise. Any fix must be proportionate — do not propose a rewrite unless the evidence genuinely demands it.
- Historical note, stated for context only, not as a lean: an earlier internal review (2026-08-16/17) concluded "targeted decoupling, not a rewrite" was correct at that time, fixed the single worst circular-dependency edge, and reduced import-propagation cost from ~29% to ~10.5%. The product owner has since explicitly stated a full rewrite is back on the table if the evidence supports it ("nobody is using the product yet, this may be the cheapest moment to restructure") — so do not self-censor a rewrite recommendation if you believe the evidence calls for one. Form your own view from the current data; do not defer to the prior conclusion.
- Standard engineering constraints apply: correctness first, changes should be testable and reversible, prefer the smallest change that actually fixes the problem.

## Known Unknowns
- Whether the "13 of 39 features have no `index.ts` public barrel" pattern is deliberate design or organic neglect is genuinely unclear from static analysis alone — form your own view.
- Coverage data (94.6% reported) only actually measures 585 of ~1,075 files in the lcov artifact; the remaining files are simply unmeasured, not necessarily untested or well-tested.
- Whether git's broken rename-tracking (see Architecture Summary) hides a genuinely different churn/hotspot ranking than what the raw numbers below show is unverified.

## Source-of-Truth Inputs
| Source | Notes |
|---|---|
| `development/scripts/code-metrics.py` | The tool that produced every number below — cyclomatic (lizard), cognitive (eslint-plugin-sonarjs), duplication (jscpd), type safety (type-coverage+grep), coupling/cycles/blast-radius/API-surface (dependency-cruiser), churn/hotspots/change-coupling (git log, parsed in-script), coverage (existing lcov, not regenerated) |
| Dead-code metric | NOT measured in this run (a `knip --directory` invocation fails on this repo's non-workspace layout — a tooling gap, not a data point). Do not treat "no dead-code number" as "no dead code exists." |

## Shared Prompt Payload

You are one of several independent reviewers in a blind first round of a structured debate. Do not assume any of the other reviewers' conclusions — you have not seen them yet.

**Raw measurements** (from `development/scripts/code-metrics.py`, run 2026-08-28 on `apps/website/src`, commit `40e1294e`):

- **Complexity (lizard):** 18,752 functions analyzed across 1,431 files. Median CCN 1, p90 3, p99 9, max 63. 87 functions score over CCN 10, 7 score over CCN 20. Worst: `server/inbound/public-http/http/site/render.ts#safeImageSrc` (CCN 63), `server/runtime/composition/modules/assistant-ag-ui.ts#translateAgentEventToAgUi` (CCN 61), `platform/oauth/discovery.ts#parseWwwAuthenticateScopes` (CCN 42), `features/external-mcp/save-form.ts#mergeExternalMcpSavePrefill` (CCN 34), `features/deployments/static-publish/s3-compatible-target.ts#classifyManifestWriteResponse` (CCN 30). Longest function: `render.ts#safeHref`, 944 lines. Biggest file: `features/theme/theme.ts`, 1,388 lines.
- **Cognitive complexity (eslint-plugin-sonarjs, censored sample — only functions already breaching the repo's configured threshold are counted, not a full distribution):** 13 functions breach, 9 files affected, median-of-breaching 21, max 36. Worst: `features/external-mcp/save-form.ts:108` (36), `features/skills/tool-registrations.ts:243` (21), `platform/db/migration/manifest.ts:691` (21), `features/agent-plugins/activation.ts:170` (16), `features/comments/ingress.ts:75` (16).
- **Duplication (jscpd, min-tokens 50, generated files excluded — drizzle migration snapshots, dist, .vite):** 7.99% of lines duplicated, 23,957 duplicated lines of 300,016 total, 2,230 clone pairs. Largest single clone: 100 lines (`features/seo/types.ts` ↔ `server/inbound/public-http/http/site/page-head.ts`).
- **Type safety (grep-based):** 1,532 explicit `any`, 21 `@ts-expect-error`, 0 `@ts-ignore`, 0 non-null assertions (`!`).
- **Coupling (dependency-cruiser):** 1,908 modules, 8,929 edges (1,472 via barrel/index files). Max fan-out 138 (`server/runtime/composition/app.ts` — the composition root, expected to be high). Highest real app-code fan-in: `server/inbound/admin-http/dev-auth.ts` at 251 (everything-else fan-in numbers over that are test-harness/stdlib noise, e.g. `assert/strict`/`node:test` at 646 each — not application coupling).
- **Blast radius (transitive dependents via dependency-cruiser):** widest is `@jini-ai/cms/core` (1,180 transitive dependents), then `platform/db/schema.ts` (784), `platform/db/sqlite/content-db.ts` (776), `contracts/core/tool-surface-exchanges.ts` (677), `contracts/core/commands/index.ts` (675).
- **Circular dependencies (dependency-cruiser + DFS):** 7 distinct cycles found, longest chain 5 modules. All 7: `assistant/tool-registrations.ts → features/identity/tool-registrations.ts → assistant/index.ts → assistant/byok-tool-surface.ts → assistant/tool-registrations.ts`; `assistant/tool-contribution-registry.ts → assistant/tool-registrations.ts → features/identity/tool-registrations.ts → assistant/index.ts → assistant/tool-contribution-registry.ts`; `features/theme/theme.ts → features/theme/theme-files.ts → features/theme/theme.ts`; `assistant/tool-contribution-registry.ts → assistant/tool-registrations.ts → assistant/tool-contribution-registry.ts`; `features/media/index.ts → features/media/bootstrap.ts → features/media/index.ts`; `server/inbound/public-http/http/site/render.ts → .../handlebars-sandbox.ts → .../worker-sandbox.ts → (back into render.ts's chain)`; `server/runtime/composition/app.ts → server/runtime/composition/deps.ts → server/runtime/composition/app.ts`. `.dependency-cruiser.mjs` has a cycle rule (added as `warn` this same day, 35 known raw violations, un-triaged).
- **API surface (proxy metric, weak by the tool's own admission — treat the count below as more reliable):** 13 of 39 `features/` subdirectories have no `index.ts` public barrel at all (agent-plugins, database, external-mcp, identity, plugin-runtime, plugins, recovery, site-evidence, site-glue, skills, tool-audit, widgets — plus `__tests__` which isn't a real feature). The other 26 do.
- **Churn (git log, 12-month window, 1,002 total commits, 930 after excluding mechanical rename/codemod/format commits):** most-changed substantive files (commit count / lines changed): `server/app.ts` 76/1,779 (⚠️ this old path no longer exists — moved to `server/runtime/composition/app.ts`, see Architecture Summary), `server/routes/types.ts` 67/2,205, `server/deps.ts` 60/1,259 (⚠️ old path), `server/http/site/render.ts` 48/3,713 (⚠️ old path — now `server/inbound/public-http/http/site/render.ts`), `assistant/tool-registrations.ts` 39/2,215, `features/theme/theme.ts` 28/2,476, `features/deployments/publish-agent-tools.ts` 25/3,280.
- **Hotspots (churn × max function complexity in file):** top-scored: `features/theme/theme.ts` (28 commits, max CCN 9, score 252), `features/theme/static-render.ts` (20 commits, max CCN 11, score 220), `features/deployments/publish-agent-tools.ts` (25 commits, max CCN 8, score 200), `server/__tests__/assistant-proxy-routes.test.ts` (8 commits, max CCN 20, score 160), `features/deployments/static-publish/s3-compatible-target.ts` (4 commits, max CCN 30, score 120).
- **Change coupling (co-change pairs with NO direct import link between them — hidden coupling invisible to static analysis, min 4 co-changes):** 106 pairs found. Strongest: `server/app.ts` ↔ `server/deps.ts` (45 co-changes, 77.6% confidence — ⚠️ both old paths), `server/deps.ts` ↔ `server/routes/types.ts` (41, 70.7%), `assistant/tool-registrations.ts` ↔ `server/tool-catalog-manifest.ts` (15, 83.3%), `server/routes/admin/presentation/get.ts` ↔ `.../patch-active-theme.ts` (6, 100%).
- **Coverage (existing lcov artifact, NOT regenerated for this run — read-only, 7.8 days old):** 94.57% line coverage, but only over 585 of 1,075 files in the artifact — the rest are simply absent from the measurement. Complex files with NO coverage data at all (not "0% covered", genuinely absent from the artifact): `render.ts` (CCN 63), `assistant-ag-ui.ts` (CCN 61), `oauth/discovery.ts` (CCN 42), `external-mcp/save-form.ts` (CCN 34), `oauth/token-endpoint.ts` (CCN 25).

**26 `INFO.md` files are staged alongside this packet** (see file list in your dispatch instructions) — read these as your map of what each domain is SUPPOSED to be, then compare against actual code.

**Your task:**
1. Evaluate all 16 dimensions above using the raw data, the `INFO.md` files, and (if your transport allows) direct repo reads.
2. Identify the real, concrete problems — cite specific files/functions, not generalities. A vague "complexity is high" is not useful; "function X at file:line does Y, here's why that's a real risk" is.
3. Name what's genuinely fine and should NOT be touched — an audit that finds nothing good is not credible.
4. State an overall verdict: is this codebase in fundamentally sound shape needing only targeted fixes, does it need a moderate refactor pass, or does it need something more structural (up to and including a partial rewrite of specific subsystems)? Defend your verdict with evidence, not vibes.
5. **Blind Spots (required):** name (a) a dimension or angle this packet did not think to ask about, (b) a question we should be asking but aren't, (c) the single assumption in this framing most likely to be wrong.

Do not propose specific code-level fixes yet — that comes in Round 2, once you've seen other reviewers' independent findings. For now, focus on accurate, well-evidenced diagnosis and an overall severity verdict.

End your response with the marker `<<SWARM_END>>` on its own line.
