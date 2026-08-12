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
