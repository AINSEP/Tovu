# Agent report — SQLiteInteger → bigint widening

**Date:** 2026-08-12 · **Agent:** Sonnet 5, Database persona · **Branch:** `general-work`
**Commits:** `b393752` (agent), `bb14044` (Coordinator follow-up)

---

## Outcome

`SQLiteInteger` now maps to `bigint(name, { mode: "number" })` in
`development/scripts/generate-postgres-schema.ts`. All 65 integer columns widened — **not** the
narrower allowlist the forward-risk audit recommended. `src/db/schema.postgres.ts` regenerated:
65 `bigint(`, 0 `integer(`. Typecheck clean at the agent's commit; 17 tests across the three
postgres test files pass.

## The audit's recommendation was under-scoped — treat the handoff as superseded here

The handoff said to widen "append-only tables (analytics events, tool attempts, revisions) and the
write watermark." That set **excludes all 11 autoincrement surrogate primary keys**. Integer identity
exhaustion at 2³¹ on a PK is far worse to discover late than on an append-only table — an events
table can be backfilled; a PK plus every FK referencing it cannot easily be rewritten in place.

Two agents converged on this independently from different directions: the widening agent derived it
from the generator's design idiom (kind-based mapping + exhaustive structural gates exist precisely
so a hand-maintained list can never be the failure mode — that shape has silently dropped generator
output four times), and the manifest agent, reasoning from the audit's categories, arrived at only 9
columns and had to be corrected to the widen-all target.

**Anyone reading the handoff's "cheap now, expensive later" section should read this instead.**

## The refuted comment — refuted again, empirically

The old comment claimed widening "would change the JavaScript type Drizzle infers from `number` to
`bigint` and break every call site that does arithmetic on one." Confirmed false two ways against the
installed drizzle-orm 0.44.7:

- `drizzle-orm/pg-core/columns/bigint.js`: `bigint(name, {mode:"number"})` builds a
  `PgBigInt53Builder`; `PgBigInt53.mapFromDriverValue` is
  `typeof value === "number" ? value : Number(value)` — always a JS `number`. SQL type is still int8.
- Standalone `tsc --strict` compile against real `node_modules`: `$inferSelect` is `number`, and
  `col + 1` compiles clean.

## Measured storage cost (live Postgres 14, 500k rows)

| | table | indexes |
|---|---|---|
| int4 | 21 MB | 21 MB |
| int8 | 25 MB | 21 MB |

**Index cost is identical** — btree entries are already 8-byte aligned on this platform. Heap grew
~19%, but only on a synthetic table of entirely integer columns; the real schema is 515/583 text
columns, so the true per-row cost is a small fraction of that.

## Concurrent-commit hazard, handled well

Mid-task, commit `69cfb35` ("quarantine repeated hook failures") landed on `general-work`, adding
three columns to `pluginActivations` including a new `SQLiteInteger`. Before it landed, that change
sat **uncommitted in the shared working tree** — regenerating naively would have baked an unreviewed
feature into the widening commit and left `schema.ts`/`schema.postgres.ts` inconsistent at HEAD.

The agent isolated it with `git worktree add --detach <scratch> HEAD` (node_modules symlinked),
regenerated there, and only proceeded once the commit had actually landed. **This is the reusable
technique for regenerating a build artifact on a branch another session is writing to.**

## Coordinator follow-ups (`bb14044`)

1. **The doc-drift diagnosis in the agent's report was wrong.** It reported "actual count is 65, not
   the 64 the doc claims — pre-existing drift." Not so: at `69cfb35^` the count really was 64, so the
   doc was correct when written. The agent measured 65 against a dirty tree already containing the
   uncommitted quarantine column. The drift became real only after that commit landed.
2. **Three tallies were stale, not one** — 580→583 columns, 513→515 text, 64→65 integer. A fourth,
   "31 defaults," was wrong independently of any recent commit; measured value is **19**. Everything
   else in that paragraph verified correct (11 autoinc, 7 CHECK, 9 FK, 4 composite, 65 indexes /
   27 unique, 1 column `.unique()`).
3. Marked the census non-binding in the comment, pointing at
   `schema-postgres-parity.test.ts` as the enforced surface. A number in a comment cannot fail CI
   when it drifts — which is how four of them got there.

## Delivery note — and a Coordinator error worth keeping

`SendMessage` **did** deliver here, both times. An earlier draft of this report said it hadn't; that
was wrong and the mistake is instructive.

The sequence: the agent sent its final report (re-flagging the doc drift as "not fixed, outside my
scope"), *then* the Coordinator's message arrived, and the agent resumed and began fixing the doc.
Reading only the final report, the Coordinator concluded the message had been lost and did the fix
itself — **while the agent was mid-edit on the same paragraph of the same file.**

That is the origin of the "31 defaults → 19" line that appeared in the Coordinator's working tree
from no known author. It was the agent's in-progress edit, absorbed into commit `bb14044` by a
`git add` of the whole file. The value was correct and was independently verified before committing
(`grep -c "\.default(" src/db/schema.ts` = 19, matching `getTableConfig()`), so nothing bad shipped —
but the commit carries work its message does not attribute, and that was luck, not process.

Two lessons:

1. **A completed final report does not mean the agent has stopped.** An idle agent resumes on
   message delivery. Do not infer non-delivery from a report that predates the send.
2. **Staging a whole file on a shared working tree can absorb another agent's uncommitted edit**,
   even when the file is nominally "yours." Explicit-path `git add` guards against staging the wrong
   *file*; it does nothing about the wrong *hunk*. Where a second writer is plausible, diff the
   staged content against what you actually authored before committing — the Coordinator did catch
   this one, but only after the fact.
