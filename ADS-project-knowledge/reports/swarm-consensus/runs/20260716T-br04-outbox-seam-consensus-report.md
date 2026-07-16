# Consensus Report

**Date:** 2026-07-16
**Prompt:** ADR-046's BR-04 outbox-transaction-seam resolution — see context packet
**Context Packet:** `ADS-project-knowledge/reports/swarm-consensus/context/CTX-br04-outbox-transaction-seam-2026-07-16.md` (Round 1), `.../CTX-br04-outbox-transaction-seam-round2-2026-07-16.md` (Round 2)
**Mode:** debate
**Controls:** `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300` (defaults; not overridden)
**Primary model:** Claude Sonnet 5

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | claude (host) | — | Claude Sonnet 5 | 2.1.201 (Claude Code) | host session | Responded | 2 rounds |
| Peer | codex | — | gpt-5.6-terra (reasoning=xhigh) | codex-cli 0.144.3 | repo-local evidence (today's ADR-046 debate run, exact CLI-version match; overrides home-config default of gpt-5.5) | Responded | 2 rounds (+1 handshake) |
| Peer | agy | — | Gemini 3.1 Pro (High) | agy 1.1.3 | repo-local evidence (today's ADR-046 debate run) | Responded (Round 2 output contained fabricated sections falsely attributed to Codex/Fable — discarded, see note below) | 2 rounds (+1 handshake) |
| Peer (Addition, explicit user request) | in-host subagent | claude-fable-5 | Claude Fable 5 | n/a | user-directed, model param | Responded | 2 rounds |

**Note on agy Round 2 integrity:** agy's Round 2 output contained three headed sections — one genuine (its own position) and two fabricated, presented as if they were Codex's and Fable's real Round 2 responses, with invented wording that did not match either peer's actual output. The fabricated sections were discarded entirely; only agy's own genuine section (verified as internally consistent with its Round 1 position and the verified facts) was used in synthesis. This matches a known, previously-documented agy failure mode in this project.

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| codex | json (JSONL) | `agent_message` items from event stream | clean, no errors either round | 0 retries; handshake probe + 2 rounds all succeeded on first attempt |
| agy | text (pty-wrapped) | full stdout, ANSI-stripped | clean | 0 retries; handshake + 2 rounds succeeded on first attempt; Round 2 required manual discard of fabricated sub-sections (see note above) |
| in-host (Fable) | agent final message | direct | n/a | 0 retries; both rounds succeeded on first attempt |

## Debate Trace

**Round 1 (blind, independent):**
- Primary (frozen before dispatch): (b), with an unresolved "underspecified mechanism" caveat.
- agy: (c) — full transaction-handle threading including the domain write, citing ADR-046's literal text and the Anti-Abstraction Gate's rule-of-two exception.
- Codex: (d) — a narrow "command-atomicity coordinator" enclosing `mutation.execute()` → change-set insert → outbox enqueue; found that `post.ts`'s update mutation already calls `OutboxPort.enqueue()` directly, separately from `executeCommand()`'s own event.
- Fable: (b) — widen `ChangeSetRepoPort.insert()` to co-persist the outbox row inside its existing synchronous transaction; identified the load-bearing technical fact (better-sqlite3's `db.transaction()` is synchronous, both relevant ports are async) that would decide the debate, and found the same direct-enqueue-elsewhere pattern Codex found, plus eight more sites.

**Primary verification (between rounds):** confirmed both the sync/async transaction-signature mismatch (via `node_modules/drizzle-orm/better-sqlite3/session.d.ts`) and the full direct-enqueue site list (13+ files, grep-verified) — both true, both larger/more decisive than any single peer's Round 1 claim.

**Round 2 (informed):**
- Primary: converged to (b) (Fable's shape), adding two explicit disclaimers (domain write stays outside the transaction until Phase 3; the 12 other direct-enqueue producers are unaddressed, future pull-based slices).
- agy: converged (c)→(b) — conceded the sync-transaction wall is a hard technical veto against threading an async operation into a sync callback.
- Codex: converged (d)→(b) — conceded its coordinator is unbuildable under this driver once `mutation.execute()` is excluded, and that a coordinator wrapping only change-set+outbox "is the same resolution under two names" as (b).
- Fable: unchanged from Round 1, reinforced by both verified facts; directly answered the Primary's ask about Codex's (d) vs. its own (b) (see Individual Responses below for the full argument — the short version: once the sync wall rules out enclosing `mutation.execute()`, a coordinator's only buildable SQLite implementation takes data in, not code in, which *is* (b) under a different name, and the widened-port version wins on Anti-Abstraction Gate grounds and on eliminating the "hide non-transactional work inside a callback" risk Codex itself named). Surfaced a new fact: no outbox table exists yet in `schema.ts`, and `memory-bus.ts` is the only `OutboxPort` implementation — so (b)'s SQLite half is born alongside the durable-outbox migration, not retrofitted onto a live path.

**Agreement:** 4/4 (Primary + all 3 peers) on decision point "which mechanism resolves BR-04" = (b). `agreement_percent = 100%`, exceeding `min_confidence=0.90`. Debate stopped at Round 2 (convergence reached; `max_rounds=2` would have stopped it here regardless).

## Individual Responses

### Primary: Claude Sonnet 5
See Debate Trace. Round 1 position (b, underspecified) → Round 2 converged position (b, fully specified: widen `ChangeSetRepoPort.insert()` to accept the pre-built `DomainEvent`, co-persist inside the existing SQLite transaction, two explicit disclaimers required in the resolution text).

### Codex GPT-5.6-terra (xhigh)
Round 1: proposed (d), a command-atomicity coordinator, on the strength of finding `post.ts`'s direct outbox enqueue and arguing (c) was too broad and (a) insufficient. Round 2: conceded (d) is unbuildable once the sync-transaction wall applies to `mutation.execute()`, and that a change-set+outbox-only coordinator is "the same resolution under two names" as (b) — converged fully, no residual disagreement.

### Gemini 3.1 Pro (High) (via agy)
Round 1: proposed (c), citing ADR-046's literal wording and the Anti-Abstraction Gate's exception clause; raised a sharp blind spot about whether all modules share one physical SQLite file. Round 2 (genuine section only): converged to (b), citing the sync-transaction wall as "a hard technical veto"; explicitly named it as "admitting defeat on the primary goal of ADR-046 Phase 1" — the strongest statement of the residual-gap disclaimer's cost among all four participants.

### Claude Fable 5
Round 1: proposed (b) directly, with the decisive technical argument (verified independently by the Primary) already fully formed — the only peer to reach the eventually-converged answer without needing Round 2 to change position. Round 2: unchanged, but substantially deepened — directly dismantled Codex's (d) as equivalent-but-worse once the sync wall is granted, verified two new facts (no outbox table exists yet; `memory-bus.ts` is the sole `OutboxPort` implementation), and named four concrete falsification conditions for its own position (a committed Phase 3 chokepoint design; a real second same-transaction consumer; an async-driver migration; a decision that `change-set.applied` needs no durability at all).

## Synthesis

### Agreement
All four participants converged on **(b)**: widen `ChangeSetRepoPort.insert()` to accept the fully-formed `DomainEvent`, have the SQLite adapter co-persist it inside its existing synchronous `db.transaction()` callback (the same pattern already proven for header+items), and delete `executeCommand()`'s separate `outbox.enqueue()` call for this event. Zero route call sites change. All four also agreed the resolution must carry two disclaimers rather than imply full compliance: (1) the domain write (`mutation.execute()`) stays outside the transaction — BR-04's compensating-rollback carve-out narrows but does not disappear until Phase 3; (2) the 12+ other direct-`OutboxPort.enqueue()` producers are unaddressed by this resolution and are each their own future, individually-pulled durability slice.

### Divergence
None remaining after Round 2. Round 1's divergence (agy: (c); Codex: (d); Fable/Primary: (b)) was resolved by a single verifiable technical fact (the sync/async transaction-signature mismatch), not by preference — both agy and Codex explicitly conceded their Round 1 positions were unbuildable once that fact was confirmed, rather than being argued out of them.

### Unique Insights
- **Fable** (Round 1, independently verified): the sync-transaction-callback wall itself — the single fact that decided the entire debate.
- **Codex** (Round 1, independently verified): `post.ts` calls `OutboxPort.enqueue()` directly, outside `executeCommand()` — the seed of the "direct-enqueue surface is bigger than BR-04's own scope" finding.
- **Fable** (Round 2, verified): no outbox table exists in `schema.ts` yet; `memory-bus.ts` is the only `OutboxPort` implementation. (b)'s durable half is a birth, not a retrofit.
- **agy** (Round 1, not yet acted on): a same-physical-database assumption risk (do all modules share `content.db`, or could a future module use a separate SQLite file, making even (b)-style co-persistence impossible without `ATTACH DATABASE`?) — worth a one-line confirmation in the design note, not a blocker for this resolution (content.db is confirmed shared today).

### Decision Ledger

| Decision Point | Primary | Codex GPT-5.6-terra | Gemini 3.1 Pro | Fable | Agreement | Key Why / Movement |
|---|---|---|---|---|---|---|
| BR-04 resolution mechanism | (b) → (b), fully specified | (d) → (b) | (c) → (b) | (b), unchanged | Yes (4/4, Round 2) | Sync/async transaction-signature mismatch (Drizzle better-sqlite3 `transaction<T>(fn): T` vs. `Promise<void>` ports) is a hard, verified technical constraint that rules out both (c) and the domain-write-inclusive half of (d); (b) is the only option buildable under the current driver without a new cross-cutting abstraction lacking a rule-of-two justification. |
| Does this resolution satisfy ADR-046's literal "domain state and outbox rows" wording? | No — must be disclosed | No — must be disclosed | No — "admits defeat" on the literal goal | No — must be disclosed via amended wording | Yes (4/4) | All four agree the literal gate is not met by any Phase-1-buildable option; the honest move is amending/annotating the gate's text to describe the phased reality (Phase 1: producer-local atomicity; Phase 3: domain-write participation), not claiming compliance. |
| Scope of this resolution vs. the other 12+ direct-enqueue producers | Out of scope, future pull-based slices | Out of scope, future pull-based slices | (implicit agreement via convergence) | Out of scope explicitly, applying ADR-046 fold-in item 4's "pull-based per capability" | Yes (4/4) | Matches ADR-046's own established sequencing philosophy; extending it to BR-04 avoids re-litigating "fix everything at once" per producer. |

### Unresolved Deltas
None. Full convergence at Round 2.

## Final Recommendation

**Amend BR-04 as follows** (this is the short design note the debate was scoped to produce):

`ChangeSetRepoPort.insert(record: ChangeSetRecord, items: ChangeSetItemRecord[], event?: DomainEvent): Promise<void>`

- `SqliteChangeSetRepo.insert()`: when `event` is present, write it as a durable outbox row inside the same synchronous `db.transaction()` callback that already writes the header + items (requires the durable-outbox table, itself part of this same Phase 1 slice — no live outbox path exists to retrofit).
- `InMemoryChangeSetRepo.insert()`: when `event` is present, forward it to the injected in-memory event bus, preserving today's behavior exactly.
- `executeCommand()` (`core/commands/command.ts`): construct the `change-set.applied` event as it does today, pass it as `insert()`'s third argument, and delete the separate `deps.outbox.enqueue(event)` call. The `mutation.rollback()` compensating path is unchanged — it still covers `changeSets.insert()` failure; it does not need to widen, since the outbox write now succeeds or fails atomically with the record it was already covering.
- **Explicitly document two residual gaps in BR-04's amended text, not just in this report:** (1) `mutation.execute()` — the actual domain write — remains outside this transaction; the compensating-rollback carve-out narrows (one fewer failure path) but does not disappear until Phase 3 gives domain writes a shared transaction-participating boundary. (2) This resolution covers only the `executeCommand()`/`change-set.applied` producer. `post.ts`, `submit-service.ts`, `entries/write-service.ts` (×3), `workspace/create.ts`, `taxonomy/write-service.ts`, `content-types/lifecycle.ts`, `navigation/menu-service.ts`, `integrations/delivery.ts`, `redirects/*` (×2), and `newsletter/send-pipeline.ts` all call `OutboxPort.enqueue()` directly and are unaddressed — each is its own future, individually-pulled ADR-046 Phase 1 durability slice, applying this same adapter-owned co-persistence pattern locally when that producer's durability is actually prioritized.

This unblocks the Outbox Phase-1 slice's SQLite adapter to be built next, with BR-04 resolved for its own producer and the residual scope named rather than implied.
