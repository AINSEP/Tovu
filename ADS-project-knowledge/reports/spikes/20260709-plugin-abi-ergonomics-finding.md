# FINDING — Is the frozen plugin ABI painful to author a store against? (ABI ergonomics probe)

Date: 2026-07-09 · Method: `/cowork` (Opus + Fable + Codex gpt-5.5 + Gemini 3.1 Pro), 4-file throwaway
probe run against real synchronous better-sqlite3. Deliverable of the probe; the code is disposable.
**Status: exploratory — no ADR changed. Items tagged `[ADR-CANDIDATE]` are update candidates for the owner.**

## What we measured (real numbers from `probe.test.ts`)
A single "reserve 1 unit of item A **and** B, both-or-neither, only-if-in-stock, then write an audit row":
- **5 data round-trips** (2 reads + 3 writes) + **3 capability acquisitions** + 7 clones for ONE
  logical operation. *(The probe's aggregate host counter prints 6 round-trips / 7 acquisitions /
  9 clones — that total also includes the four deliberately-failing negative probes, incl. the
  Date-payload write that reaches the sqlite bind step before being rejected. The logical-op-only
  figures above are the honest ones.)*
- That is the *uncontended* best case (0 retries, 0 compensations). Under contention it grows (below).
- Projection: at a realistic ~1ms per real IPC hop (future `utilityProcess`), ~5 round-trips ≈ ~5ms of
  pure boundary-crossing for the simplest correct checkout step — before any business logic.

## The verdict, split two ways (Fable's frame — only the first column can justify touching the ABI)

### ABI-FROZEN — baked into the contract; near-irreversible once third parties exist → act NOW
1. **No transaction across `await` forces hand-rolled optimistic-concurrency + compensation.**
   `[ADR-CANDIDATE]` The reservation can only be made safe by (a) `expectedVersion` guards on every
   write and (b) a **manually written compensating write** to undo A's decrement when B conflicts
   (see `hello.plugin.ts` — the probe counts `retries`/`compensations`). This is correctness-critical,
   easy-to-get-wrong code that EVERY store/inventory/coupon/sequential-order plugin will re-implement.
   **And it's a trap even for careful authors:** the probe's own compensating write (restoring A when B
   conflicts) has NO `expectedVersion` guard — so the "undo" is itself racy and can clobber a third
   actor's decrement. That the *careful, reviewed* hand-rolled version is still subtly wrong is the
   strongest argument for moving this into a core primitive rather than leaving it to plugin authors.
   The probe's tests prove the danger is real, not theoretical: without the version guard, two
   concurrent reservations **lose an update** (final stock 4, not 3); with it, the stale write is
   caught as a conflict. **Recommendation:** core should own a **serializable atomic-multi-write
   primitive** (a "batch envelope" core executes in one transaction — e.g. "insert order AND decrement
   stock IF stock≥1", all-or-nothing) and freeze its shape *before* the marketplace exposes the ABI to
   third parties. This is the single highest-value output of the probe. Amends ADR-024 §3 / ADR-023 §7.
2. **Structural chattiness.** `[ADR-CANDIDATE]` Async-only + no-live-cursor means N round-trips per
   logical op (6 here). Mitigated by the same atomic-batch primitive (fewer, coarser calls) and by a
   batch-read shape — but the *async-only* rule itself is frozen, so the primitive vocabulary must be
   designed now.
3. **"Serializable" is not a sufficient author mental model — the Date trap.** `[ADR-CANDIDATE]` A
   `Date` is structured-clone-safe yet the store rejects it (better-sqlite3 can't bind it) → the probe
   catches this as `BAD_REQUEST`. So the frozen **typed-write vocabulary must pin the exact allowed
   scalar set** (string/number/boolean/null — how are dates/bigints/decimals represented?) now, or
   every author hits a confusing runtime wall. Amends ADR-023 §7.

### SDK-SUGAR — clunky but fixable later, semver-safe, NOT a reason to change the ABI
- **Query/mutation descriptor verbosity** (`{col, op, value}` where-clauses, explicit `values` bags) —
  a typed query/table builder can compile to these; the raw seam can stay ugly.
- **Handle plumbing + duplicated identifiers** (manifest cap string vs acquired handle vs request
  table name, all repeated) — an SDK can hand back a typed table accessor bound to its handle.
- **Capability-string boilerplate** — generated from the manifest.

## Honest limits of this probe (do not over-read it)
- In-process, each better-sqlite3 call still **blocks the host loop** for its duration; real isolation
  moves that off-loop. The probe reproduces the *authoring* pain faithfully but **cannot** show the
  isolation *benefit* — round-trip COUNT is the fair metric, not wall time.
- Tier-3 capability checks here are **advisory**, per ADR-023/024 — the probe's deny-by-default is a
  convention demo, not enforced security until Tier-2 isolation ships. Don't market it as enforced.
- In-process opaque handles are forgeable; a real host must bind handles to plugin identity.
- The probe throws `AbiError` as a live instance and the plugin classifies via `instanceof`; over a
  real transport only the serializable wire shape (`{code, message}`) survives, so the real SDK must
  reconstruct typed errors from `code`. The frozen contract should treat `code` as the load-bearing
  field (the probe defines `AbiError.toWire()` for exactly this, though in-process it isn't needed).

## Bottom line for the go/no-go on the Tier-3 store slice
The frozen ABI is **authorable**, but the no-transaction rule has a **real, correctness-shaped cost**
that is cheapest to address now: **design + freeze a core-mediated atomic-multi-write primitive before
the store slice (and certainly before the marketplace) locks the ABI for third parties.** Everything
else that hurts is SDK sugar and can wait. Recommend: proceed to the store slice, but treat the atomic
primitive as a prerequisite of that slice, and open an ADR-024/ADR-023 amendment to specify it.
