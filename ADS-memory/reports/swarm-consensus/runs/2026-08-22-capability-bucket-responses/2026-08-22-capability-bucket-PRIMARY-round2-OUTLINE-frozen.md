# PRIMARY (Claude Opus 5, 1M) — Round 2 build outline

**Frozen** before dispatching the Round 2 packet and before reading any Round 2 response.
Companion to `...-PRIMARY-round2-frozen.md` (positions on the five decision points).
No code, by the owner's instruction — module names and responsibilities only.

## Ranking criteria (stated before the ranking, so the order is auditable)

1. Does it fix the **measured** failure — the agent not using what it was handed?
2. Cost to add capability kind N+1 (target: two files, zero core edits).
3. Blast radius on already-shipped, already-trusted code.
4. Reversibility if the premise turns out wrong.
5. Does it preserve the native/federated trust split that `mcp-federation/trust.ts` deliberately built?

## The slate

**Option 1 — Capability Plane (recommended).** Unified discovery, per-lane activation, explicit
delivery ladder. Detailed below.
**Option 2 — Two indexes (Sonnet's sharpened E).** Fallback. Cheaper today, and correct if the
capability set never grows past callable + readable. Loses on criterion 2 the first time a third
mechanism appears.
**Option 3 — Tactical only (C).** Named and pruned, not ignored: it is the right *first commit* but
the wrong *endpoint*, and only survives if the tool is named `capability_search` from day one rather
than `agent_plugin_search`. Naming it per-kind creates a public API that is hard to retire.

---

# THE OUTLINE

## Phase 0 — Fix the measured bug. Before any architecture.

**Build:** a `delivery` level on every capability reference —
`on-demand | recommended | required-context | user-pinned`. Change the composer chip to stop
injecting content. It injects a short mandatory pointer that **names the tool call to make**.

**Why this is first, and why it is alone:** it is the only phase in this entire outline with a
measurement behind it. The 0-of-30 → 4-of-4 file-read swing came from changing *wording*, not
transport. Every other phase below is structure justified by reasoning. Reasoning is what produced
six rounds and zero code last night.

**Why it must not be bundled with Phase 1+:** if Phase 0 is shipped inside a larger rebuild, its
effect cannot be attributed, and the one number this project actually has stops being interpretable.

**Falsifiable exit test — the whole design hinges on it.** Re-run the coffee-roastery A/B three ways
on the identical prompt: (1) no-plugin control, (2) mandatory pointer + a read tool, (3) today's
~15KB injection. **If (2) does not match or beat (3), the pull model is wrong and Phases 1-5 should
not be built.** Cost: one afternoon, zero architecture.

## Phase 1 — The `CapabilitySource` seam. This is the extension point.

**Build:** `registerCapabilitySource({ id, scope, list() })` — the same module-level ordered list,
the same `register*/list*/reset*ForTests` trio, the same replace-by-key semantics as
`registerToolContributor`.

**Why this shape and not a new one:** it is the fifth instance of a pattern this codebase already
uses four times (`tool-contribution-registry.ts`, `mcp-federation/presets.ts`, `page-head.ts`,
`routing.ts`) and which ADR-006/ADR-009 §3 already exempts from the rule-of-two. Inventing a
different seam here would be a novel pattern competing with a working one.

**Why it is the extension point rather than a `kind` enum:** adding a capability kind must mean
"register a source, write an activation adapter" — two files, zero core edits. A `kind` union means
every new kind edits the union, the switch statements that read it, and every projection of it. The
two-file property is the testable definition of "future-proof," and it is the only claim in this
outline that can be cheaply falsified.

**First two sources, deliberately in this order:**
- (a) An adapter over the existing `ToolRegistry` — proves the seam works over shipped code
  **without modifying it**. Zero risk, and it is the regression test for the whole seam.
- (b) Installed Agent Plugin skills — closes the actual gap that started this.

## Phase 2 — `CapabilityCard` and one index

**Build:** a discovery-only record: `{ id, revision, name, description, keywords, lane, scope,
source, delivery, status }`.

**Why there is no `execute` field, and why that is the single most important omission:**
`AgentPluginCapabilityDescriptor` already carries an `execute` union whose second member is
permanently `{kind: "unavailable"}` — a field that exists to say "not this one" — and that descriptor
has zero production callers. That is what an execution union does to a discovery type at N=2. This
design has N≥5.

**Why the index needs no new infrastructure — verified, not assumed:** `buildToolCatalogQuery` takes
`Pick<ToolRegistry, "list">`, and `ToolRegistry.list()` returns `readonly ToolDescriptor[]` — pure
metadata whose own doc says it "Never carries the handler or policy." So **any object with a
`.list()` can back the FTS5/BM25 index.** No core type change, no new datastore. I confirmed this
directly in `Jini/packages/core/src/tool-registry.ts` after Sonnet raised it.

**Why `lane` is data and never a switch:** `slots.ts:77-80` already states this law for the composer
("`kind` is filtered/rendered, never switched on"). The moment core code switches on `lane`, the
Phase 1 extension point is dead and every new kind is a core edit again.

## Phase 3 — The agent surface: two tools, and deliberately not a third

**Build:** `capability_search(query, scope)` → ranked cards. `capability_get(id, revision?)` → the
card plus its content (READ lane) or its input schema (CALL lane).

**Do NOT build `capability_invoke`.** Activation routes to the lane's existing gate: `ToolExecutor`
for native tools, `trust.ts`'s admission pipeline for federated MCP, and **nothing at all** for READ,
because returning text cannot act.

**Why this is the load-bearing rule:** Sonnet's strongest objection to unification is that one search
surface drifts into one trust tier by convenience. That objection is correct, and splitting the index
does not answer it — refusing an execute path does. Write it as an ADR, not a convention:
**the discovery surface never gains an execute path.** A convention that inconvenient will be
violated within two quarters; an ADR is at least visible when it is.

## Phase 4 — The two things every option in the packet skipped

**(a) An activation table.** `resolve-agent-plugin-refs.ts` says in its own header there is no record
of which installed digest is "the" current install, and it fails loud on ambiguity as a result.
Saved references store `id + revision`; resolution is exact-match → `upgrade-available` → `disabled`
→ tombstone with provenance.

**Why now:** every phase above makes capabilities *more* discoverable, which makes an unresolved
ambiguity *more* likely to surface, not less. And it gets strictly harder once references are sitting
in user data.

**(b) A scope predicate applied before ranking, never after.** `install.ts` carries a SECURITY note
about a real prior cross-tenant bug that type-checked. Filtering after ranking leaks the existence of
other workspaces' capabilities through result counts even when the rows themselves are withheld.

**Why now:** retrofitting tenancy into a shipped index is the classic case where the retrofit misses
one path.

## Phase 5 — Freshness

**Build:** `invalidate()` re-runs `list()` across registered sources. The index is `:memory:` and
disposable, so this is a re-seed, not a migration.

**Why, against the one dissent:** Sonnet argues boot-only seeding is acceptable because it matches
existing accepted behaviour. That is an argument about consistency, not correctness. The flagship
workflow being designed is *install a capability and use it in the same conversation* — boot-only
seeding makes precisely that workflow the broken case.

---

## What NOT to build, and why each is a real temptation

- **No `capability_invoke`** — see Phase 3.
- **No MCP-UI / A2UI now** — correctly deferred. **But** tool results must carry typed media rather
  than flattened text from day one. That is one field, not a subsystem, and without it the owner's
  own image-generation use case forces a transport and persistence rework later. Cheap insurance
  against an expensive rework.
- **No vector search** — already evaluated and rejected on measurement in this repo. Do not re-litigate.
- **No new datastore** — Phase 2 shows none is needed.
- **No per-kind agent tools** (`agent_plugin_search`, `mcp_search`, …) — each one is a public API that
  becomes hard to retire, and they multiply exactly as fast as the kinds they were meant to abstract.

## Sequencing logic, stated plainly

Phase 0 is the only phase with evidence. Everything after it is structure. If Phase 0's measurement
comes back negative, the correct response is to stop — having spent an afternoon rather than a
rebuild. That is the whole reason it is first and separate.

## Cheapest test that would falsify the recommendation

The Phase 0 A/B above. Second-cheapest, for Phase 1: add a deliberately trivial third source (e.g.
project memory files) and assert it required exactly two new files and zero edits to the index, the
search tool, or any existing source. If that costs more than two files, the extension point does not
work and Option 2 is the better answer.

<<SWARM_END>>
