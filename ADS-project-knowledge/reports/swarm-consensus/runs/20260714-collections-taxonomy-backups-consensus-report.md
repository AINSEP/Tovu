# Swarm Consensus Report — Collections, Categories & Tags, Backups/Recovery Screen

- **Date:** 2026-07-14
- **Mode:** `/debate` · 3 rounds (R1 blind → R2 informed, narrow fork → R3 final, testing a synthesis)
- **Topics:** three independent, previously-unscoped Tovu admin surfaces, dispatched as one combined
  packet to save time.
- **Outcome:** Categories & Tags and the Backups/Recovery screen converged unanimously. Collections'
  storage-shape question did **not** converge after 3 rounds — resolved by Coordinator tie-break.

## The Swarm

| Participant | Model | Access |
|---|---|---|
| **Primary** | Claude Sonnet 5 (host) | coordinator — did **not** run a genuine blind first pass (process gap, disclosed) |
| **Fable** | in-host Anthropic-voice subagent (Opus) | full repo read access |
| **Codex** | gpt-5.5, reasoning=high | read-only repo access (`codex exec -s read-only`) |
| **agy** | Gemini 3.1 Pro (High) | full repo read access via `--add-dir` + `<<PEER_DISPATCH>>` marker (Round 1 attempt 1 was packet-only due to a dispatch error, corrected before Round 1 attempt 2) |

## Dispatch Notes

- Round 1's first Codex attempt ran out of its turn budget mid-research without producing a final
  answer (it had discovered the ADR-022 gap but never wrote up its position) — retried with an explicit
  "stop researching, write the answer" instruction, which resolved it.
- Round 1's first agy attempt was accidentally packet-only (no repo access), because giving agy
  `--add-dir` access to the repo also causes it to auto-load this repo's own `AGENTS.md`/`CLAUDE.md`
  Coordinator-persona bootstrap. Fixed by prepending the `<<PEER_DISPATCH>>` marker (the same
  deterministic startup-skip marker `AGENTS.md` already recognizes for Codex), verified via a probe
  before the real dispatch. Both fixes are now the standing pattern for future agy dispatches needing
  real repo access.

## The Decision (converged, unanimous, all 3 rounds)

**Categories & Tags:** one shared taxonomy system (`taxonomies`/`terms`/`entry_terms`), categories =
hierarchical, tags = flat, real relational tables never JSON arrays, soft polymorphic join to content so
it ships independently of and before Collections. See ADR-044.

**Backups/Recovery screen:** two separate screens (never tabs) consuming ADR-041's already-decided
primitive; Recovery's information architecture centers on a blocking, itemized "what would be discarded"
disclosure before any restore confirmation; capability- and state-aware degraded modes. See ADR-045.

## The Decision (NOT converged — Collections storage shape, see ADR-043)

All three participants independently discovered, via direct file verification (not from the packet's
prose), that ADR-022's `entries`/`content_types`/`taxonomies` design — though marked "Accepted" — was
never implemented; the shipped codebase still uses a bespoke `posts` table with a `kind` column. This
became the headline finding of Round 1 and reframed all three topics.

On *where Collections' new content should live*, positions oscillated across all three rounds without
settling:

| Round | Fable | Codex | agy |
|---|---|---|---|
| R1 (blind) | new `entries` table, `posts` untouched | sketch implied reuse of `posts` (not a committed position) | sketch implied reuse of `posts` (not a committed position) |
| R2 (disclosed) | **reversed** → additive `posts` evolution (nullable `fields_json` + registry `type`), citing ADR-022 §1's literal text | **reversed** → new `entries` table, `posts` untouched (0.88) | new `entries` table, `posts` untouched (0.95) — but proposed a 3rd option: identity-anchor (`nodes` supertype) |
| R3 (final, testing the anchor) | identity-anchor (0.78) | plain coexisting tables (0.78) — rejects the anchor's new write-chokepoint coupling | **abandoned own anchor idea** → additive `posts` evolution (0.90), agreeing with Fable's R2 position |

Three participants, three different final positions, each independently reasoned and each defensible.
This is the signature of a genuinely balanced tradeoff, not insufficient information — a fourth round was
judged unlikely to converge further.

**Coordinator tie-break (Primary, post-hoc, not a blind prior position): plain coexisting tables.**
Reasoning: (1) every participant who fully reasoned through the identity-anchor's cost — including its
own author, agy — ultimately rejected it once weighed against a permanent dual-write-transaction and
read-path join tax; (2) the "taxonomy needs a real join target" objection that drove Fable's Round 2
reversal already has a proven, precedented answer in this codebase (ADR-041's own soft cross-table
actor-identity reference across the sidecar/`content.db` boundary); (3) this codebase's single most
repeated architectural value across nearly every accepted ADR is protecting live content from anything
new and unproven, and plain coexistence preserves the cleanest possible abort path for Collections if it
doesn't pan out. Full reasoning in ADR-043.

## Process Disclosure

Per this project's evidence-over-invention discipline: the Primary/host participant did not run a
genuine blind first-pass position before dispatching peers in Round 1, contrary to the debate protocol's
own requirement. This was noticed and disclosed mid-session (the user asked directly), not caught by the
Coordinator's own process discipline. Recorded here, and in ADR-043's Process Note, rather than silently
omitted.

## Artifacts

- Packets: `.local-artifacts/swarm-consensus/context/CTX-collections-taxonomy-backups-2026-07-14.md`
  (R1), `CTX-collections-taxonomy-backups-round2-2026-07-14.md` (R2), `-round3-2026-07-14.md` (R3)
- Raw peer transcripts: `.local-artifacts/swarm-consensus/runs/20260714-collections-taxonomy-backups/`
- Resulting ADRs: `ADR-043-collections.md`, `ADR-044-categories-and-tags.md`,
  `ADR-045-backups-recovery-screen.md` — all **PROPOSED**, none through `/audit-work` yet.
