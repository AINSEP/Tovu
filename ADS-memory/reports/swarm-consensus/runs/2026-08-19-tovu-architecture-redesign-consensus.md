# Swarm Consensus — Tovu architecture redesign proposal

**Date:** 2026-08-19 · **Mode:** debate, 2 rounds · **min_confidence:** 0.90 · **Result: UNANIMOUS REJECT of the programme, unanimous ACCEPT of a ~1-2 week surgical subset.**

**Question:** Is Codex 5.6-sol's architecture redesign for Tovu correct and appropriate? (11 bounded
contexts as folders, RouteDeps retirement first, physical file moves last, ~8-12 weeks.)

---

## The Swarm

| Role | Model | Repo access | R1 | R2 |
|---|---|---|---|---|
| **Primary** | Claude Opus 5 (Coordinator) | full | accept diagnosis / reject sequencing | **moved further against** |
| Peer | `gpt-5.6-sol` @ xhigh — *proposal author* | full | (author) | **ACCEPT-WITH-CHANGES; own programme rejected as an execution plan** |
| Peer | `gpt-5.6-terra` @ xhigh | full | ACCEPT-WITH-CHANGES | unchanged |
| Peer | `gemini-3.1-pro-high` | R1 none → R2 staged snapshot | REJECT (9/10) | REJECT, reasoning replaced |
| Peer | `gemini-3.7-flash-high` | staged snapshot | — (joined R2) | ACCEPT-WITH-CHANGES |
| In-host subagent | Claude Sonnet 5 (Software Architect) | full + fresh cbm graph | — (joined R2) | ACCEPT-WITH-CHANGES + ran the censuses |

## Dispatch Diagnostics

- All peers packet-ACKed (`TOVU-ARCH-DEBATE-R1/R2-2026-08-19`). Zero `turn.failed`, zero `error` events.
- **`agy`/Gemini R1 failed silently** (exit 0, 0 bytes): the packet advertised the cbm MCP graph, `agy`
  headless auto-denied the tool, and the whole response was lost. Fixed by a per-peer no-tools preamble.
- Gemini was given repo access for R2 via a **read-only staged snapshot** (1,886 files, `chmod a-w`, no
  `.git`/`.env`/`.db`) rather than the live tree.
- cbm-mcp was found **stale** (functions committed that day absent) despite reporting `ready` with a
  matching `head_sha`; re-indexed to 49,001 nodes and re-verified before use.

---

## VERDICT

**The 11-context / hexagonal-layering programme is dead. All six participants, including its author.**

Sol, after source verification: *"The original 11-context programme is rejected as an execution plan."*

**What survives is roughly 1-2 weeks of well-scoped cleanup**, most of which is finishing work already
in flight.

---

## What the debate actually established (measured, not asserted)

**1. `RouteDeps` is already decomposed.** `src/server/routes/types.ts` exports **24 named capability
slices** (`ClockDeps`, `IdentityDeps`, `MediaDeps`, `PostDeps`, …); `RouteDeps` is their intersection.
Sol's Step 1 is half-done; the remaining work is moving slices to owning modules and switching consumers.

**2. Sol's Step 2 is mostly done — but not entirely.** `src/server/tool-catalog-manifest.ts` explicitly
imports and calls all **25** contributors; registration is not import-time magic. terra warns that
re-executing Step 2 risks reopening the assistant↔domain cycle this shape removed. **Sonnet's refinement:
contributors still receive the full wide `AssistantToolRegistryDeps` intersection — RouteDeps' twin under
another name. The cycle-avoidance half is done; the narrow-dependency half is not.**

**3. The real wrong-direction surface is small, and the gate under-reports it.** Census:
- 62 non-test files import the `RouteDeps` identifier; **all 62 type-only, zero value imports**. 55 are inside `src/server/**` itself.
- 19 files outside `src/server/` reference `RouteDeps`, spread over 11 modules.
- **`npm run check:boundaries` flags only 5** production violations (`features/deployments` ×3, `features/source-control` ×2) — and they are **warnings, not errors**.
- **Gate gap, confirmed from `.dependency-cruiser.cjs:41`:** the rule's `from` is `^src/features` only. So `src/assistant/` (3 files), `src/widgets/` (1), and `src/export/` (2) import the server-owned type and the gate is structurally blind to it.

**4. "Core size" is a misnamed metric.** `check-architecture.ts` computes it from transitive fan-in ×
fan-out against graph medians, never asking which module a file belongs to, and **prints no membership
list even under `--list`**. Sonnet reproduced the logic and enumerated the 139 for the first time:
**43 under `src/server/` (Sol exactly right), ~26-28 tool-registration paths, ≈50% combined**; the rest a
long tail across 30 directories with no second dominant cause.

**5. `server` Ce=540 is a file-edge count, not module couplings** (terra correct on mechanism). But
Sonnet's resolution: server's 322 files reach 189 distinct targets across **41 of 49 modules (84%)** — so
server's near-universal footprint is real even though the headline number was being misread.

**6. Nobody has piloted a single context merge.** `site-delivery` would merge 7 currently-independent
modules; `engagement` merges 6. The 11-context target has **zero piloted evidence either way**.

### Numbers that did not survive
| Claim | Source | Reality |
|---|---|---|
| "74-100 production importers" of RouteDeps | Sol | false by ~9-12x for the god type |
| "5 production feature files import RouteDeps" | Sol | undercount |
| "19 production files outside server/" | **Coordinator (me)** | counts *references*, not import-edge violations; gate-visible surface is 5-8 |
| "56 references" | terra | path-substring search; conflates tests, comments, and the 24 other `*Deps` |
| "8-12 weeks" | Sol | own steps sum to 54-91 days = 10.8-18 weeks; terra's realistic estimate 16-24 |

---

## Synthesis — the converged plan

Sol, terra, gemini-3.7 and Sonnet independently produced near-identical schedules.

**Days 1-2 — fix what you measure.** Rename `core size` → `bidirectional-hub count`; make it print
membership. Set no reduction target until the list exists. *(Sonnet has working reference code.)*

**Days 3-5 — close the evidenced boundary violations.** The 5 gate-named sites in
`features/deployments` + `features/source-control`, plus the 2 in `src/export/` the rule doesn't cover.
Copy the pattern you already got right in `comments/tool-registrations.ts` and `features/post/`. Then
**widen the dependency-cruiser rule beyond `^src/features`** and ratchet production violations to **0**.

**Days 6-8 — narrow `AssistantToolRegistryDeps`'s consumer signature**, one `contribute*Tools()` at a
time. **Do not touch the registry mechanism itself** — terra's cycle warning stands.

**Then stop and ship.** Do not start content-model convergence, bulk file regrouping, a contracts
package, or the 11-context rollout.

**Stopping rule (every participant insisted):** cap architecture work at **10-15 engineer-days**. Reopen
only if two real product changes hit the same boundary. If editing surfaces call sites the static census
missed, stop and re-scope rather than absorbing creep.

**Optional, evidence-gated:** pilot exactly one context merge (`site-delivery`) only if a real feature
naturally spans theme + widgets + navigation + seo. If no such feature arrives, it doesn't happen.

---

## Decision Ledger

| # | Decision | Basis |
|---|---|---|
| 1 | Reject the 11-context programme as a scheduled plan | unanimous, incl. author |
| 2 | Keep it as a documented north star, not a schedule | Sonnet, terra |
| 3 | Fix the metric before optimizing it | unanimous |
| 4 | Close 5-8 boundary sites; ratchet to 0 | unanimous |
| 5 | Widen the boundary rule past `^src/features` | Coordinator (gate gap, verified) |
| 6 | Narrow `AssistantToolRegistryDeps`; leave the registry alone | Sonnet + terra |
| 7 | Do NOT do content convergence / bulk moves / contracts package | unanimous |
| 8 | Cap at 10-15 engineer-days with a hard stop | unanimous |

## Remaining disagreement

**Evidence-resolvable questions are resolved.** What remains is a **values** call, not a factual one:
Gemini's "ship first, zero architecture work" vs everyone-with-repo-access's "do the ~1 week of
now-well-scoped cleanup." Sonnet's judgement, which the Coordinator shares: at 1 week rather than 8-12,
Gemini's "commercial suicide" framing does not survive contact with the real numbers — but *whether one
week is worth it pre-launch* is the owner's call, and no further evidence resolves it.

## Final Recommendation

**Do Days 1-8 (~1.5 weeks). Then ship.** Treat the 11-context target as a north star with zero scheduled
time against it. The single highest-value item is Days 1-2: until the hub list is printed, every claim
about "the core" — including every one made in this debate — is unfalsifiable.

**Confidence: 0.95.** Six participants, four with source access, unanimous on the verdict; the two
previously-contested numbers are now measured and cross-validated three ways.
