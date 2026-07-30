# ADR-PIPE-003: Site Install Dir — CLI Entrypoint, Site-Dir Domain, and the Workspace-Resolution Boundary

- Status: PROPOSED — **requires human architecture sign-off before implementation** (this project's human-checkpoint rule; do not dispatch Programmer on this ADR without that approval recorded — this remains true for the v1.1.0 revision below; the owner's override changes the recommended design, it is not itself the required architecture sign-off)
- Version: 1.1.0 (was 1.0.0)
- Date: 2026-07-28 (original); Revised: 2026-07-28 (same-day revision — see Revision Note)
- Spec: SPEC-003 v1.0.0 (hash: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142)
- Author: Software Architect Agent (v1.0.0); revised by Software Architect Agent per owner override (v1.1.0)

## Revision Note (v1.1.0 — 2026-07-28)

**Decided by:** Leon Aburime (owner), overriding this ADR's own v1.0.0 timing call.

**What changed:** v1.0.0 resolved Red-Team RT-006 / Article I by keeping hand-rolled `process.argv` parsing for v1's 2 commands, behind a concrete two-tier deferred-escalation trigger (Tier 1: `node:util.parseArgs`; Tier 2: `commander`, at ≥4 total commands or nested subcommands). The owner reviewed that decision and overrode its **timing**, not its candidate ranking: **`commander` is adopted directly in v1**, for both `init` and `serve`, rather than deferred behind either tier.

**Why:** (1) SPEC-005 (plugin system) is already committed roadmap and will add 3+ more CLI subcommands (`tovu plugin build`, `tovu dev --plugin`, `tovu hooks list`) — the growth this ADR's own Tier-2 trigger was watching for is not speculative, it is already scoped. (2) A separate desktop app, **Tovu-Runner**, is planned to programmatically fork and manage many independent Tovu site instances — this CLI will increasingly be invoked *programmatically* by another process, not just typed by a human, and structured/predictable argument parsing plus testable command definitions matter much more in that mode than in interactive human use. Both facts are now known, not hypothetical, so deferring further is no longer defensible under Article I's own logic (see the re-derived Constitution Check below) — it would mean hand-rolling a parser today for a surface everyone already knows is about to need a library, purely to preserve optionality that has no remaining value.

**What did not change:** The candidate ranking from v1.0.0 (`commander` preferred over `yargs` for its smaller transitive-dependency footprint) was re-verified against the current npm registry for this revision, not assumed to still hold — see Pattern Evaluation (A) below. The module-boundary decision (Pattern Evaluation (B)), the `server/deps.ts` workspace-id fix, and all four Critical Internal Constraints (U-001…U-004) are unaffected by this revision — none of them concern the CLI-parsing mechanism (confirmed by re-reading `critical-internal-constraints.md` in full; no edits were made to that file).

**Status:** This revision, like v1.0.0, still requires human architecture sign-off before implementation. See Status line above.

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | **COMPLIES** [REVISED v1.1.0 — was EXCEPTION (justified, growth-triggered) in v1.0.0] | v1.0.0 kept hand-rolled `process.argv` parsing for v1's 2 commands behind a deferred two-tier growth trigger, recorded as a justified EXCEPTION. **Re-derived, not just overridden:** Article I's own text reads "Complies if: No custom implementation exists where a maintained library... solves the same problem, *unless* the ADR carries a Complexity Justification entry for it" — i.e., COMPLIES is the *use-the-library* state; EXCEPTION is the *keep-the-custom-code-instead* state, and only that state needs justifying. This revision adopts `commander` (a maintained, widely-used library — re-verified zero-transitive-dependency at v15.0.0, see Pattern Evaluation (A)) for **both** `init` and `serve` in v1, per owner override, which eliminates the custom argv parser entirely. There is no remaining custom implementation of "a problem a library already solves well" to justify, so this is honestly COMPLIES, not an exception awaiting a future trigger. The trigger for making this call *now* rather than later is that SPEC-005's 3 additional commands and the Tovu-Runner desktop host's programmatic-invocation use case are committed, scoped facts as of this revision, not speculative ones — under Article I's own logic, adopting the library once its need is *known* (rather than deferring until the need *materializes*) is exactly what "no custom implementation... unless justified" asks for, not a departure from it. No Complexity Justification entry is required for Article I in this revision (see Complexity Justification section, updated below) — resolves Red-Team RT-006 by adoption rather than by a growth trigger. |
| II — Test-First | COMPLIES | No implementation exists yet. TDD Agent certifies failing tests from SPEC-003's ACs/INVs/ECs before Programmer writes `cli/`, `site-dir/`, or the `server/deps.ts` change. |
| III — Simplicity Gate | COMPLIES | Every new module below traces to a named REQ. No speculative generality: no multi-template gallery scaffolding (explicitly out of scope), no `tovu build` binary export (OQ-01, own spec), no template-upgrade machinery (OQ-03, own spec). |
| IV — Anti-Abstraction Gate | COMPLIES | No `TemplatePort` introduced — one template exists in v1, so the rule-of-two fails and the spec's own Agent Directive already forbids it. `resolveWorkspace` is a plain selector function, not a port with swappable adapters (no second implementation is on any roadmap). |
| V — Integration-First Testing | COMPLIES | All P1 ACs are CLI/process-level (spawn `init`/`serve` against temp dirs) or DB-boundary (workspace resolution, schema guard) — matches spec's own Constitution table. |
| VI — Security-by-Default | **EXCEPTION** (standing, carried) | Same standing constitution exception as every other v1 spec: no auth layer, `LOCAL_PROCESS` trust model. This ADR's compensating control is INV-01 (no writes outside the target install dir), encoded as a Critical Internal Constraint (U-004) with an observable path-containment test, since a future desktop-host caller (ADR-011) supplies the `dir` argument programmatically and deserves the same containment guarantee a human operator gets by construction. |
| VII — Spec Integrity | COMPLIES | This ADR and all downstream artifacts cite SPEC-003 v1.0.0, hash `sha256:c2547dc3…4614` (matches `pipeline-state.md`'s current `spec_hash`; the older `sha256:d8a65a90…c674` recorded in `red-team-findings.md`'s own header is the pre-RT-fix hash — superseded per `pipeline-state.md`'s "RT fixes APPLIED... Re-validated PASS" line). |
| VIII — Observability | COMPLIES | Every failure emits the single machine-parseable `tovu: <CODE>: <message>` stderr line + registry exit code (errors.spec.md); `serve` logs one boot line (dir, port, schemaVersion, workspace id). |

Any EXCEPTION must have a row in the Complexity Justification table below. **[REVISED v1.1.0]** Article I no longer needs one — it is COMPLIES, not EXCEPTION (see above). Article VI's EXCEPTION is the constitution's own standing exception, not re-justified per-feature; it remains the only row-bearing article.

## Research Summary

- Research artifact: **N/A — no research required, re-verified for this revision.** [REVISED v1.1.0] v1.0.0 deferred CLI-framework adoption behind a growth trigger; this revision adopts `commander` in v1 per owner override (see header Revision Note). The original reasoning that no dedicated `research.md` is warranted still holds even though the *timing* changed: `commander`, `yargs`, and `node:util.parseArgs` remain mainstream, extensively documented tools whose comparison rests on public, verifiable facts rather than prototyping or benchmarking — re-checked directly against the npm registry for this revision (2026-07-28): `commander@15.0.0` (published 2026-05-29, ~2 months stable at revision time) ships **zero runtime dependencies**, versus `yargs@17.x`'s six transitive dependencies (`y18n`, `cliui`, `escalade`, `string-width`, `yargs-parser`, `get-caller-file`). This confirms v1.0.0's "smaller transitive surface" claim for commander is still accurate today, not stale — see Pattern Evaluation (A). The persistence mechanism (Drizzle) and migration engine remain decided by ADR-015 and are unaffected by this revision.
- Key decision: Adopt `commander` directly in v1 for both `init` and `serve` — supersedes v1.0.0's hand-rolled-parser-now / two-tier-deferred-escalation plan. The comparison table below is retained and updated to reflect the new verdict, not deleted, so the original reasoning stays auditable.

## Planning Preflight Evidence

- Coordinator Planning Preflight: **PASS** — confirmed by direct inspection of `ADS-memory/reports/pipeline/003-site-install-dir/pipeline-state.md` (Spec: APPROVED 2026-07-07; Human Spec Checkpoint: APPROVED; Red-Team: COMPLETE, 0 BLOCKING; RT fixes: APPLIED, re-validated PASS).
- Spec hash verified at: 2026-07-07T03:55:00Z (`feature.spec.md` header + `pipeline-state.md`'s `spec_hash` row agree: `sha256:c2547dc3…4614`).
- Red-Team status and artifact: COMPLETE — 0 BLOCKING, 5 ADVISORY, 1 CONSTITUTION_FLAG. `ADS-memory/reports/pipeline/003-site-install-dir/red-team-findings.md`. RT-001..004 are spec-text/behavior-spec fixes already applied per `pipeline-state.md`'s "RT fixes APPLIED" row; RT-005 (schemaVersion index+tag, not count) is already folded into `feature.spec.md` REQ-05/state.spec.md §5/§7 and ADR-015 — this ADR's schema-guard unit (U-002) encodes it as a Binding constraint. RT-006 (Article I CLI-framework growth trigger) is resolved in this ADR's Constitution Check [REVISED v1.1.0: resolved by direct `commander` adoption in v1 per owner override, not by the v1.0.0 two-tier deferred trigger, which this revision supersedes — see header Revision Note].
- System Blueprint status and artifact: Not produced for this feature — no macro-topology change (the CLI is a new entrypoint over the existing single-process modular monolith, not a new service/deployment boundary; ADR-011 already fixed the two-topology macro shape).
- CodeBase Analyzer reports consumed: None formal. This ADR performed direct source inspection of `src/index.ts`, `src/server/{deps,app}.ts`, `src/infra/sqlite/content-db.ts`, `src/infra/db/schema.ts`, `src/infra/drizzle/meta/_journal.json`, `src/server/seed.ts`, `package.json`, `tsconfig.json`, `.dependency-cruiser.cjs`, and `tovu-v2-design.md` to ground module boundaries and the `createSqliteRouteDeps` change in actual repo precedent.
- Reverse-spec artifacts consumed: None (SPEC-003 is brownfield via `spec-manifest.md`'s Brownfield References section, not a reverse-spec extraction).
- Validator result or waiver: PASS per `spec-dod.md` Section H (Final Gate) — no waiver needed.

## Context

Tovu's server is a library-style Express app with no CLI and no install-dir concept: `src/index.ts` reads `PORT`/`TOVU_DB`/`TOVU_CONTENT_DB` env vars and calls `createSqliteRouteDeps()`, which hardcodes the workspace id to the seeded demo workspace (`seededWorkspace.id`, used **15 separate times** inside that one ~500-line composition-root function — identity, SEO settings, comments settings, menu bindings, taxonomy, redirects, origin, analytics, media, etc.). There is no way to create, move, or hand off a "site."

Forces acting on this decision:
- **ADR-012** already decided *what* a site is (a versioned template instantiated into an install dir; runtime shared, never copied) and *what* the layout contains. SPEC-003 is that decision made real via `tovu init`/`tovu serve`.
- **REQ-06** ("hardcoded seeded-workspace id... removed from the install-dir path") forces a real edit inside the brownfield composition root named above — not a new module in isolation. This is the single highest-blast-radius decision in this ADR and gets its own section below.
- **RT-006** forces a deliberate (not silently-deferred) Article I decision, because the CLI surface is about to grow: SPEC-005 adds `tovu plugin build`, `tovu dev --plugin`, `tovu hooks list` (3 more commands), and OQ-01 adds `tovu build` (1 more) — from 2 commands today to a plausible 6 within one or two more specs. **[v1.1.0]** The owner resolved this force by adopting `commander` immediately rather than deferring: SPEC-005's 3 additional commands are committed roadmap (not speculative), and a separate planned desktop app, Tovu-Runner, will invoke this CLI *programmatically* (forking/managing many independent Tovu site instances) rather than via human typing — structured, declarative command definitions matter more for that caller than for interactive use. See Constitution Check and Pattern Evaluation (A) below.
- **INV-01/INV-02/BR-01/BR-06/RT-003/RT-005** together require crash-safety and atomicity properties (commit-marker-last, cleanup-on-failure, atomic dual-field stamp write, tag-not-just-count comparison) that are easy to get subtly wrong — these become the Critical Internal Constraints below, not left to Programmer discretion.
- **What happens if we do nothing:** the walking skeleton has no first-boot story (tovu-v2-design.md's own success bar: "must beat WordPress's 5-minute install"), and the hardcoded workspace id keeps blocking every future multi-site/desktop-host feature (ADR-011 topology 2).

## Decision

Add two new vertical-slice modules — `src/cli/` (argv parsing, command dispatch, exit-code/stderr mapping) and `src/site-dir/` (install-dir validation, template read, schema guard, workspace resolution, init/boot orchestration) — that together implement `tovu init`/`tovu serve`/`tovu --help` by **wrapping**, not redesigning, the existing `server/deps.ts`/`server/app.ts` composition root. The one surgical change to existing code is an **additive, optional-parameter extension** to `createSqliteRouteDeps` so it can accept a pre-opened db + resolved workspace id (the install-dir path) while its zero-argument legacy default behavior is preserved byte-for-byte (REQ-10/AC-13). CLI argument parsing and dispatch is built on `commander` in v1 for both commands **[REVISED v1.1.0 — supersedes the v1.0.0 hand-rolled-parser-now/deferred-escalation plan]**, per an explicit owner override: SPEC-005's already-committed subcommand growth and the planned Tovu-Runner desktop host's programmatic invocation of this CLI make structured, declarative, testable command definitions worth their (verified: zero-transitive-dependency) cost starting now, not later — see Constitution Check and Pattern Evaluation (A).

**Pattern(s) selected:** Modular monolith / vertical-slice modules (`cli`, `site-dir`) with no new hexagonal ports (Article IV rule-of-two fails for a single template) + an additive brownfield extension point on the existing composition root + `commander` for argv parsing/dispatch (adopted directly in v1 per owner override, not deferred — see Revision Note).

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, hexagonal boundaries only where external I/O or business-critical logic justify them.
- Alignment: **FOLLOWS**
- Notes: `cli` and `site-dir` are new top-level vertical-slice modules, matching this codebase's existing convention (`src/newsletter/`, `src/widgets/`, `src/redirects/`, each own `repo.sqlite.ts`/`deps.ts`/`__tests__/`). No ports-and-adapters ceremony is added: `site-dir`'s I/O (fs, one SQLite handle it is handed or opens once) has exactly one real implementation each and no swap requirement is on any roadmap (Article IV explicitly forbids a `TemplatePort` at one template). This also directionally matches `tovu-v2-design.md`'s eventual `tooling/cli/` naming intent without prematurely adopting that document's aspirational pnpm-workspace/apps-packages monorepo split, which is out of scope for this feature and would violate the Simplicity Gate.

## Rationale

Map to system drivers:
- **Driver: exactly 2 commands, ≤1 flag each, today** → **[REVISED v1.1.0]** no longer addressed by hand-rolled parsing on its own; the owner override treats this driver as necessary-but-insufficient by itself — see the next two drivers, which are why `commander` is adopted directly instead of hand-rolling today's small surface.
- **Driver: a named, already-scoped near-term surface growth (SPEC-005: +3 commands; OQ-01: +1)** → **[REVISED v1.1.0]** addressed by adopting `commander` now instead of deferring behind a growth trigger — the growth is committed roadmap, not speculative, so waiting for it to materialize before adopting the library would just relitigate the same decision later for no benefit. This is still RT-006's underlying ask; the resolution mechanism changed from "defer with a named trigger" to "adopt now," per owner override.
- **Driver (new, v1.1.0): Tovu-Runner (planned desktop app) will fork/manage many independent Tovu site instances and invoke this CLI programmatically, not via a human typing at a terminal** → addressed by `commander`'s declarative command/option schema (`program.ts`), which is far more predictable and testable for a programmatic caller than hand-parsed `process.argv`. This driver was not yet named at v1.0.0's writing.
- **Driver: REQ-06 forces an edit inside a 500-line, comment-dense brownfield composition root** → addressed by the smallest correct extension: one additive optional parameter, one shared `resolveWorkspace` selector reused by both the legacy default path and the new install-dir path, so REQ-10's byte-for-byte legacy parity falls out of the mechanism rather than needing a special case.
- **Driver: install-dir is a compatibility surface with the future desktop host (ADR-011/ADR-012)** → addressed by keeping `site-dir` entirely CLI-agnostic and Express-agnostic (it never imports `cli/**` or `express`), so a future non-CLI caller (the desktop host, or a test) can call `initSite`/`bootSiteDir` directly.
- **Driver: INV-01/INV-02/BR-01/BR-06/RT-003/RT-005's crash-safety and atomicity properties** → addressed by designating them as Critical Internal Constraints (see `critical-internal-constraints.md`) with observable verification surfaces, rather than leaving ordering/atomicity to implicit Programmer discretion.

## Pattern Evaluation

Two independent decisions are evaluated: (A) the CLI argument-parsing/dispatch approach (the RT-006 crux), and (B) the module-boundary shape for the new code. (B) has no genuine alternative given the constitution's Article IV rule-of-two and the existing repo convention, so it is recorded briefly under (B) rather than padded into a multi-row table.

### (A) CLI argument-parsing/dispatch approach

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Hand-rolled minimal parser (`process.argv`, Node built-ins only) | Strong fit for a 2-command surface in isolation | Medium | prior_art | Zero new dependency; ~30-line surface covers 2 commands × ≤1 flag each | Manual flag coercion/validation re-litigated per new flag; no declarative schema a programmatic caller (Tovu-Runner) can introspect or rely on staying stable | Least ceremony for today's literal surface, but does not fit the now-known near-term surface (SPEC-005) or the programmatic-invocation driver | **Rejected (v1.1.0)** — was SELECTED in v1.0.0; superseded by owner override, see Revision Note |
| `node:util.parseArgs` (Node core, stable since Node 20; this repo runs Node 24, `@types/node` ^22) | Viable fit | Medium-High | analogical | Article-I-native — a maintained library already in the runtime; handles boolean/string coercion, `--`, and aliasing correctly without hand-written edge-case code | Still no subcommand routing, no auto-generated multi-command `--help`, no nested-command support — exactly the gap SPEC-005 will need filled | Would have been the correct *intermediate* step under v1.0.0's deferred-escalation plan; the owner override skips this tier entirely rather than escalating through it | **Rejected (v1.1.0)** — was reserved as Growth Trigger Tier 1; the tiered-escalation design itself is superseded, not merely the choice of tier |
| commander (re-verified `^15.x` at revision time; evaluated as `^12.x` in v1.0.0) | Viable fit → **Strong fit as of v1.1.0's driver set** | High | prior_art, re-verified 2026-07-28 | Widely adopted; declarative subcommand + option definitions that are readable and testable by a programmatic caller (Tovu-Runner); auto-generated per-command `--help`; mature TS types; **re-verified zero runtime dependencies at v15.0.0** (npm registry check, 2026-07-28, published 2026-05-29) — the "smaller transitive surface than yargs" claim is confirmed, not merely asserted | New runtime dependency (though zero-transitive-dep at the current major); v1.0.0's Agent Directive asked the Architect not to add this yet for a 2-command surface — the owner has explicitly overridden that timing (see Revision Note), so this con is accepted rather than resolved | Right tool now that SPEC-005's growth and Tovu-Runner's programmatic-invocation needs are committed, not speculative — v1.0.0's objection ("two commands don't justify it yet") no longer holds once those two facts are known | **SELECTED (v1.1.0)** — adopted directly in v1, not deferred |
| yargs (`^17.x`) | Viable fit | High | prior_art, re-verified 2026-07-28 | Same category as commander; strong middleware/coercion pipeline, widely used | Six transitive dependencies (`y18n`, `cliui`, `escalade`, `string-width`, `yargs-parser`, `get-caller-file`) vs. commander's zero — re-verified via npm registry, not merely asserted | Same territory as commander; commander preferred for the smaller dependency surface | Rejected — runner-up to commander, ranking unchanged from v1.0.0 |

**v1.0.0's two-tier growth trigger (superseded — retained below for audit history only, not in effect):**
- ~~Tier 1 — adopt `node:util.parseArgs` when a 3rd command's flag needs type coercion beyond a single required string + optional bounded integer, or SPEC-005's first command lands, whichever comes first.~~
- ~~Tier 2 — adopt commander when the command count reaches ≥4 total, or any command needs nested subcommands, shell completion, or auto-generated multi-command `--help`, whichever comes first.~~

**v1.1.0 resolution (current — resolves RT-006):** `commander` is adopted directly in v1 for both `init` and `serve`, skipping both tiers above. The two facts that would eventually have fired Tier 2 (SPEC-005 crossing the ≥4-command line; a caller needing predictable, testable command definitions) are now known in advance rather than discovered later, so the owner chose to adopt once, now, rather than hand-roll first and migrate later. This is an explicit override of the Software Architect's original timing judgment, not a routine escalation — see the header Revision Note for the full rationale and who decided it.

### (B) Module-boundary shape

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| New vertical-slice modules (`cli/`, `site-dir/`), no new ports | Strong fit | High | prior_art | Matches every existing top-level module in this repo (`newsletter/`, `widgets/`, `redirects/`); `site-dir` has zero CLI/Express coupling so a future desktop-host caller reuses it directly; Article IV is satisfied by not introducing a `TemplatePort` | `site-dir` and `server/deps.ts` share one contract point (the `{db, workspaceId}` override) that must stay in sync if either evolves — mitigated by the Contract Map in the implementation outline | Small, explicit coupling seam vs. a fully decoupled port that one template doesn't earn | **SELECTED** |
| Hexagonal port (`SiteInstallPort`/`TemplatePort` with adapters) | Rejected | High | analogical | Would isolate template-instantiation behind a swappable interface | Article IV rule-of-two fails outright — one template exists in v1 and none is concretely roadmapped; this is exactly the premature-indirection case Article IV exists to block | Violates a constitution article with no offsetting benefit at this scale | Rejected — constitution violation, no justification available |
| Cram CLI + site-dir logic directly into `server/deps.ts`/`index.ts` | Weak fit | Low | analogical | Fewest new files | Makes an already 500-line, high-disclosure-density file materially larger and mixes CLI/exit-code concerns into a file that must stay Express/DB-composition-only; blocks the desktop host from reusing site-dir logic without dragging in CLI/exit-code code | Saves a few files today, costs modifiability and reuse immediately | Rejected — violates Simplicity Gate's "no complexity without a reason" in the other direction (false economy) |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | How easily behavior can be changed or extended safely | 4 | analogical | New CLI flags/commands are additive within `cli/`; `site-dir`'s functions are pure enough to extend without touching `server/deps.ts` again once the one override parameter exists | The `createSqliteRouteDeps` touch is a real edit inside a 500-line, comment-dense brownfield file — a future contributor must find and preserve the "one resolved `workspaceId` variable, no re-literal" discipline | Directly ties to REQ-06's forced edit; mitigated structurally (single resolution point) rather than left as convention | Assumes no second brownfield composition root needs the same fix in parallel (none exists today — `server/app.ts`'s in-memory path is unaffected, it never referenced a real db) | always-on | Owner: Programmer; Enforcement: CIC U-001 grep-based structural check + existing test suite must stay green unmodified; Deadline: before this feature's Programmer handoff | Re-open if a second SQLite composition root is ever added | vs. "cram into deps.ts": +2 (no added file-size/coupling cost) |
| modularity | How cleanly the system is partitioned into stable, isolated boundaries | 4 | prior_art | `site-dir` imports neither `express` nor `cli/**`; `cli` imports `site-dir` and `server/{deps,app}` only, never Drizzle types directly | The `{db, workspaceId}` override is one explicit coupling seam between `site-dir` and `server/deps.ts` that both sides must keep in sync | Matches this repo's existing per-module boundary convention (dependency-cruiser rules already exist for `core`/`features`/`infra`) | Assumes dependency-cruiser rules are actually extended for `cli`/`site-dir` (recorded in Enforcement, not yet executed) | always-on | Owner: Programmer; Enforcement: two new `.dependency-cruiser.cjs` rules (Enforcement section); Deadline: same PR that adds `cli/`/`site-dir/` | If a rule starts producing false positives at scale, revisit | vs. hexagonal port: −1 adaptability but +constitution compliance (Article IV) |
| scalability | How well the architecture handles growth in load, data volume, or organizational scale | 5 | assumed | No load-scaling dimension applies — CLI is a single local process, boot-once path | N/A — there is no plausible growth vector (request volume, data volume) that stresses argv parsing or a one-time install-dir boot | Scored high because the axis is structurally inapplicable to a local, once-per-boot CLI, not because of a demonstrated stress test | Assumes `init`/`serve` never become a hot path invoked in a loop (true by contract — `serve` is long-running, `init` is a one-time action) | always-on | — | — | If the desktop host ever calls `init` in a tight loop across many sites, revisit | N/A (no comparable candidate stresses this axis differently) |
| reliability | How well the system tolerates faults, degrades safely, and recovers | 4 | prior_art | INV-02's cleanup-on-failure + Drizzle's own idempotent `__drizzle_migrations` journal (ADR-015) give crash-safety by construction; BR-07's graceful-shutdown ordering is fully specified | EC-10 explicitly acknowledges cleanup can itself fail (`EACCES`/`ENOSPC` mid-cleanup) — a residual manual-recovery path is documented, not eliminated | Directly traces to INV-02/RT-003; residual risk is bounded (message names the partial dir) rather than silent | Assumes the filesystem itself does not return inconsistent state after a partial failure (standard POSIX assumption already relied on elsewhere in this codebase) | always-on | Owner: Programmer; Enforcement: CIC U-003 (Failure/Recovery Constraint) with an observable "cleanup failure names the path" test | If a cloud/networked filesystem target is ever supported, revisit (today: local disk only) | vs. "no cleanup guarantee": clearly better; no viable runner-up considered cleanup optional |
| security | How well the architecture supports secure boundaries, access control, secrets handling, and reduced attack surface | 3 | analogical | `LOCAL_PROCESS` trust model matches the existing standing Art. VI exception; INV-01 path-containment is the one real control, and it is made observable via CIC U-04 rather than left implicit | No sandboxing beyond disciplined path handling — a `dir` argument that will eventually come from a future desktop host (ADR-011) is externally-influenced input with no additional hardening layer in v1 | Ties to the standing constitution exception and to ADR-011's own trust framing (dependency arrow only ever points from open-design to Tovu, never the reverse) | Assumes the local OS user's filesystem permissions remain the real security boundary (matches api.spec.md's own `LOCAL_PROCESS` profile note) | always-on | Owner: Programmer; Enforcement: CIC U-004 traversal/symlink-escape test; Deadline: before this feature's Programmer handoff | Re-open when the desktop host (ADR-011 topology 2) starts supplying `dir` programmatically | vs. no path-containment check at all: clearly better; no stronger runner-up is in scope (full sandboxing is out of scope for v1) |
| operability | How easy the system is to deploy, monitor, debug, roll back, and run | 4 | prior_art | Single machine-parseable stderr line + exit-code registry make CI/desktop-host integration straightforward without parsing prose; one boot-line log names dir/port/schemaVersion/workspace id | No log-level/verbosity flag in v1 (e.g. no `--quiet`/`--verbose`) | Matches REQ-09's deliberately minimal v1 scope; noted as a re-evaluation trigger rather than silently accepted forever | Assumes CI/desktop-host consumers parse the `tovu: <CODE>:` prefix, not full stderr text (already the api.spec.md contract) | always-on | — | — | Add `--verbose`/log-level flag if a consumer requests structured multi-line diagnostics | vs. multi-line/JSON error output: simpler today, less debuggable for future automation — accepted tradeoff |
| cost | Total ownership cost, including infrastructure cost and operational overhead | 5 | measured | Zero new infrastructure; zero new paid dependency; template data ships in-repo (`templates/starter/*.json`) | — | No credible weakness at this scope — the entire feature is local filesystem + an existing SQLite engine | Assumes no template gallery/marketplace hosting is added in v1 (explicitly out of scope) | always-on | — | — | Multi-template gallery (ADR-012 deferred item) would change this | vs. adopting a CLI framework now: marginally higher cost (one more `node_modules` entry) — immaterial either way |
| testability | How well the architecture supports unit, integration, contract, and system verification | 4 | prior_art | `site-dir`'s functions (`readSiteDir`, `resolveWorkspace`, schema guard) are pure/near-pure and temp-dir-testable per Article V; CLI dispatch is a thin, easily-mocked layer over them | `initSite`'s full-flow fault-injection tests (AC-03/EC-10) require real filesystem-failure simulation (`ENOSPC`/`EACCES`), which is inherently more setup than a pure unit test | Matches the spec's own Constitution table framing (Art. V: "P1 ACs are CLI/process-level") | Assumes Node's `fs` failure injection (e.g. via a stub/mock fs, or `chmod`-based permission tests) is available in the test toolchain already used elsewhere in this repo | always-on | Owner: TDD Agent; Enforcement: fault-injection tests for AC-03/EC-10 | If fault-injection proves too flaky, fall back to a documented manual/audit-only check for the cleanup-failure branch only | vs. skipping fault-injection tests: this scores higher because AC-03 is explicitly P1 |
| data_consistency | Distributed writes, multiple stores, or critical invariants spanning them | 3 | analogical | Drizzle's `__drizzle_migrations` journal (SQLite-internal, ADR-015) and the `.site-meta.json` stamp file are each independently idempotent/atomic-by-design (temp-file+rename); a crash between "migrate() commits" and "stamp rename completes" is safe because the next boot's migrate() call is a no-op and the stamp write simply retries | Two independently-durable stores (one SQLite journal, one JSON file) must stay *logically* consistent under crash — there is a real, if narrow, window where they can transiently disagree, and correctness depends on migrate()'s idempotency covering that window rather than a single cross-store transaction | REQ-05/INV-04/RT-005 require comparing **both** `schemaVersion` (index) and `schemaTag` (identity) and stamping them together — this axis is activated by that explicit invariant, not assumed | Assumes Drizzle's `migrate()` remains idempotent via `__drizzle_migrations` across the version range this repo pins (true today per ADR-015; a Drizzle major-version change is a named re-evaluation trigger) | REQ-05, INV-04, RT-005 (Red-Team), state.spec.md §7 | Owner: Programmer; Enforcement: CIC U-002 (atomic stamp write + AC-07's own round-trip re-serve test); Deadline: before this feature's Programmer handoff | Drizzle major-version bump, or a second schema-stamp consumer appearing | vs. comparing only `schemaVersion` count (RT-005's rejected weaker design): this scores higher because tag comparison catches divergent-lineage forks the count alone would miss |

## Overall Strengths

- The install-dir domain (`site-dir`) is fully decoupled from both the CLI framework choice and the Express/HTTP composition root — either can change independently, and a future desktop-host caller can use `site-dir` directly.
- REQ-06's brownfield fix (workspace-id resolution) is solved with one shared selector and one additive parameter, so legacy behavior (REQ-10/AC-13) is preserved by construction rather than by a parallel code path that could drift.
- **[REVISED v1.1.0]** The Article I decision is no longer implicit, deferred, or trigger-based — it is settled for v1 directly: `commander` is adopted now, so the SPEC-005 Software Architect dispatch inherits a working CLI framework instead of being contractually obligated to re-open a growth trigger.

## Overall Weaknesses

- Security posture (score 3) is the honestly-weakest axis: v1's only real control against a malicious/buggy `dir` argument is path-containment discipline, not sandboxing. This is acceptable today (local operator, standing Art. VI exception) but will need re-examination the moment the desktop host supplies `dir` programmatically (ADR-011 topology 2).
- The `createSqliteRouteDeps` touch, while minimal in shape, is inside the single highest-disclosure-density file in this codebase; any review of it requires reading a lot of surrounding context to confirm the 15-usage replacement was done completely, not partially.

## Tradeoff Tension

We are trading a slightly larger blast-radius edit to `server/deps.ts` (touching all 15 `seededWorkspace.id` usages, not just adding a new file) for byte-for-byte legacy-path preservation and a real fix to REQ-06 — instead of leaving the hardcode in place for the legacy path and adding a second, parallel, workspace-aware composition function that would drift from the original over time.

## Why This Won

The selected shape is the only one that satisfies all of: (a) Article IV forbids a port for one template, ruling out the hexagonal alternative outright; (b) REQ-06 is explicit that the hardcode must be removed "from the install-dir path," which is only achievable without duplicating ~500 lines of composition logic if the fix happens inside the one existing function; (c) REQ-10/AC-13 demand the legacy path stay byte-identical, which a shared resolution mechanism satisfies automatically (every existing seeded fixture resolves to the same id) rather than requiring a manually-maintained parallel branch. The "cram into deps.ts/index.ts" alternative was rejected because it would make CLI/exit-code concerns leak into a file that must stay Express/DB-composition-only, blocking the desktop host's future reuse of `site-dir` for no compensating benefit.

## Runner-Up Comparison

- Runner-up: Cram CLI + site-dir logic directly into `server/deps.ts`/`index.ts` (fewer new files).
- Why it lost: it saves file count today at the cost of modifiability and reuse immediately — the desktop host (ADR-011 topology 2) would need to either shell out to the CLI or duplicate install-dir logic, exactly the kind of premature coupling the Simplicity Gate's "no complexity without a reason" principle cuts both ways against.

## Consequences

**Positive:**
- `tovu init`/`tovu serve` become real, testable commands with a clean separation from the CLI-framework question.
- The workspace-id hardcode is gone from the mechanism (not just the install-dir path) with no observable behavior change for any existing caller.
- **[REVISED v1.1.0]** The Article I CLI-framework decision is now settled for v1 (`commander` adopted directly) instead of deferred behind a re-checkable trigger — SPEC-005 inherits a working, declarative command framework rather than needing to first resolve Article I itself.

**Negative / Tradeoffs:**
- One brownfield file (`server/deps.ts`) gets a real, if small, structural edit — carries real regression risk if done incompletely (mitigated by CIC U-001).
- v1 ships with no sandboxing beyond path-containment discipline for the `dir` argument (mitigated by CIC U-004, revisited when the desktop host lands).
- **[NEW, v1.1.0]** v1 now carries a new runtime dependency (`commander`) instead of zero new dependencies — re-verified as zero-transitive-dependency at the adopted major version, so the practical cost is one direct `node_modules` entry, not a dependency tree. Accepted tradeoff per owner override, given SPEC-005's committed growth and Tovu-Runner's programmatic-invocation needs.

**Risks:**
- Risk: a future contributor extends `createSqliteRouteDeps` and re-introduces a literal `seededWorkspace.id` reference alongside the resolved variable → plan: CIC U-001's grep-based structural check + Code Review Agent enforcement (see Enforcement below).
- Risk: `.site-meta.json`'s schemaVersion/schemaTag stamp is written non-atomically (split across two writes) → plan: CIC U-002 designates this as a Binding constraint with an observable round-trip test (AC-07).

## Mitigations Required

No core axis scored ≤2. The two axes scored 3 (security, data_consistency) each already carry an explicit Mitigation/Owner/Enforcement/Deadline in their own scorecard row above (CIC U-004 and CIC U-002 respectively); no additional entries are required by the ≤2 threshold rule.

## Migration Safety (required for brownfield work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Expand-only: `createSqliteRouteDeps(dbPath?, overrides?: { db, workspaceId })` adds an optional second parameter; every existing call site (`src/index.ts`, and 8+ test files calling `createSqliteRouteDeps(dbPath)` / `createSqliteRouteDeps(":memory:")` with one positional arg) is unaffected — no contract phase needed, there is nothing to remove later. | Programmer |
| Dual-write or read-routing plan | N/A — exactly one db path is opened per boot; the install-dir path and the legacy path are mutually exclusive per invocation (BR-04: dir argument wins, env vars ignored with a warning). | N/A |
| Backfill plan | N/A — install dirs are newly created by `init`; no existing data requires backfilling. The legacy flat-db/memory paths are untouched by this feature's schema or seed. | N/A |
| Reconciliation checks | The existing `database-migration-reconciliation-boot.integration.test.ts` and `boot-lifecycle-real-deps.integration.test.ts` suites (both call `createSqliteRouteDeps(dbPath)` today) must stay green **unmodified** — this is the characterization-parity regression gate for the `workspaceId` mechanism change (CIC U-001). | TDD Agent / Programmer |
| Observability proving phase health | Unchanged boot-line log shape; no new telemetry surface to prove. | N/A |
| Rollback test | Reverting the `createSqliteRouteDeps` signature extension is a pure code revert — no persisted-schema rollback is needed, since `.site-meta.json`/`config.json` are new files written only by the new `init` path (never retrofitted onto pre-existing install dirs, because none exist yet). | Programmer |
| Cutover approval and timing | Gated by this ADR's required human architecture sign-off (see Status line) before any Programmer dispatch. | Coordinator / human owner |
| Point of no return | None identified — `init`'s `.site-meta.json` write is the only new durable artifact this feature introduces, and it only ever applies to freshly created install dirs. | N/A |
| Post-cutover verification | Full existing test suite green (in particular the two reconciliation/boot-lifecycle suites named above) + new AC-01…AC-14 integration tests green. | TDD Agent / TestRunner |

## Re-evaluation Triggers

- ~~Calendar trigger~~ / ~~Scale trigger~~ **[REMOVED, v1.1.0]** — both were specific to the now-superseded two-tier deferred-escalation plan (re-open at SPEC-005 dispatch; fire at ≥4 commands or nested subcommands). `commander` is already adopted in v1, so there is no future "escalate to commander" event left to trigger; the SPEC-005 Software Architect dispatch inherits the working framework directly instead of re-opening this decision.
- **Regression trigger [NEW, v1.1.0]:** if `commander`'s maintenance health degrades (unmaintained, or a future major version reintroduces a materially heavier transitive-dependency footprint than the zero-dependency baseline re-verified at v15.0.0), re-evaluate down to `node:util.parseArgs` or a hand-rolled parser — this adoption is not treated as irreversible.
- **Nested-subcommand-complexity trigger [NEW, v1.1.0]:** if SPEC-005's `tovu plugin build`/`tovu hooks list` grow into deeply nested command groups beyond commander's ergonomic sweet spot (e.g., multi-level command trees needing plugin-style CLI extension), evaluate a heavier framework (e.g., oclif) at that time — not expected given SPEC-005's currently scoped roadmap (3 flat subcommands, no nesting named).
- Topology trigger (unchanged): the desktop host (ADR-011 topology 2) begins invoking `init`/`serve` programmatically rather than spawning the CLI process — re-evaluate whether `site-dir`'s security posture (currently scored 3) needs a stronger containment layer than path discipline. Note: this is unrelated to the CLI-framework choice — `commander`'s adoption addresses the *ergonomics* of programmatic invocation (Tovu-Runner constructing well-defined commands) but not the *security* posture of a `dir` argument supplied by another process.
- Dependency trigger (unchanged): a Drizzle major-version change that alters `__drizzle_migrations` journal semantics or `drizzle-kit`'s `_journal.json` shape — re-verify `runtimeSchemaVersion()`'s reliance on that file's current fields (`idx`, `tag`).

## Module / Service Boundaries

```
src/
  cli/                        # NEW — argv parsing (via commander, v1.1.0), command dispatch, exit-code/stderr mapping (Art. I: COMPLIES — commander adopted in v1, see Constitution Check)
    main.ts                    # process entrypoint for the `tovu` bin; builds the commander program (program.ts), attaches command actions, maps typed errors (incl. commander's own CommanderError) -> exit codes [REVISED v1.1.0]
    program.ts                  # [REVISED v1.1.0 — replaces parse-args.ts] constructs/configures the commander Command program: declares `init`/`serve` subcommands, the `dir` positional argument, and `--name`/`--port` options; commander itself performs argv tokenization/coercion
    errors.ts                   # CLI-layer error-to-exit-code mapping + "tovu: <CODE>: <message>" stderr formatting — now also maps commander's own parsing/validation errors surfaced via `.exitOverride()` [REVISED v1.1.0]
    commands/
      init.ts                   # commander action -> site-dir/init-site.ts -> CLI_INIT stdout contract
      serve.ts                  # commander action -> site-dir/boot-site-dir.ts -> server/deps.ts + server/app.ts -> app.listen
    help.ts                     # configures commander's help/exit-code overrides so `--help`/no-args exit 0 and an unknown command exits 2 (CLI_HELP contract) — commander's own defaults differ and must be overridden [REVISED v1.1.0]
  site-dir/                    # NEW — install-dir domain; zero Express/CLI awareness
    types.ts                    # ConfigJson, SiteMetaJson, TemplateJson, TemplateSeedContent (state.spec.md §2)
    read-site-dir.ts            # readSiteDir(dir) selector (state.spec.md §5)
    resolve-workspace.ts        # resolveWorkspace(db) selector — shared by server/deps.ts AND the serve boot path
    schema-guard.ts             # runtimeSchemaVersion() (reads src/infra/drizzle/meta/_journal.json) + comparison
    init-site.ts                 # initSite(...) orchestration incl. cleanup-on-failure (BR-01/INV-02)
    boot-site-dir.ts              # bootSiteDir(...) orchestration: validate -> guard -> migrate+stamp -> resolveWorkspace (BR-05/BR-06)
    read-template.ts              # readTemplate(templateId) — reads templates/<id>/*.json, maps seed -> ContentDbSeedData
  server/
    deps.ts                     # CHANGED — createSqliteRouteDeps gains an optional {db, workspaceId} override parameter;
                                  # the seededWorkspace.id literal is replaced by ONE resolved workspaceId variable
                                  # (via site-dir/resolve-workspace.ts), reused on both the legacy default path and the
                                  # override path — no other line in this 500-line file changes.
    app.ts                       # UNCHANGED
  index.ts                       # UNCHANGED — legacy env-var boot (REQ-10); still calls createSqliteRouteDeps() with no override
templates/
  starter/
    template.json                 # NEW — repo data, read-only at runtime (REQ-02/INV-03)
    seed-content.json             # NEW — declarative seed (workspace/entries/presentation), content-equal to server/seed.ts (AC-02)
package.json                      # CHANGED — adds "bin": { "tovu": "dist/src/cli/main.js" } (REQ-09, unchanged from v1.0.0) and a new dependency "commander": "^15.0.0" (v1.1.0 — see Constitution Check / Pattern Evaluation (A)); dev alias via tsx unaffected
```

**Directory structure decision (required in every ADR):** Vertical-slice / feature-based module shape — co-locate specs and tests with the owning module: `src/cli/__tests__/{unit,integration}/`, `src/site-dir/__tests__/{unit,integration}/`, matching this repo's existing `unit`/`integration` split convention (e.g. `src/core/__tests__/unit`, `src/core/__tests__/integration`). `server/deps.ts`'s changed lines are covered by the existing `src/server/__tests__/` tree (no new test directory needed there — see Migration Safety's Reconciliation Checks row).

## API / Event Contract Summary

The public CLI surface (commands, flags, exit codes, stderr contract) is already fully specified in `api.spec.md` and `errors.spec.md` — this ADR inherits it verbatim and does not re-derive it. **[v1.1.0 note]** Adopting `commander` in v1 changes the internal parsing *mechanism* only; it does not change this public surface — same commands, same flags, same exit codes. No `api.spec.md`/`errors.spec.md` edits are required by this revision (`cli/help.ts` and `cli/errors.ts` are responsible for configuring commander so its own defaults match the existing contract exactly, e.g. exit 2 rather than commander's default exit 1 on an unknown command — see Module/Service Boundaries above). Summarized for downstream reference:

| Command | Invocation | Success | Failure exit codes |
|---|---|---|---|
| `CLI_INIT` | `tovu init <dir> [--name <name>]` | exit 0, stdout names name+dir | 2 `VALIDATION`, 3 `INIT_DIR_NOT_EMPTY`, 1 `INTERNAL` |
| `CLI_SERVE` | `tovu serve <dir> [--port <n>]` | long-running, one boot-line log, 0 on graceful SIGINT/SIGTERM | 2 `VALIDATION`, 3 `SITE_DIR_INVALID`, 4 `SITE_NEWER_THAN_RUNTIME`, 5 `SITE_CORRUPT`, 1 `PORT_IN_USE`/`INTERNAL` |
| `CLI_HELP` | `tovu --help` / `tovu` / unknown command | exit 0 (help) | exit 2 (unknown command) |
| `LEGACY_DEV_BOOT` | `npm run dev` (+ env vars) | unchanged | unchanged |

**New internal contracts this ADR introduces** (beyond `api.spec.md`; full shapes in `implementation-outline.md`'s Contract Map C-001…C-010):
- `site-dir`'s `readSiteDir`, `resolveWorkspace`, `runtimeSchemaVersion`, `initSite`, `bootSiteDir`, `readTemplate` — new exported functions other stages (TDD, Programmer) must respect as stable contracts.
- `server/deps.ts`'s `createSqliteRouteDeps(dbPath?: string, overrides?: { db?: ContentDb; workspaceId?: string })` — the one changed signature on existing code. Contract: when `overrides.db` is supplied, `createSqliteRouteDeps` must not open or migrate a second db handle; when omitted, behavior is identical to today's zero-argument call (including which `workspaceId` every existing test observes) because the legacy path now resolves that id via the same `resolveWorkspace` selector rather than referencing a literal — see CIC U-001.
- Error contract: `site-dir` functions throw typed errors (or a discriminated result), never raw `Error`/opaque strings, carrying enough structured detail (errors.spec.md §3's per-code schema) for `cli/errors.ts` to format the exact stderr line + exit code. `site-dir` itself has no knowledge of exit codes — that mapping is `cli`'s job only (layering boundary, enforced below).

## Enforcement

- Extend `.dependency-cruiser.cjs` (existing pattern: `severity: "warn"`, Article-I-justified per ADR-046) with two new rules: `site-dir-no-server-express-or-cli-imports` (`from: ^src/site-dir`, `to: ^(src/server|src/cli|node_modules/express)`) and `cli-no-direct-drizzle-imports` (`from: ^src/cli`, `to: ^(drizzle-orm|src/infra/db)`), mirroring the existing `core-no-server-or-app-imports` / `only-composition-constructs-concrete-adapters` rules already in that file.
- Code Review Agent must flag any new literal `seededWorkspace.id` (or `seededWorkspace\.id`-shaped) reference appearing inside `createSqliteRouteDeps`'s function body outside the single `resolveWorkspace` call site — ties directly to CIC U-001's verification surface.
- `templates/starter/` must remain read-only at runtime: no file under `src/` may open it for writing (grep-checkable: no `fs.write*`/`fs.mkdir` call with a path derived from `templates/`), and INV-03 gets explicit test coverage.
- Architecture compliance (this ADR + its Implementation Outline + Critical Internal Constraints) is a Required finding in Code Review, per this project's standing rule.
- **[NEW, v1.1.0]** `cli/` must construct exactly one `commander` `Command` program (in `program.ts`) as the single source of truth for subcommands/options — no command may hand-roll its own argv tokenization alongside it. Ties to Article I's COMPLIES status: the point of adopting a library is defeated if custom parsing creeps back in beside it.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries.*

**[REVISED v1.1.0]** The Article I row that appeared in v1.0.0 is removed here — Article I's status changed from EXCEPTION to COMPLIES (see Constitution Check above), and this table's own governing rule ("Fill only if Constitution Check has EXCEPTION entries") means a COMPLIES article gets no row. v1.0.0's row justified keeping hand-rolled parsing; this revision instead adopts `commander` (a maintained library), which is what Article I asks for by default — no justification for a deviation is needed because there no longer is one. See the header Revision Note for who made this call and why.

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| *(none — Article I is COMPLIES as of v1.1.0)* | — | — | — |

Article VI's EXCEPTION is the constitution's own pre-existing standing exception (not newly introduced by this feature) and is not re-justified here; see the constitution's Article VI text and this ADR's Constitution Check row for the compensating control this feature adds (INV-01 via CIC U-004).

## Related Decisions

- Implements: ADR-012 (site template + instantiation — this ADR is ADR-012's create/serve flow made real)
- Implements the compatibility contract from: ADR-011 (two deployment topologies — the install-dir layout this feature produces is exactly the portability contract ADR-011 names)
- Depends on: ADR-015 (Drizzle is the SQL data layer; this ADR's schema guard reads Drizzle's own generated migration journal, and never hand-writes migrations)
- Related to: ADR-007 (workspace scoping) — REQ-06's fix is a reinforcement of ADR-007's always-intended dynamic workspace scoping, closing a hardcoded gap that predates this feature; not a new cross-cutting rule (see Governance ADR Promotion note below).
- Directionally aligned with (not adopted by): `tovu-v2-design.md`'s eventual `tooling/cli/` monorepo-split naming intent — noted for future context, out of scope here.

## Governance ADR Promotion (evaluated per adr-governance workflow Step 9)

Evaluated whether this ADR establishes a cross-cutting rule that outlives this feature. **Declined — no promotion.** Reasoning: the two candidate durable-looking rules were both already covered by existing governance:
1. "Compare both `schemaVersion` index and `schemaTag` identity, never index/count alone" is already ADR-015's own stated consequence (ADR-015's Consequences section names this exact rule for SPEC-003). No new registry entry needed.
2. "Workspace id must be resolved dynamically, never hardcoded" is a reinforcement of ADR-007's always-intended workspace-scoping discipline — this feature closes a pre-existing gap in one function rather than establishing a new rule other modules must newly adopt (every other module in this codebase already receives `workspaceId` as a parameter, not a hardcoded literal; `server/deps.ts` was the one lagging holdout).

### Re-evaluated for v1.1.0 (commander adoption)

The commander-adoption override introduces a new candidate durable rule: *"CLI subcommands are defined declaratively via the shared `commander` program in `src/cli/program.ts`; new subcommands (e.g., SPEC-005's `tovu plugin build`/`tovu dev --plugin`/`tovu hooks list`) extend that program rather than hand-rolling a parallel parser."* This is genuinely cross-cutting — SPEC-005 depends on it directly, not just this feature.

**Promotion deferred, not declined**, pending this ADR revision's own required human architecture sign-off (see Status line): promoting a project-wide CLI-framework rule to `ADR-INDEX.md` before this ADR itself is approved would lock in governance ahead of the human checkpoint it is still waiting on. **Action for Coordinator:** once this ADR (v1.1.0) receives sign-off, promote the rule above to a Governance ADR (via `adr-governance/SKILL.md`) before the SPEC-005 Software Architect dispatch begins, so that dispatch has a recorded governance basis for extending `program.ts` rather than re-deciding the CLI-framework question independently.

`ADR-INDEX.md` is unchanged by this ADR pending that sign-off.
