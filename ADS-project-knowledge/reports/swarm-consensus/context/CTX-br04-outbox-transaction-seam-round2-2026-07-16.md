# Round 2 (informed) — BR-04 outbox-transaction-seam resolution

This is Round 2 of a Swarm Consensus debate. Below is every participant's full Round 1 response,
verbatim, plus two facts the Primary (Coordinator) independently verified from source after Round
1, plus the Primary's own Round 2 rebuttal. Read all of it, then answer the Round 2 ask at the
bottom.

---

## Primary (Claude Sonnet 5) — Round 1 (frozen before any peer was dispatched)

**Position: (b), with a caveat.**

**Why:** (a) is the weakest fit for what "durable" means — compensating rollback only protects
against an in-process exception, not a process crash between two writes, which is exactly what a
durable outbox exists to survive. (c) is architecturally "correct" in a vacuum but this codebase's
Anti-Abstraction Gate (Constitution Article IV) requires a real rule-of-two justification before a
new cross-cutting abstraction, and there is exactly one concrete consumer of a shared-transaction
seam today. (b) directly extends a pattern already proven in this codebase this session
(`SqliteChangeSetRepo.insert()`'s `db.transaction()` for its own header+items write, and
`content-db.ts`'s `seedContentDb()` for a multi-table single-transaction write).

**Strongest case against my own position:** (b) as I first described it is underspecified on the
actual mechanism — something has to change at the interface level even if narrower than (c).

**Blind Spots:**
- (a) Unlisted option: derive the outbox from the change-set write itself (CDC-style), sidestepping
  the two-write-atomicity problem by having only one write.
- (b) Unasked question: does `mutation.execute()` (the domain write) run inside a transaction
  today at all? If not, "make domain write + outbox atomic" is a bigger claim than the packet's
  framing suggests.
- (c) Likely-wrong assumption: that "change-set + outbox" is the pairing that needs to be atomic.
  Re-reading ADR-046's "domain state and outbox rows in the same transaction," it may mean the
  DOMAIN write, not the change-set audit record — a different, larger pairing than any of the
  three options address.

**What would change my mind:** confirmation of which pairing ADR-046 actually means.

---

## agy / Gemini 3.1 Pro (High) — Round 1

**Position: (c)** — thread an explicit transaction handle through `OutboxPort.enqueue()`,
`ChangeSetRepoPort.insert()`, and `mutation.execute()`.

**Why:** ADR-046 Phase 1 literally says "domain state and outbox rows land in the same database
transaction." The domain write (`mutation.execute()`) happens before the audit write and is
currently isolated (proven by the existing compensating-rollback need). (a) fails — compensating
rollbacks don't survive process crashes. (b) fails — it only groups change-set + outbox, leaving
domain state outside the transaction, violating the ADR's literal text. (c) is the only option that
honors the ADR as written; the Anti-Abstraction Gate explicitly allows an abstraction given a
"rule-of-two or equivalently strong reason," and atomicity across three operations (domain, audit,
outbox) is that reason.

**Strongest case against own position:** forces an infrastructure concern into the core `Mutation`
interface — every mutation's `execute()` must be refactored to accept/pass a transaction context,
increasing boilerplate and coupling the domain layer to relational-transaction lifecycle.

**Blind Spots:**
- (a) Unlisted option: `AsyncLocalStorage` to implicitly thread the transaction context — a
  UnitOfWork middleware stores the handle in ALS so domain/change-set/outbox retrieve it
  automatically, achieving atomicity without polluting port signatures.
- (b) Unasked question: why does `mutation.execute()` perform un-orchestrated DB writes directly
  instead of returning a declarative representation of changes for `executeCommand` to persist in
  one infra-owned chokepoint?
- (c) Likely-wrong assumption: that domain state and the change-sets/outbox tables live in the
  SAME physical SQLite database. If modules write to separate `.sqlite` files, a shared transaction
  needs explicit `ATTACH DATABASE` coordination or is impossible.

**What would change its mind:** evidence that `mutation.execute()` does NOT write to the database
directly but only mutates in-memory aggregates, with `changeSets.insert()` as the sole persistence
mechanism (event-sourcing-shaped) — then (b) becomes correct.

---

## Codex / GPT-5.6-terra (reasoning=xhigh) — Round 1

**Position: (d) — a narrow command-atomicity coordinator, not a generic transaction-handle port.**
`executeCommand()` invokes one command-scoped atomic boundary enclosing `mutation.execute()` →
change-set insert → every outbox enqueue caused by that command. SQLite implementation opens one
transaction on `content.db`; in-memory implementation preserves current compensation. The
coordinator exposes a callback/command operation, not a raw Drizzle/better-sqlite3 handle. Existing
routes keep calling `executeCommand()` unchanged.

**Why:** (b) as phrased is insufficient — `SqliteChangeSetRepo` only makes header+items atomic,
not the domain mutation; a committed domain write can still land with neither durable record nor
outbox row. Verified: `features/post/post.ts`'s update mutation calls `deps.outbox.enqueue()`
directly, before `executeCommand()`'s own `change-set.applied` enqueue — a durable solution must
cover both, not just the gateway's final event. (a) cannot meet the literal production gate
(compensation can't fire after process death). (c) is too broad — threading a generic transaction
object through every port and every `CommandMutation` leaks a persistence concern across many call
paths; the repo's SQLite adapters already use manual `BEGIN IMMEDIATE`/`COMMIT` in places, so
layering a generic handle risks nested-transaction failures without designed savepoint rules. The
proposed coordinator has an immediate rule-of-two: in-memory compensation and SQLite transactional
execution are two genuinely different concrete implementations of the same command-atomicity
policy — narrower than a reusable "shared transaction" abstraction, owns no domain semantics,
doesn't leak SQL into core or routes.

**Strongest case against own position:** still a new cross-cutting abstraction; its callback can
hide transaction scope so thoroughly that feature code accidentally performs non-transactional
external work inside it. (c) is more mechanically explicit and preferable if mutations end up
spanning multiple DB connections or can't be made transaction-participating cheaply.

**Blind Spots:**
- (a) Unlisted option: SQLite-trigger-based outbox (domain-table writes cause DB-level outbox
  inserts) — viable for a tight event set but likely poor here since event envelopes carry
  application metadata and duplication across tables would bypass the `OutboxPort` seam.
- (b) Reframe: not "how do two ports share a transaction" but "which writes and event emissions
  constitute one command's durable commit, and which must be forbidden inside it" — including the
  feature-level `updatePost()` event, not just the gateway-level one.
- (c) Likely-wrong assumption: that `executeCommand()` is the universal mutation/outbox chokepoint.
  Direct `OutboxPort` use exists in feature services/routes outside it; resolving BR-04 alone
  doesn't certify ADR-046's broader gate for every production-critical producer.

**What would change its mind:** a more local (b)-style fix if the durable outbox is only ever used
for `change-set.applied` and every mutation uses one known SQLite repo with no independent event
emission (evidence suggests otherwise — post.ts already contradicts this). Would choose (c) if
future writes must span multiple independently-managed DB connections.

---

## Fable / Claude Fable 5 — Round 1

**Position: (b)** — outbox enqueue becomes repo-owned, inside the same SQLite transaction as the
change-set insert. Concretely: `ChangeSetRepoPort.insert(record, items, events?)` — the domain
event rides into the existing persistence call; `SqliteChangeSetRepo.insert()` writes header +
items + outbox row(s) in one synchronous `db.transaction` callback (the exact pattern it already
uses for header+items, extended by one row). `executeCommand()`'s separate `deps.outbox.enqueue()`
step is deleted for this event; BR-04's carve-out ceases to exist for this producer rather than
being patched.

**Why:** The driver decides this and rules out (c) — every transaction in this codebase
(`SqliteChangeSetRepo.insert()`, `seedContentDb()`) is a SYNCHRONOUS `db.transaction((tx) => {...
.run() })` callback, but the ports are async (`OutboxPort.enqueue(): Promise<void>`,
`ChangeSetRepoPort.insert(): Promise<void>`). You cannot `await` a port call inside a better-sqlite3
sync transaction callback. Escape hatches are all bad: holding `BEGIN` open across awaits (unsafe
under concurrent requests on the shared connection), growing sync port variants (new abstraction,
zero second consumers), or rippling `enqueue(event, tx?)` to every call site (several: submit-
service.ts:111, entries/write-service.ts:172/280/323, forms/write-service.ts). (a) doesn't solve
the actual problem — compensating rollback only fires on in-process exceptions, not crash/restart;
once `SqliteChangeSetRepo` is live, (a) would have to delete a committed durable row, widening
compensation machinery exactly when the code's own docs (command.ts:84) say it should retire. (b)
is already half-built: every field `executeCommand` puts in the event is already present in
`(record, items)` except a fresh event id; this changes one port method, two adapters, zero route
call sites. ADR-046 fold-in item 5 (the webhook-delivery envelope gap) corroborates the pattern:
"co-persist related rows in one adapter-owned transaction," not tx-handle threading — giving it a
rule-of-two. The gated-mutations gateway analogy points the same way: atomicity in this codebase is
consistently adapter/owner-local, never caller-threaded.

**Honest scope note:** resolves change-set↔outbox atomicity only. The domain write remains coupled
by compensating rollback until Phase 3 — forward-compatible with (b); (a) forecloses that, (c)
pre-pays for generality the driver can't deliver.

**Strongest case against own position:** `ChangeSetRepoPort.insert` now mentions `DomainEvent`,
entangling the commands-persistence contract with the events vocabulary (no dependency-direction
violation, both live in `core/ports.ts`, but breaks change-set.ts's stated "adapters must satisfy
this unchanged" promise). Satisfies the ADR-046 gate's letter only partially — domain write stays
outside until Phase 3; if Phase 3 ends up threading transaction scope through mutations anyway,
(b) is a detour Phase 3 partially unwinds. Outbox rows now arrive via two doors (repo-co-persisted
for the command path, plain `enqueue` for forms/entries) — a subtle invariant to keep tested.

**Blind Spots:**
- (a) Unlisted options: derive the outbox from the change-set rows themselves (atomicity free by
  construction, no second write); or a SQLite `AFTER INSERT` trigger (atomic by definition, zero
  port changes, but buries event-shaping logic in SQL, invisible to the type system — would
  reject, but packet should have named it to kill it).
- (b) Reframe: does `change-set.applied` even need durable delivery at all? The consumer that
  genuinely needs redelivery-after-crash (per ADR-046 fold-in item 2) is forms' notification lane,
  fed by `submit-service.ts:111` — NOT by `executeCommand`'s event. The debate may be resolving the
  seam for the producer with the least-demanding consumer.
- (c) Likely-wrong packet assumption: that making change-set+outbox atomic satisfies the Phase 1
  gate at all. The gate says "domain state," the packet's option (b) wording quietly substitutes
  "change-set write" for that. If the gate's author meant it literally, none of the three listed
  options passes it as scoped — the resolution must either amend the gate's wording to match the
  phased reality, or explicitly record the residual compensating-rollback window as accepted until
  Phase 3.

**What would change its mind:** a committed near-term plan to move off better-sqlite3 to an async-
transaction driver (kills the sync-callback argument against (c)); a drafted Phase 3 design that
already commits to caller-scoped transactions around `mutation.execute()` (then build (c) once,
skip (b)); evidence that command-path events stop being derivable from `(record, items)` alone
(strengthens explicit event-passing but may force the seam to move up regardless); a concrete
second consumer for a generic transaction-handle port (flips the Anti-Abstraction Gate verdict).

---

## Primary (Claude Sonnet 5) — two facts verified from source after Round 1

1. **The sync-transaction-callback wall is real and verified.** Drizzle's better-sqlite3
   `transaction<T>(fn: (tx) => T): T` (`node_modules/drizzle-orm/better-sqlite3/session.d.ts`) is
   fully synchronous — no `Promise<T>`. `OutboxPort.enqueue()` and `ChangeSetRepoPort.insert()` are
   both `Promise<void>` (`core/ports.ts:128`, `change-set.ts:76`). This confirms Fable's central
   technical objection to option (c), and it applies equally to the domain-write-inclusive half of
   Codex's (d) — `mutation.execute()` is an arbitrary async call; wrapping it in the same atomic
   boundary as change-set/outbox hits the identical wall.

2. **The direct-enqueue surface is larger than either peer found.** Verified 13+ files call
   `OutboxPort.enqueue()` directly outside `executeCommand()`: `features/post/post.ts:192`,
   `forms/submit-service.ts:111`, `features/entries/write-service.ts:172/280/323`,
   `workspace/create.ts`, `taxonomy/write-service.ts`, `content-types/lifecycle.ts`,
   `navigation/menu-service.ts`, `integrations/delivery.ts`, `redirects/phase-handler.ts`,
   `redirects/redirects.ts`, `newsletter/send-pipeline.ts`. Confirms and sharpens both Codex's
   finding and Fable's Blind Spot (b): resolving BR-04 at the `executeCommand()` gateway touches a
   small minority of the real outbox-producer surface, and the actual demand trigger (forms'
   notification lane) isn't touched by `executeCommand()` at all.

## Primary (Claude Sonnet 5) — Round 2 rebuttal

**Position: converges to (b), Fable's shape, with two things stated explicitly rather than
implied.** BR-04's resolution — as the small, bounded design note this debate was scoped to
produce — should widen `ChangeSetRepoPort.insert()` to accept the already-fully-formed
`DomainEvent` `executeCommand()` builds today, with `SqliteChangeSetRepo.insert()` writing it as a
third participant in its existing `db.transaction()` callback. This resolves the
`executeCommand()`/`change-set.applied` producer specifically; changes one port signature, two
adapters; changes zero route call sites.

Two things the resolution must say explicitly:
- It does NOT bring `mutation.execute()` into the transaction — the compensating-rollback carve-out
  narrows but does not disappear until Phase 3 gives domain writes a shared transaction-
  participating boundary. Any claim that this fully satisfies ADR-046's "domain state and outbox
  rows in the same transaction" wording is false; that gap is accepted-and-documented, not solved.
- It does NOT cover the 12 other direct-enqueue producers. Each is its own future, individually-
  pulled Phase 1 durability slice, applying the SAME pattern locally when that producer's
  durability is actually prioritized — extending ADR-046 fold-in item 4's "pull-based per
  capability" instruction to BR-04's own scope, rather than treating BR-04 as one universal fix.

**Strongest argument against this position:** Fable's own Blind Spot (c) — "domain state" in
ADR-046's literal text may mean the actual entity write, not the change-set record. If so, every
option in the original packet (including this converged one) fails the gate as literally worded,
and the honest move is to amend the gate's wording to describe the phased reality rather than claim
compliance.

**What would change my mind:** confirmation that ADR-046's Phase 1 gate genuinely intends full
domain-write+outbox atomicity now, not phased — in which case the answer is "cannot be delivered
without Phase 3 landing first," stated plainly.

---

## Round 2 ask

For each peer: do the two verified facts above change your position? If yes, to what, and why —
be specific about the mechanism, not just the label. If no:

- **agy**: how does an explicit transaction handle work inside a synchronous better-sqlite3
  `db.transaction()` callback for an async port method, without one of the three bad escape
  hatches (hold BEGIN across awaits / grow sync port variants / ripple a tx param to 13+ call
  sites)?
- **Codex**: does your "command-scoped atomic boundary" still propose enclosing `mutation.execute()`
  itself inside the same transaction as the change-set/outbox write? If so, how does it avoid the
  same synchronous-callback wall? If not — if the coordinator was always meant to wrap only
  change-set+outbox, with the domain write handled by the existing compensating-rollback path —
  how does that differ in substance from Fable's (b), beyond naming?
- **Fable**: Codex's coordinator framing is structurally similar to your (b) but presented as a
  dedicated command-atomicity object rather than a widened `ChangeSetRepoPort.insert()` signature.
  Is there a real difference, or is this the same resolution under two names? If real, which is
  better and why?

State: current position, whether it changed and why, the strongest argument against your current
position, and what would change your mind. End with `<<SWARM_END>>`.
