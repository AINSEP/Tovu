# Consensus Report

**Date:** 2026-08-27
**Prompt:** How should Tovu's `src/` tree be organized once it relocates under `apps/website`, and how should the sibling Tovu-Runner desktop app be structured to consume it?
**Context Packet:** `ADS-memory/reports/swarm-consensus/context/CTX-tovu-apps-website-restructure-2026-08-27.md`
**Mode:** debate
**Controls:** `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300`, `codex_model=gpt-5.6-sol (xhigh)`, `gemini_model=Gemini 3.1 Pro (High)` and `Gemini 3.7 Flash (High)` (two separate agy dispatches)
**Primary model:** Claude Opus 5 (host)

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | claude (host) | — | Claude Opus 5 (1M context) | 2.1.221 | host session | Responded (2 rounds) | 2 |
| Addition | claude (Agent tool) | opus | Claude Opus 5 | — | same-family helper, non-voting in agreement math | Responded (2 rounds) | 2 |
| Peer | codex | gpt-5.6-sol | gpt-5.6-sol (xhigh) | codex-cli 0.149.0 | saved_codex_report, corroborated live | Responded (2 rounds) | 2 |
| Peer | agy | Gemini 3.1 Pro (High) | gemini-3.1-pro-high | agy 1.1.20 | local_default, exact command_model | Responded (2 rounds) | 2 |
| Peer | agy | Gemini 3.7 Flash (High) | gemini-3.7-flash-high | agy 1.1.20 | verified live via `agy models` | Responded (2 rounds) | 2 |

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| codex | json | `item.completed` / `agent_message` | empty both rounds | 0 retries; `--ignore-user-config` required per-tool MCP approval overrides to reach codebase-memory-mcp (proven via smoke test before dispatch) |
| agy (both models) | text | full stdout, ANSI-stripped | none observed | 0 retries; run from `/tmp` to avoid `AGENTS.md` pickup |

Handshake: proven via live smoke test per peer before Round 1 dispatch (real `codebase-memory-mcp` tool calls returning correct node/edge counts for the `Tovu` project), used in place of a separate ACK-only probe call.

## Debate Trace

**Round 1 (blind):** all five participants answered independently from the same neutral packet, none seeing another's answer. Four of five converged unprompted on a refined Option A (one `apps/website` app, domain modules organized internally, AI as an inverted adapter, Tovu-Runner keeps spawning Tovu as a subprocess). The Addition subagent went substantially further: verified nine corrections to the packet's own framing via direct source reads (not opinions) — most consequentially, that renaming `src/` breaks Tovu-Runner's hardcoded `dist/src/cli/main.js` path in both `tovu-cli.ts` and `stage-tovu-runtime.mjs`, independently confirmed true by the Primary via `grep` before reporting it.

**Round 2 (informed):** all five read every Round 1 answer in full. Key movement:
- Gemini 3.1 Pro reversed its Round 1 proposal to add `@tovu/website` as a `file:` npm dependency in Tovu-Runner, after Codex and the Addition subagent identified a verified native-ABI hazard (`better-sqlite3` version mismatch, `electron-rebuild` postinstall hook). Converged instead on Codex's "runtime capsule" idea — Tovu builds a versioned, self-contained bundle; Runner never imports it.
- The Addition subagent self-corrected its own Round 1 answer twice: reversed its sequencing recommendation (originally "reorganize first, rename last"; in Round 2 argued "rename first" based on a dependency-cruiser rule-anchor argument), and found its own proposed Tovu-Runner fix (`Runner reads bin.tovu from Tovu's manifest`) would not work in packaged mode, supplying a corrected two-branch fix that converged with Codex's independently-proposed `runtime-manifest.json`.
- Codex and Gemini 3.1 Pro both responded to the Addition subagent's *Round 1* sequencing argument (reorganize-first) and endorsed it — without having seen the Addition subagent's own Round 2 reversal away from it, since all Round 2 dispatches ran in parallel from the same packet. This produced a genuine split: 3 of 4 non-Primary voting positions (Codex, Gemini 3.1 Pro, Gemini 3.7 Flash) hold "reorganize first, rename last"; only the Addition subagent (non-voting in agreement math) holds "rename first."
- All five affirmed the AI-adapter inversion is independent of the folder decision and should start immediately, and endorsed relocating `theme-archive` out of the deployable tree entirely.

## Individual Responses

### Claude Opus 5 (Primary)
Round 1: rejected Option B on absent second-consumer evidence; held Tovu-Runner's spawn model on ABI/isolation grounds; low confidence on Runner's own internal structure. Round 2: held the core call, adopted the Addition subagent's "contract-first" reframe as the organizing principle, flagged the sequencing question and the Gemini 3.1 Pro `file:`-dependency tension for peer resolution rather than resolving them unilaterally.

### Addition (Claude Opus 5 subagent)
The most evidence-dense participant across both rounds — corrected the Coordinator's own packet twice (the refactor is 4 commits in, not "halted"; the Tovu-Runner breakage bug), and corrected itself twice in Round 2 (sequencing reversal; its own proposed fix's packaged-mode gap). Introduced "Option D" (contract-and-boundary fixes are independent of the folder question and should be sequenced first) — adopted by every other participant in Round 2 without dissent.

### Codex GPT-5.6-sol (xhigh)
Converged on a "modular monolith" / "runtime capsule" framing closely matching the Addition subagent's Option D. Provided the only fully-specified Tovu-Runner internal tree in Round 1 that named the `main/runtime/` split later adopted cross-participant. Reversed its own Round 1 migration order in Round 2 after reading the Addition subagent's Round 1 evidence, landing on reorganize-first.

### Gemini 3.1 Pro (High)
Strongest self-correction of the round: reversed its own `file:`-dependency proposal after peer pushback identified a concrete ABI hazard, and converged on the runtime-capsule alternative. Explicitly agreed with reorganize-first, citing the Addition subagent's Round 1 reasoning.

### Gemini 3.7 Flash (High)
Most complete literal Tovu tree in Round 1 (independently arrived at the same `capabilities/inbound/outbound/runtime`-shaped layout Codex separately produced). Originated the OpenAPI-codegen alternative to a hand-authored shared-types package, later refined by the Addition subagent into a two-precondition gate rather than an unconditional adoption.

## Synthesis

### Agreement (5 of 5, unprompted convergence)
- Reject Option B (separate top-level package for domain modules) — no real second consumer exists today; the entire cross-app import demand measured out to one dead alias and one 3-usage function.
- One `apps/website` app, one deployed process — do not split public/admin into separate services.
- Tovu-Runner keeps spawning Tovu as a subprocess — never imports it as a library or workspace-links it. (Refined in Round 2: the artifact it spawns should be a Tovu-built, versioned, non-importable bundle rather than today's ad hoc `dist/` + scraped `node_modules` copy.)
- `theme-archive` relocates out of the deployable app tree entirely (test fixture, zero `.ts` files, called "dead artifacts" in the repo's own docs).
- AI/assistant exposure should be inverted to an explicit adapter pattern (domains declare tool contributions; a composition root registers them) rather than the current 25-68 files importing the assistant runtime directly. This fix is independent of every other decision in this debate and should start immediately.
- The verified Tovu-Runner path-breakage bug (`dist/src/cli/main.js` hardcoded in two places) must be fixed no later than the rename, via a manifest Tovu emits and Runner reads — not a hardcoded path.

### Divergence
**Sequencing — rename `src/`→`apps/website` before or after the internal reorganization?** 3 of 4 voting non-Primary positions (Codex, Gemini 3.1 Pro, Gemini 3.7 Flash) hold reorganize-first; the non-voting Addition subagent holds rename-first, based on a real but self-flagged "closest call of the five" argument with an unmeasured gap (whether the 2,252 external `src/` references are mostly prefix-only or contain a material share of deep interior paths). **Resolved for the Final Recommendation below in favor of reorganize-first** — three independently-reasoned peers converged on the same underlying mechanism (a rename only changes a dependency-cruiser rule's path anchor, never its name, so the violation census stays a clean identity comparison only if reorganization — which does change rule names — happens first and separately).

**Where genuinely-shared, non-published code lives.** Narrowed materially across rounds but not fully closed: Gemini 3.1 Pro's original hand-authored `packages/contracts/` was effectively withdrawn in favor of Gemini 3.7 Flash's OpenAPI-codegen idea, which the Addition subagent then gated on two measurable preconditions (near-100% path coverage, response-body schema verification — currently 40% and unverified respectively). Until those preconditions are met, no shared package should be created.

**Folder naming for the domain-slice layer** (`capabilities` vs `domains` vs `modules` vs `features`) was not independently re-tested by both Gemini peers in Round 2 — only Codex and the Addition subagent explicitly converged on `capabilities`/`inbound`/`outbound`. The user separately requested `features` after reviewing the tree; adopted in this report on the strength of matching Tovu's own existing convention (25+ slices already live under `src/features/` today) and better fitting what the debate concluded these are (non-extractable vertical slices of one app, not independent capabilities) — not something any peer explicitly ranked against alternatives.

### Unique Insights
- The build script's `rm -rf` cleanup list references four directories (`dist/src/themes`, `templates`, `public`, `agent-plugins`) that no longer exist — dead tooling drift left over from an earlier, unrelated move, found and verified only by the Addition subagent.
- `apps/admin/src/lib/api.ts`'s HTTP client has the single highest fan-in of any function in the entire codebase graph (186) — raised only by the Addition subagent as the actual highest-value target for OpenAPI codegen, separate from the shared-DTO question the packet originally asked.
- 10 files bypass `packages/sdk`'s own export map via relative deep-imports into `packages/sdk/src/index.js` — a live boundary violation today, independent of this debate's outcome, that becomes a hazard the moment `src/` moves (its relative depth changes; `packages/sdk` does not move).

### Decision Ledger

| Decision Point | Claude Opus 5 (Primary) | Addition (Opus 5) | Codex (xhigh) | Gemini 3.1 Pro | Gemini 3.7 Flash | Agreement | Key Why / Movement |
|---|---|---|---|---|---|---|---|
| Reject Option B | Yes | Yes | Yes | Yes | Yes | Yes (5/5) | No measured second consumer; converged independently in Round 1 |
| One `apps/website`, one process | Yes | Yes | Yes | Yes | Yes | Yes (5/5) | Matches current runtime reality; unanimous |
| Runner: spawn, never import | Yes | Yes | Yes | Yes (reversed to this in R2) | Yes | Yes (5/5 after R2) | Gemini 3.1 Pro's `file:` proposal withdrawn after ABI hazard identified |
| AI adapter inversion, do now | Yes | Yes | Yes | Yes | Yes | Yes (5/5) | Independent of folder decision; existing composition root found |
| Fix Runner path bug before/with rename | Yes | Yes (revised fix) | Yes | Yes | Yes | Yes (5/5) | Verified by Primary via direct source read, not opinion |
| Sequencing: reorganize-first vs rename-first | Deferred to peers in R2 | Rename-first (self-reversed, flagged as weakest position) | Reorganize-first | Reorganize-first | Reorganize-first | No (3/4 voting) | Resolved reorganize-first in Final Recommendation — convergent mechanism argument from 3 independent peers |
| Shared code: new package vs. codegen-gated | No new package | No new package | Codegen, no new package | Withdrew own package proposal | Originated codegen idea | Yes (5/5, after R2 convergence) | Gated on 2 measurable preconditions, not yet met |
| Domain-slice folder name | `features` (user decision, post-debate) | `capabilities` (R2) | `capabilities` (R1/R2) | `modules`/`adapters` (unrevised) | `domains` (R2, drifted from R1 `modules`) | No | Not independently re-tested across all peers; resolved by user preference + existing-convention argument |

### Unresolved Deltas
- Whether the 2,252 external `src/` references are mostly prefix-only (favors reorganize-first) or contain a material share of deep interior paths (would favor rename-first) — flagged by the Addition subagent as the one measurement that would settle the sequencing question empirically, not yet taken.
- Whether a `file:`-style dependency can be made structurally non-importable via a dependency-cruiser rule alone (Codex's and the Primary's residual doubt) versus requiring a fully separate build artifact (the converged position) — an actual `npm install` experiment was proposed but not run.
- Whether Tovu-Runner's `main/` deserves the full `fleet/agent/runtime/security` split now, or just the two uncontested renames (`shell`→`contracts`, `preload` extraction) with the rest deferred until the codebase grows past its current 23 files — flagged explicitly as an open call by three participants, not adjudicated.

## Final Recommendation

**Adopt the refined Option A monolith, with `features/` as the domain-slice folder name, sequenced reorganize-first-then-rename, per the phased plan below.**

### Phase 0 — do immediately, independent of everything else, low risk, high confidence (5/5 or verified-fact backed)
1. Convert the 10 relative deep-imports of `packages/sdk/src/index.js` to `@tovu/sdk`.
2. Invert AI/assistant tool registration: domains return `ToolRegistration[]` (or Codex's richer `AgentOperation` shape, which adds `requiredPermission` and `risk` per operation); a composition root (the existing `installFirstPartyToolContributors`) does the registering. Add one dependency-cruiser rule forbidding the reverse import.
3. Fix the Tovu-Runner path-breakage bug: Tovu emits a manifest (`runtime-manifest.json` or equivalent) carrying at minimum `{cliEntry, tovuVersion, tovuSha, minNodeMajor, schemaVersion}`; Runner reads it instead of hardcoding `dist/src/cli/main.js`. This must work in both dev (sibling checkout) and packaged mode (today's staged tree has no manifest — this is new, not existing, in packaged mode).
4. Record a fresh dependency-cruiser violation census (currently 92 = 10 errors + 82 warnings, per-rule) as the baseline every subsequent step is checked against.

### Phase 1 — reorganize under the existing `src/` name (paths stay stable, only structure changes)
5. Finish consolidating the domain layer into one home — resolve the split between the 25 slices under `src/features/` and the 8 top-level siblings (`analytics`, `assistant`, `identity`, `media`, `navigation`, `origin`, `seo`, `widgets`) into `src/features/*` uniformly, using the name the user selected.
6. Split `src/server/` internals along the inbound/outbound direction Codex specified: `inbound/{public-http, admin-http, cli, assistant}`, `outbound/{persistence, mail, oauth, connectors, filesystem, processes}`, `runtime/{composition, boot, configuration, lifecycle}`.
7. Move `assistant/` to live beside `inbound/` (an adapter, not a domain).
8. Relocate `theme-archive` to `development/fixtures/theme-archive/` (4 test-file path updates).
9. Re-measure the violation census after every ownership unit moves — a rule that stops firing must be traced to a fix, never assumed.

### Phase 2 — the mechanical rename, isolated
10. `src/` → `apps/website/src/`, as one commit that changes nothing else: `#src/*` alias target in `package.json`, `tsconfig.json` `rootDir`/`exclude`, `eslint.config.mjs`, `biome.json`, `Dockerfile`, the ~12 hardcoded `src/` literals in the `build` script (including deleting the 4 already-dead `rm -rf` targets found this session), and the ~40 `dependency-cruiser.cjs` guard path literals.
11. Re-run the violation census; it should be identical, because Phase 1 already absorbed every rule-name change.
12. Verify `tsc`, the build, and a Tovu-Runner launch against the renamed tree before merging.

### Phase 3 — Tovu-Runner side, paired with or immediately after Phase 2
13. Apply the uncontested renames: `shell/` → `contracts/` (and its `project-registry.ts` → `contracts/project.ts`, to remove the basename collision with `main/project-registry.ts`), extract `preload.mts` into its own folder.
14. Defer the `main/{fleet,agent,runtime,security}` subdivision until `main/` grows past its current 23-file scale, per the explicitly-flagged open call — the two renames above capture nearly all the value at a fraction of the churn.
15. Replace `stage-tovu-runtime.mjs`'s hand-rolled dependency scraping with a versioned runtime bundle that Tovu's own build produces and Runner consumes read-only — never an importable `node_modules` entry.

### What would revise this recommendation
- A measurement of the prefix-vs-deep split in the 2,252 external `src/` references could flip Phase 1/Phase 2's order.
- A successful `npm install` experiment proving a `file:` Tovu-Runner dependency can be made structurally non-importable would reopen the Phase 3 packaging question.
- OpenAPI path coverage reaching ~100% with response-body schema verification would justify starting codegen for `apps/admin`'s API client — the actual highest-value shared-code target found this session, not the DTO-sharing question the original packet asked.
