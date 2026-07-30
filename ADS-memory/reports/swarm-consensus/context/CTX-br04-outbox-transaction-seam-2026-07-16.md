# Context Packet: BR-04 Outbox-Transaction-Seam Resolution

**Question:** In this codebase (Tovu, a TypeScript modular monolith, ports/adapters, SQLite via
Drizzle + better-sqlite3), a domain mutation's write and its outbox-event enqueue currently do
NOT happen atomically. When a real durable SQLite outbox adapter is built (a future, separate
piece of work — not this debate's job), what mechanism should make them atomic?

**Project type:** brownfield.

## The actual current design (read this first)

`src/core/commands/command.ts` — `executeCommand()`, the single mutation write path every admin
route runs through:

```ts
// Order: idempotency check -> inverse capture -> execute -> record -> (outbox, separately)
const inversePayload = await mutation.captureInverse();
const result = await mutation.execute();               // the domain write
// ...
try {
  await deps.changeSets.insert(header, items);          // the audit-trail write
} catch (recordError) {
  await mutation.rollback?.();                          // compensating rollback if THIS fails
  throw recordError;
}
if (deps.outbox) {
  await deps.outbox.enqueue(event);                     // <-- BR-04: NOT in the try/rollback above
}
```

The file's own doc comment states the current contract plainly: *"The feature mutation and its
change-set record commit as one unit of work (REQ-01 / BR-04): if `changeSets.insert` fails after
`execute` has applied the mutation, the gateway rolls the mutation back via `mutation.rollback`
... Outbox enqueue is the only step outside this boundary (BR-04) — an enqueue failure propagates
but never rolls back the committed change set."*

Today this is low-stakes: the outbox is in-memory (`core/events/memory-bus.ts`'s `InMemoryOutbox`)
and no production-critical consumer depends on redelivery-after-crash. ADR-046 Phase 1 changes
that — once a real durable SQLite outbox adapter exists, "domain state and outbox rows land in the
same database transaction" becomes a stated production gate, and BR-04's current shape (enqueue
happens AFTER the unit of work, with no transactional tie-back) needs a resolved answer.

## A related, already-solved problem in this exact codebase (for grounding, not as the answer)

`src/infra/sqlite/change-set-repo.sqlite.ts` — `SqliteChangeSetRepo.insert()` (built earlier this
session) makes ITS OWN two-row write (a change-set header + N item rows) atomic:

```ts
async insert(record: ChangeSetRecord, items: ChangeSetItemRecord[]): Promise<void> {
  this.db.transaction((tx) => {
    tx.insert(changeSets).values({...}).run();
    for (const item of items) tx.insert(changeSetItems).values({...}).run();
  });
}
```

This is a real, working example of "two related SQLite writes made atomic via
`db.transaction((tx) => ...)`" in this codebase — but it is scoped entirely inside ONE repo class
owning ONE port. It does not, by itself, solve the cross-port problem (a change-set write AND an
outbox write, two different `Port` interfaces, needing to land together).

Also relevant: `src/core/gated-mutations/gateway.ts`'s `plan()`/`confirm()`/`execute()` ceremony
(SPEC-016) solves a *different* kind of "make two things consistent" problem — via a token-based
multi-step protocol with a fresh `authorize()` re-check at execute time, not a shared database
transaction. It is not a drop-in analogy for this question, but peers may find its design
philosophy (or its explicit rejection of a shared-transaction approach) relevant.

`src/infra/sqlite/content-db.ts`'s `seedContentDb()` shows the plainest example of one transaction
spanning multiple tables/repos' worth of inserts directly:
```ts
db.transaction((tx) => {
  tx.insert(schema.workspaces).values(seed.workspace).run();
  for (const post of seed.posts) tx.insert(schema.posts).values({...}).run();
  tx.insert(schema.presentationSettings).values(seed.presentation).run();
});
```
This works because it is boot-time, single-caller, single-file code with no port abstraction in
the way — `executeCommand()`'s situation is different: it calls through `ChangeSetRepoPort` and
`OutboxPort`, two independently-testable interfaces each with an in-memory AND a SQLite
implementation (ADR-006 rule-of-two), used by many call sites across the codebase, not just one.

## Constraints

- This is a **small, bounded design note** — not full Phase 1 implementation. Do not design or
  build the actual durable SQLite outbox adapter; that is separate, future work.
- `executeCommand()`'s existing route-level contract must not change for any of its current
  callers (dozens of admin routes) — whatever the answer is, it must not require every call site
  to change how it invokes `executeCommand`.
- This codebase has an explicit Anti-Abstraction Gate (Constitution Article IV): a new
  cross-cutting abstraction (e.g. a generic shared-transaction-handle port) needs real
  justification — "it would be cleaner" is not sufficient on its own; a rule-of-two (2+ concrete
  consumers) or an equivalently strong reason is expected.
- ADR-046 Phase 1's own table row for Outbox states the target production gate literally as:
  *"write domain state and outbox rows in the same database transaction; claim rows atomically;
  retain attempts/error/next-attempt state; make consumers idempotent."*
- ADR-046's own fold-in (from a prior debate) flagged this exact question and explicitly declined
  to resolve it inline, calling for "its own resolved design decision before implementation
  starts" — this debate is that resolution.

## Options to evaluate (not exhaustive — "something else" is always valid)

**(a) Amend BR-04 itself.** Keep the current two-step shape (execute → record → separately
enqueue) as the PERMANENT design, and extend the *existing* compensating-rollback mechanism
(`mutation.rollback()`) to also cover an outbox-enqueue failure — i.e. outbox enqueue becomes a
third participant in the current capture/rollback unit-of-work, never a real database transaction.

**(b) Make outbox enqueue repo-owned, inside the same write chokepoint transaction as the
change-set insert.** Concretely: `executeCommand()`'s persist step opens ONE shared SQLite
transaction that both the change-set write and the outbox-row write participate in — analogous to
how `SqliteChangeSetRepo.insert()` already makes its own header+items write atomic, extended to
also cover the outbox row.

**(c) Thread an explicit transaction handle through `OutboxPort.enqueue()`** (and, symmetrically,
`ChangeSetRepoPort.insert()`), so the *caller* (`executeCommand`, or whatever composes it) controls
transaction scope explicitly, rather than either port/repo owning it implicitly.

**(d) Something else** — a design this packet did not anticipate.

## Adversarial task

Identify the best design for this specific codebase, reject weak options with reasons grounded in
the actual code above (not generic transactional-outbox-pattern advice), and explain what evidence
or code fact would change your answer.

## Blind Spots (required — every response must include this section)

Name explicitly:
- (a) any viable option this packet failed to list;
- (b) a question we should be asking but aren't (a reframe of the problem, not just a new answer
  to the stated options);
- (c) the single assumption baked into this packet's framing that is most likely to be wrong, and
  why.

## Required output format

1. Your position: which option (a/b/c/d), stated plainly.
2. Why, grounded in the actual code excerpts above.
3. The strongest case against your own position.
4. Blind Spots (the three required sub-points above).
5. What evidence or repo fact would change your mind.

End your response with the literal marker `<<SWARM_END>>` on its own line.
