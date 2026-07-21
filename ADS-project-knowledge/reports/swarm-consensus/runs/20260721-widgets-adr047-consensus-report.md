# Consensus Report

**Date:** 2026-07-21
**Prompt:** How should Tovu's "widgets" system (placeable, reusable components like a contact form, recent-posts list, text block, or social links) be structured — placement model, data model, styling ownership, and AI-editability? Evaluate ADR-047 (draft) adversarially.
**Context Packet:** `ADS-project-knowledge/reports/swarm-consensus/context/CTX-widgets-adr047-2026-07-21.md`
**Mode:** debate
**Controls:** `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300` (default)
**Primary model:** Claude Sonnet 5

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | claude (host) | — | Claude Sonnet 5 | 2.1.201 | host session | Responded | 2 (both rounds) |
| Peer | agy | Gemini 3.1 Pro (High) | Gemini 3.1 Pro (High) | agy 1.1.4 | `agy models` + smoke-test model-plan | Responded | 2 (both rounds) |
| Peer | codex | gpt-5.6-sol | gpt-5.6-sol (reasoning=high) | codex-cli 0.144.3 | `~/.codex/config.toml` local default, exact `command_model` | Responded | 2 (both rounds) |
| Peer (addition) | Claude Agent (model override `fable`) | claude-fable-5 | claude-fable-5 | n/a (in-host) | Agent tool `model` param | Responded | 2 (both rounds) |

Fable is an in-host addition alongside the two external CLI peers, per this project's standing debate convention — not a same-family helper filling the Primary slot, and not counted differently in agreement math from the other two peers.

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| agy | text | full stdout, ANSI-stripped, `<<SWARM_END>>` marker present both rounds | clean, no errors | 0 retries either round |
| codex | json | `item.completed`/`agent_message` event text, `<<SWARM_END>>` marker present both rounds | session header only (mandatory-bootstrap acknowledgement text), no crash signature | 0 retries either round; version-quarantine check passed (0.144.3, Intel Mac, no tool-use crash observed since no tool calls were made in Round 1, and Round 2 tool calls — repo reads for its own grounding — completed cleanly) |
| Fable (Agent) | text | final agent message, no end-marker convention (structured return value) | n/a | 0 retries either round |

Handshake gate: ACK-only probes run before both rounds for agy and codex (60s window, both rounds returned `ACK_PACKET_RECEIVED` cleanly, well under budget). Fable does not use the CLI ACK-probe protocol (in-host Agent dispatch); its Round 1/2 completion is the liveness signal.

## Debate Trace

### Round 1 — blind, solution-neutral

All four participants independently rejected Option B (stateless blocks, no persistent identity) and Option C (page-local composition, no theme regions), converging unanimously on Option A's shape (entry-native widget instances, dual placement). No participant needed to be shown this conclusion — it was reached independently four times from a neutral options framing.

The material finding was a **3-way independent convergence on a real flaw** in ADR-047's drafted region-binding mechanism (ordered rows directly in a binding table), described three different ways:
- **agy** proposed "Option D" (regions as entries, drop the binding table).
- **Fable** proposed "A′" (a seeded `widget_area` entry + thin binding table, explicitly modeled on ADR-029's actual content/binding split) and flagged an `entry_refs` source-type inconsistency (a binding row isn't an entry) that A′ dissolves.
- **Codex** proposed a lighter fix (a version header on the binding aggregate) but flagged the same underlying gaps: no concurrency-safe version, weak revision coverage, `entry_refs` polymorphism.

Also independently surfaced by 2+ participants: the widget **resolution contract** (how dynamic widgets fetch data, cost bounds, cache invalidation) is unspecified and is the actually-hard unsolved part (Codex + Fable); **Contact Form** appears to need an unbuilt submission pipeline (Codex + Fable — this assumption was later corrected, see below); **render-time failure isolation** (a broken widget must never abort the page) — flagged by the Primary pre-dispatch via the mandatory structural-gap scan, independently corroborated by Codex. Fable additionally surfaced that "widget types are data, not code" is likely a wrong framing (only 2 of 5 proposed v1 types are actually data-only).

### Round 2 — informed, full previous-round reasoning disclosed

Before dispatch, the Primary verified a factual claim both Codex and Fable had made in Round 1 (that Contact Form needs a net-new mail/submission pipeline) against the live repo, and found it false: `src/forms/` (`submit-service.ts`, `rate-limit-profile.ts`, `notify-subscriber.ts`) is a real, built feature already wired to a real, implemented `MailerPort` (ADR-037). This correction was included in the Round 2 packet.

**D1 reached full 4/4 convergence.** agy and Codex both explicitly updated toward Fable's more precise formulation; Fable itself refined its own Round 1 answer (A′ → "A″") after reading the *actual running* ADR-029 navigation code (`src/navigation/types.ts`, `reconcile.ts`) during Round 2 and finding the live pattern even thinner than what it had proposed from spec-reading alone: source of truth lives on the seeded entry itself (`fields.ext.widgets.regionKey`), the binding table is a **derived, reconciled, non-authored projection** — not a hand-maintained mapping. All three peers landed on materially the same shape by the end of Round 2.

**Fable, unprompted, went and verified more of the Round 2 packet's own claims against the live repo** (11 tool calls) rather than accepting them, and found: (a) its own Round 1 MailerPort claim was stale and retracted it in full; (b) `entry_refs` — which every participant's Round 1 answer, including the Primary's, treated as "reuse the existing mechanism" — **does not exist as running code**. `src/navigation/resolver.ts:21` states this explicitly ("has no compatible ADR-022 schema yet"). This is new, load-bearing information: it means D4's "low-cost fix" and D7's "the where-used data already exists" both actually name a real v1 build dependency, not a free reuse of shipped code.

**D5 (Contact Form) flipped to unanimous "ship in v1"** once the MailerPort correction propagated — all four participants, including both who had proposed deferring it in Round 1, converged on including it as a thin adapter over the already-built Forms feature.

**D2, D3, D6, D7, D8, D9 all reached full agreement**, each with independent reasoning (not bare confirmation) per the round's requirement — see Decision Ledger.

**One surviving qualification, not a disagreement:** Codex flagged that ADR-022's `ref` extraction mechanism may not yet cleanly cover *term/taxonomy*-typed targets specifically (as opposed to entry targets), based on a comment it found in the live repo suggesting term-target integrity isn't fully modeled — this narrows D4's scope claim (entry-target refs are straightforwardly covered; term-target refs need the already-named extended-reference seam) rather than contradicting it.

Agreement did not fall below the `min_confidence=0.90` threshold at any point requiring a third round — Round 2 was the second of the configured `max_rounds=2`, and the debate concludes here as scheduled, with full convergence rather than an early-stop shortfall.

## Individual Responses

### Primary: Claude Sonnet 5

Round 1: defended Option A as drafted with specific positions on all 5 original Open Questions (site-wide-only regions, freeform embed, explicit reuse/duplicate choice, minimal v1 type list deferring Contact Form, a `region_version` OCC counter). Round 2: updated position on D1 (endorsed A′ over own draft after Fable's mechanical catch), added D2/D3 as first-class gaps (resolution contract; data-vs-code split), and corrected the Contact Form assumption for the whole debate by verifying `src/mail/`/`src/forms/` against the live repo before Round 2 dispatch — the single highest-leverage contribution of the round, since it changed D5's outcome for every participant.

### agy: Gemini 3.1 Pro (High)

Round 1: recommended Option A, rejected B/C with concrete non-expert-UX and drift arguments, independently proposed "Option D" (regions as entries). Round 2: explicitly updated to Fable's more precise A′ formulation ("Fable's A′ captures the exact same structural benefit... but correctly retains the thin binding table... superior to my R1 proposal"), agreed on all remaining points, produced full artifacts (schema, resolver interface, diff-shaped ADR amendment, specs, implementation outline, plain-language overview).

### Codex: GPT-5.6-sol (reasoning=high)

Round 1: recommended "Option A, revise not reject," with the most exhaustive list of concrete gaps (9 items) of any Round 1 response, including several no one else initially named (menu-as-widget conceptual inconsistency, structural CSS ownership, browser-only-editor weakness for agent operation). Round 2: converged to A′, produced the most implementation-precise artifacts of the round (numbered acceptance criteria RA-01–08, WR-01–11, CF-01–06, REF-01–02; a 9-step dependency-ordered implementation outline with explicit test-ordering and a feature-flagged rollout step). Added the term-target `entry_refs` scope qualification. Closed with a framing note: widgets should stay "reusable referenced components," not become the universal representation of every local content block — a boundary worth keeping explicit so the system doesn't drift into an all-purpose page-builder.

### Fable (Claude, model override)

Round 1: recommended Option A amended to "A′," was the only participant to name the precise mechanical flaw in ADR-047's ADR-029 generalization claim, and to flag both the `entry_refs` source-type inconsistency and the "data not code" framing risk. Round 2: the standout round — went and verified claims against the live repo rather than trusting the packet, retracted its own Round 1 MailerPort claim in full, discovered `entry_refs` doesn't exist as running code (new information no other participant had), and refined A′ into "A″" after reading the actual running `src/navigation/` code. Produced the most repo-grounded artifacts (citing exact file/line evidence throughout) and closed with a "substrate-sequencing" framing note — the ADR should honestly say which of its dependencies are built vs. accepted-but-unbuilt, so implementation doesn't discover the gap mid-build.

## Synthesis

### Agreement

Full 4/4 convergence, independently reasoned (not deference), on:
- **Option A's shape** over B and C (Round 1, unanimous, no dissent at any point).
- **D1 — region composition lives in a seeded entry** (`widget_area`), the binding table is a thin, derived, reconciled projection (not hand-authored), mirroring the *actual running* ADR-029 navigation code, not just its spec.
- **D2 — an explicit, typed, server-side, batch-first, cost-bounded resolver contract** is required and was missing from the draft.
- **D3 — widget-type registry splits into data (registration) and code (behavior)**, with behavior Tier-2/3-gated per ADR-024 for any plugin-contributed dynamic type.
- **D4 — ref-typed fields inside widget config must extract into `entry_refs`**, with the caveat that the underlying mechanism is not yet built (Fable's finding) and term-target coverage is narrower than entry-target coverage (Codex's finding).
- **D5 — Contact Form ships in v1** as a thin adapter over the already-built Forms feature, once the MailerPort assumption was corrected.
- **D6 — freeform inline embed** with block-level-atom, no-recursion, and count-clamp guardrails, enforced at the write chokepoint (not just the editor).
- **D7 — default to reuse at placement; the real choice surfaces at edit time** via where-used data, with explicit non-inferred AI tool calls.
- **D8 — a widget resolution failure must degrade to a placeholder, never abort the page render.**
- **D9 — regions stay site-wide only in v1**, inline embed covers the per-page case, per-page region override deferred as a named seam.

### Divergence

None remaining at the recommendation level. The one live nuance is a **scope narrowing, not a disagreement**: Codex's finding that `entry_refs`' current target-kind model may not fully cover term/taxonomy targets the way it covers entry targets — this refines D4's claim rather than contradicting it, and should be stated as an explicit scope boundary in the revised ADR rather than an unqualified "entry_refs covers this."

### Unique Insights

- **Fable's live-repo verification that `entry_refs` doesn't exist as running code** (Round 2) — the single most consequential fact surfaced in either round, because it changes what "reuse the existing mechanism" costs for both D4 and D7, and neither agy nor Codex had this information when they produced their own Round 2 answers (their dispatches ran before Fable's finding was available). Treated as verified fact for this synthesis, not opinion — confirmed against `src/infra/db/schema.ts` and `src/navigation/resolver.ts:21`'s own comment.
- **Codex's "widgets are reusable referenced components, not the universal content-block representation" framing note** — a forward-looking boundary statement worth keeping in the ADR's Consequences section even though it doesn't change v1 scope.
- **agy's N+1/batching question** (Round 1 blind spot) directly shaped Fable and Codex's Round 2 `resolveMany`/batch-first resolver signatures — a case of one peer's blind-spot answer measurably improving two other peers' independent designs.

### Decision Ledger

| Decision Point | Primary | agy (Gemini 3.1 Pro) | Codex (GPT-5.6-sol) | Fable | Agreement | Key Why / Movement |
|---|---|---|---|---|---|---|
| Option A vs B vs C | A | A | A (revise) | A (amend) | Yes | Only A satisfies the shared-instance requirement; B/C fail it by construction, independently re-derived four times. |
| D1 Region-binding structure | A′ (changed from own draft) | A′ (changed from own "Option D") | A′ (changed from lighter fix) | A″ (refined own A′ after reading live nav code) | Yes, full | 3-way independent Round 1 convergence on the flaw; Round 2 converged on the fix, refined by live-code evidence. |
| D2 Resolution contract | New, explicit section needed | Agree | Agree, strengthened (cache/dependency contract) | Agree, grounded in 3 existing precedents | Yes | Independently surfaced by 2 peers in Round 1; unanimous by Round 2. |
| D3 Data vs. code registry | Agree, split proposed | Agree | Agree, sharpened (allowlisted resolver ids only) | Originated the critique | Yes | Fable's Round 1 catch, adopted by all. |
| D4 entry_refs completeness | Agree, "low-cost" | Agree | Agree, with term-target scope caveat | Agree, corrected: not yet built, real v1 dependency | Yes, with a scope qualification | Mechanism agreed; cost/scope corrected by live verification. |
| D5 Contact Form v1 scope | Ship (own position, corrected with evidence) | Ship (changed) | Ship (changed) | Ship (changed) | Yes, full | MailerPort/Forms correction flipped 2 of 4 positions; now unanimous. |
| D6 Embed guardrails | Confirmed | Confirmed | Confirmed, chokepoint-enforced | Confirmed, chokepoint-enforced | Yes | Converged Round 1, sharpened (enforcement point) Round 2. |
| D7 Reuse vs. duplicate default | Confirmed | Confirmed | Confirmed | Confirmed, flagged as D4-dependent | Yes | Converged Round 1, dependency noted Round 2. |
| D8 Failure isolation | Confirmed (own pre-dispatch flag) | Confirmed | Confirmed, sharpened (public vs. preview diagnostics) | Confirmed, "standing gate" framing | Yes | Primary's structural-gap flag, corroborated Round 1, unanimous Round 2. |
| D9 Region scope site-wide | Confirmed | Confirmed | Confirmed | Confirmed | Yes | No dissent at any point. |

### Unresolved Deltas

None at the recommendation level. Open implementation-detail questions for the eventual spec stage (not blocking): exact resolver timeout value, whether/when a cross-request fragment cache is added post-v1, and the precise term-target `entry_refs` extension shape (named seam, not designed here).

## Final Recommendation

**Adopt Option A amended to A″, and revise ADR-047 accordingly before it proceeds to `/audit-work`.** This is not a close call — four independent participants, across two rounds, with one participant actively fact-checking the packet against the live repository rather than trusting it, converged on the same structural design with reasoned position changes (not bare agreement) at every step. The specific amendments to fold into ADR-047:

1. Region composition = a seeded `widget_area` entry per theme-declared region; `widget_region_bindings` becomes a thin, derived, reconciled `(workspace_id, region_key) → area_entry_id` projection — never hand-authored, mirroring the *actual running* `nav_location_bindings` pattern exactly.
2. A new, first-class ADR section: the widget resolution contract — server-side, pre-Liquid, batch-first (`resolveMany`), cost-clamped per type registration, with failure isolation folded in (a resolution failure yields a typed placeholder, never aborts the page).
3. Replace "widget types are data, not code" with an explicit split: type *registration* is data (Tier-1-safe); type *behavior* (the resolver) is core-owned code in v1, Tier-2/3-gated for any future plugin-contributed dynamic type; registry data may only name an allowlisted resolver id, never arbitrary executable references.
4. Widget config's ref-typed fields extract into `entry_refs` via ADR-022 §5's existing vocabulary — **stated honestly as a named v1 build dependency** (a minimal `entry_refs` slice: table + chokepoint extractor), not a free reuse of already-shipped code, with an explicit scope note that term/taxonomy-target coverage is narrower than entry-target coverage for now.
5. Contact Form ships in v1 as a thin adapter over the existing `src/forms/` feature (referencing a `formDefinitionId`, delegating all submission/rate-limit/mail-delivery to Forms' already-built, already-wired pipeline) — no new operational subsystem.
6. Inline embed guardrails (block-level atom, no recursion, count clamp) enforced at the write chokepoint, covering both the live editor and any future server-side AI mutation path equally.
7. Add an explicit substrate-sequencing note distinguishing what ADR-047 depends on that already runs (entries/revisions/OCC, the command gateway) from what it depends on that is accepted contract but not yet built (`entry_refs`), so a spec-writer sequences honestly.

The four peers' full artifacts (schema sketches, resolver interfaces, diff-shaped ADR language, spec-level acceptance criteria, implementation outlines, plain-language overviews) are saved in full at `ADS-project-knowledge/reports/swarm-consensus/offloads/20260721-widgets-adr047/` and should be used directly as source material when revising ADR-047 and drafting the eventual spec — Codex's numbered acceptance criteria (RA-*/WR-*/CF-*/REF-*) in particular are close to spec-ready as written.

**Recommended next step:** revise ADR-047 with the above, then proceed to this project's standard external `/audit-work` pass before treating it as ACCEPTED — per the debate's own convergence, this design should now clear audit cleanly on the points debated here (though audit may of course surface new findings outside this debate's scope).
