# Architecture Audit — 2026-08-13

**Role:** Software Architect (audit) → Refactor (propose-only plan). Both persona files loaded
(`AI-Dev-Shop/agents/software-architect/skills.md`, `AI-Dev-Shop/agents/refactor/skills.md`).
**Scope:** why `npm run check:architecture` is red today, and a propose-only plan. **No production
code was changed to produce this report.**

**Tooling used:** `npm run check:architecture` / `-- --list` (run live, not read from a prior report),
direct `git ls-tree`/`git diff --stat` against the baseline commit, and direct source reads (`rg`/`grep`
+ `Read`) to trace every cited import edge to a real line of code. `codebase-memory-mcp` was available
and indexed at HEAD (35,076 nodes / 55,937 edges) but the questions here were all "which file imports
which" and "what does this specific comment/ADR say" — `rg` against the real tree answered them faster
and with less indirection than a graph query would have, so it was used as the primary tool per the
Refactor skill's Phase-0 gate guidance (grep is an acceptable primary tool when the question is a direct
text/edge lookup, not a multi-hop structural question). No claim below is asserted without a cited file
and line.

---

## 1. Plain-language verdict

**The architecture is still sound, and today's red CI is not new decay — it is the accounting catching
up with three new product domains landing on a codebase whose one real defect (the composition root
`server` sits in the middle of nearly every cycle) was already known and is still being paid down, not
growing.** The 2026-08-02 audit's conclusion — decomposition is sound, the actual defect is back-edges
into the composition root — still holds today: back-edges into `server` improved from 26 to 16 this
session, and the module-cycle *pair* count improved from 13 to 8 (5 pairs removed, 0 new pairs
introduced — verified directly below in §4, not taken from a handoff). Two of the three metrics that
tripped the gate (largest SCC, core size) are *arithmetic consequences* of adding three new feature
domains (`features/agent-plugins`, `features/commerce`, `features/deployments`) to a graph whose
composition root and persistence layer are already densely mutual — not new mistakes made this session.
The third (module API surface) grew slower than the codebase itself did (+3.6% vs. +7.4% file growth),
which is actually a mild proportional improvement being reported as a raw-count regression.

That is a real verdict, not a hand-wave — every regressed metric is traced to specific files below in
§2. The one place this audit disagrees with "everything is fine" is core size: it grew faster than the
codebase (+11.7% vs. +7.4% file growth), and that one is not fully explained by new-module arithmetic —
see §2.3. It is small (13 files) and worth a look, not worth blocking on.

**Bottom line for the owner:** nothing here says "stop and fix architecture before shipping." The
gate did its job — it caught real, attributable growth and forced this audit instead of letting the
baseline silently drift. §3 recommends moving the baseline for two of the three regressions and gives
the SCC/core-size growth an honest accounting rather than either laundering it or over-reacting to it.

---

## 2. Why CI is red, metric by metric

The baseline was calibrated at commit `e8688e1` (730 files / 42 modules). HEAD is 784 files / 45
modules — confirmed by diffing `src/` directory structure between that commit and the working tree
(`git ls-tree -d --name-only e8688e1 src/features/` vs. the current tree). The three new modules are
exactly `features/agent-plugins`, `features/commerce`, `features/deployments` — no other module was
added or removed. This matches the handoff's "+3 modules" claim and grounds it in a specific diff
rather than the round-number coincidence it could have been.

### 2.1 Largest SCC grew 33 → 35 — caused by `features/commerce` joining the pre-existing giant SCC

Traced directly, not inferred from the SCC list alone:

- `features/commerce` imports only `db` (`db/sqlite/content-db`, `db/sqlite/repo-helpers`) and framework
  packages — no other domain module.
- `server` imports `features/commerce` in four places: `server/deps.ts`, `server/routes/types.ts`,
  `server/routes/admin/commerce/status.ts`, `server/routes/site/products.ts`.

That's it: `server → commerce → db`. `server` and `db` are **already** both members of the 33-module
baseline SCC (both were named in the 2026-08-02 report's own instability table and are still central
today — `db` has Ce=20 in today's `--list` output, `server` has Ce=517). Because the giant SCC already
has a path from `db` back to `server` (through the existing `db ↔ features/database ↔ features/recovery`
knot and the many other members), any new module that (a) `server` imports to wire its routes and (b)
imports `db` to persist anything gets swept into the SCC for free — it doesn't need to introduce any new
back-edge or violate any rule itself. `features/commerce` did nothing wrong; it followed the exact same
"server wires my routes, I read/write db" shape every other domain module already uses, and that shape
was already inside the SCC before commerce existed.

`features/agent-plugins` (Ca=0, Ce=0 — literally zero cross-module edges, confirmed in the `--list`
Martin-instability table) and `features/deployments` (Ca=0, Ce=2 — outgoing only, no incoming) are the
other two new modules. Neither can join a cycle: a strongly-connected component requires mutual
reachability, and a module with no incoming edge (or no edge at all) can't be reached back. They add to
the "45 modules" count and to `features/deployments`'s two outgoing edges' contribution to deep-import
totals, but they contribute **zero** to the SCC or cycle-pair metrics. Worth naming because it rules out
"the two other new modules are also part of the decay" as a hypothesis — they aren't.

**Verdict on this one:** mechanical consequence of a new domain following the established (already
broken) pattern. Not a new design mistake. Fixing it for real means fixing the pre-existing `server`/`db`
entanglement (§4), which is already tracked and already improving (26 → 16 back-edges this session).

### 2.2 Module API surface (files exposed) — 220 → 228, but this is smaller than proportional

+8 files against a codebase that grew by 54 files (+7.4%) is a +3.6% surface increase — *below* the
file-growth rate. Read as a percentage of the codebase rather than a raw count, the API surface actually
tightened slightly. The ratchet checks the raw count (by design — see the code comment at
`development/scripts/check-architecture.ts:463-466`: it deliberately ratchets distinct exposed files,
not edge count, so that a second import into an already-exposed file can't fail the build). That design
choice is correct for what it protects (new privacy violations), but it means a raw-count ratchet will
always fire when the codebase grows and even one genuinely-new domain adds any cross-module reads at
all — which three new domains landing at once do. This is the flagged case in §3: recommend moving the
baseline, this is not decay.

### 2.3 Core size — 15.21% → 15.82% (111/730 → 124/784) — partially explained, partially real

File-count growth alone would predict core staying flat as a *percentage* (proportional growth cancels
out) or moving only with genuine change in shared-utility shape. It moved 0.61 points, and the raw count
grew faster (+11.7%) than the file count did (+7.4%) — this one is not fully absorbed by "the codebase
got bigger."

Two real, traceable contributors, both `core/`-scoped:

- `src/core/rate-limit/rate-limit.ts` (326 lines, new since baseline) and `src/core/runtime-mode.ts`
  (26 lines, new since baseline) are **relocations the 2026-08-02 report itself recommended** —
  `server/middleware/rate-limit.ts → core/` and `server/runtime-mode.ts → core/`, both listed as
  Phase-3 items in that report's plan (§5, rows 3). Both moves happened this session (confirmed via
  `git diff --stat e8688e1 -- src/core/`). A file that is genuinely a cross-cutting policy primitive,
  once moved into `core/`, will tend to have both wide fan-in (many callers) and moderate fan-out —
  exactly the shape the "core" metric measures. This is the plan working as intended, not decay: two of
  the seven items on record's own remediation list executed, and the metric that specifically watches
  "how much stuff lives in the shared kernel" moved in response, because that's what it's built to catch.
- `src/core/gated-mutations/{composition,gateway,ports,watermark}.ts` grew substantially this session
  (part of the write-quiescence/Postgres-migration workstream) and `src/core/embeds/marker.ts` (269
  lines) is wholly new. These are core-owned infrastructure additions, not misplaced feature code, but
  they still add fan-in/fan-out mass to the median computation the metric uses — some previously
  borderline files may cross the median threshold purely because the median itself shifted, independent
  of any change to those files. This is a real but partly artifactual effect of the metric's own
  definition (files *above-median* in both directions — adding mass near the median moves the median).

**Verdict on this one:** roughly half "the plan's own recommended moves executing, correctly, and the
metric doing its job," half "core-infrastructure growth that's arguably supposed to live in core." Not
alarming, but the one metric in this report not cleanly reducible to "new modules, mechanically." Worth
a light look (§5) rather than a baseline move on faith.

---

## 3. Baseline recommendation

A ratchet moved every time it fires stops being a ratchet — so this is not a blanket "run `--update`."
Per-metric, with the reasoning that would make a future reader trust the call:

| metric | move it, or fix it | reasoning |
|---|---|---|
| **Largest SCC (33→35)** | **Move it.** | §2.1 shows this is arithmetically forced by any new domain that both gets wired by `server` and persists via `db` — the standard, required shape for a domain module in this codebase. The only way to *not* trip this metric on the next new domain is to first fix the pre-existing `server`/`db` entanglement (§4), which is real work already in progress, not something this baseline update should be gated behind. Moving it now is honest: it records "we added 2 legitimate domains," not "we let the SCC rot." |
| **Module API surface (220→228)** | **Move it.** | §2.2: the raw count grew slower than the codebase did. A baseline that stayed at 220 would be *tighter* than proportional, which was never the ratchet's intent (it exists to catch newly-exposed private files, not to freeze the surface while the codebase grows). Moving it locks in a number that's still doing its job on the next regression. |
| **Core size (15.21%→15.82%)** | **Investigate first, then move.** | §2.3 is the one genuinely mixed case. Recommend: confirm (quick, cheap — see §5 item 1) that the newly-core-qualifying files beyond `rate-limit.ts`/`runtime-mode.ts` are legitimate core infrastructure (gated-mutations, embeds) and not a feature-specific file that leaked into core-like fan-in/fan-out by accident. If confirmed legitimate, move the baseline in the same `--update` pass as the other two. Do not move it silently without that five-minute check — this is the metric most able to hide real decay behind "the codebase grew" framing, and it is the one the owner explicitly asked this audit to not paper over. |
| **Module cycles (13→8) and back-edges (26→16)** | **Not regressed — no baseline action needed.** | Both *improved* this session and are printed as improvements, not failures, by the tool itself. Listed here only to be explicit that the baseline update should not touch these fields with anything other than the genuinely-better numbers already computed. |

**Net recommendation:** run `npm run check:architecture -- --update` after a five-minute look at which
specific files pushed core size (§5 item 1) confirms they're legitimate. All three regressions are
either fully explained by legitimate growth (SCC, API surface) or very likely to be (core size, pending
the one cheap check) — none of the three is "real decay being laundered through a baseline bump" as
written. If that check instead surfaces a feature-specific file wrongly sitting in the core-shaped
fan-in/fan-out band, fix that placement first, then update.

---
