# Swarm Consensus Report — Collections, Categories & Tags, Backups/Recovery Screen

- **Date:** 2026-07-14
- **Mode:** `/debate` · 4 rounds (R1 blind → R2 informed, narrow fork → R3 testing a synthesis →
  R4 final, resolved by an explicit Coordinator contribution)
- **Topics:** three independent, previously-unscoped Tovu admin surfaces, dispatched as one combined
  packet to save time.
- **Outcome:** Categories & Tags and the Backups/Recovery screen converged unanimously from Round 1.
  Collections' storage-shape question took all 4 rounds and did not settle until the Coordinator
  contributed its own argued position in Round 4 — all three participants then converged on it.

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

## The Decision (Collections storage shape — took 4 rounds, now unanimous, see ADR-043)

All three participants independently discovered, via direct file verification (not from the packet's
prose), that ADR-022's `entries`/`content_types`/`taxonomies` design — though marked "Accepted" — was
never implemented; the shipped codebase still uses a bespoke `posts` table with a `kind` column. This
became the headline finding of Round 1 and reframed all three topics.

On *where Collections' new content should live*, positions oscillated for three rounds before resolving:

| Round | Fable | Codex | agy |
|---|---|---|---|
| R1 (blind) | new `entries` table, `posts` untouched | sketch implied reuse of `posts` (not a committed position) | sketch implied reuse of `posts` (not a committed position) |
| R2 (disclosed) | **reversed** → additive `posts` evolution (nullable `fields_json` + registry `type`), citing ADR-022 §1's literal text | **reversed** → new `entries` table, `posts` untouched (0.88) | new `entries` table, `posts` untouched (0.95) — but proposed a 3rd option: identity-anchor (`nodes` supertype) |
| R3 (testing the anchor) | identity-anchor (0.78) | plain coexisting tables (0.78) — rejects the anchor's new write-chokepoint coupling | **abandoned own anchor idea** → additive `posts` evolution (0.90), agreeing with Fable's R2 position |
| R4 (final, resolved) | **plain coexisting tables (0.85)** | plain coexisting tables (0.86, held) | **plain coexisting tables (0.95)** |

Three participants held three different final positions through Round 3 — the signature of a genuinely
balanced tradeoff, not insufficient information. Round 4 resolved it: the project owner directly
challenged the Coordinator for never having contributed an actual opinion of its own (see Process
Disclosure), and the Coordinator's Round 4 contribution — an explicit optionality/reversibility argument
— persuaded all three participants independently:

**Optionality is the deciding criterion, not just blast-radius or elegance.** Plain coexistence changes
nothing about `posts` — every other path (unify later, add an anchor later) remains exactly as
buildable in six months as today. Additive `posts` evolution is the one option that *forecloses* paths:
the moment operator-defined Collections content lands in `posts`, it is physically interleaved with
live, real editorial content — reversing that later means untangling already-mixed live production data,
not adding a table. The identity-anchor's benefit (a real taxonomy join target) is itself deferrable at
zero cost, so paying its dual-write/join-tax cost now buys optionality available for free later, if ever
needed. Full reasoning in ADR-043.

## Process Disclosure

Per this project's evidence-over-invention discipline: the Primary/host participant did not run a
genuine blind first-pass position before dispatching peers in Rounds 1-3, contrary to the debate
protocol's own requirement. This was noticed and challenged directly by the project owner mid-session,
not caught by the Coordinator's own process discipline. In Round 4, the Coordinator corrected course and
contributed the optionality argument above as an actual position, disclosed as a Coordinator
contribution rather than a tie-break dressed up after the fact — and all three participants found it
independently persuasive. The final decision is a genuine 4-round unanimous consensus, reached only after
the Coordinator's own participation gap was corrected, not a tie-break imposed over an unresolved split.

## Artifacts

- Packets: `.local-artifacts/swarm-consensus/context/CTX-collections-taxonomy-backups-2026-07-14.md`
  (R1), `CTX-collections-taxonomy-backups-round2-2026-07-14.md` (R2), `-round3-2026-07-14.md` (R3),
  `-round4-2026-07-14.md` (R4)
- Raw peer transcripts: `.local-artifacts/swarm-consensus/runs/20260714-collections-taxonomy-backups/`
- Resulting ADRs: `ADR-043-collections.md`, `ADR-044-categories-and-tags.md`,
  `ADR-045-backups-recovery-screen.md` — all **PROPOSED**, none through `/audit-work` yet.
