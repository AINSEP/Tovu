# Handoff: the Agent Plugin chain WORKS — and that is what proved prompt injection is the wrong model

Generated: 2026-08-22 (session ran 2026-08-21 evening)
Source: Claude Code (Opus 5, 1M), Coordinator — Review/Cowork Mode, with Codex `gpt-5.6-sol` xhigh,
Gemini `3.1-pro-high`, Gemini `3.7-flash-high`, and one Sonnet 5 subagent.
Target: Claude Code, fresh session
Branch `general-work` · **34 unpushed commits** (6 from this session)

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff.
>
> **Start with §1, and do not start building §5's plan until you have read §2.** The owner ended the
> session considering a full redesign and was probably right. Six rounds of design produced a winning
> plan for an architecture the evidence says should change. Read §2 before writing any composer code.
>
> Hard constraints: **never run `npm run test:cov` or bare `npm test`** (35 min, OOMs this machine).
> Scoped runs only. **Do not start Docker. Do not kill any process.** Shared git tree — another
> session owns uncommitted files listed in §7. `git commit -F <msg-file> -- <exact paths>` ONLY.

---

## §1 — WHAT SHIPPED, AND THE ONE MEASUREMENT THAT MATTERS

**The Agent Plugin chain was proven working live, in the owner's browser, for the first time.**
The previous session's blocker was correct: `localStorage["tovu:assistant-ag-ui"]` was `"1"`, routing
the owner onto the AG-UI canary which hardcodes `context: []`. Cleared it; both halves then confirmed
in one run (`/kestrel-coffee-roasters`, CLI transcript `840c376a-…jsonl`):

- Wire: `POST /api/runs` carried `pluginRefIds: ["ui-ux-design"]`.
- Agent: a 14,796-char `<<AGENT_PLUGIN>>` block with real SKILL.md bytes + 30 reference files by
  absolute path.

**Then the plugin changed nothing.** Zero file reads in the whole run. Output landed on the
character-identical known-null eyebrow `Small-batch · Roasted to order`.

**Root cause found and FIXED** (`a36edeb0`): `resolve-agent-plugin-refs.ts:170` framed the plugin's own
files as *"open any of these directly if the task needs more than the summary above"* — calling the
SKILL.md a "summary" and its files optional, directly contradicting what that SKILL.md instructs. The
wrapper is the outer frame, so the wrapper won. Measured A/B on the real install:

| run | framing | file reads | output |
|---|---|---|---|
| A | optional (old) | **0 of 30** | identical to no-plugin control |
| B | "read them, do not skip" | **4** — exactly the 4 the SKILL.md names | landed on the *other* known-null prior |

Fixed, regression test proven RED first, 17/17 green, `tsc` exit 0.
**NOT claimed: that this improves generated output.** Run B did not beat the null.

**⚠️ THE FIX IS NOT LIVE.** The `:3000` server has no auto-reload and was last restarted BEFORE the
fix landed. Reload it before judging anything about agent-plugin behavior.

## §2 — READ THIS BEFORE BUILDING ANYTHING: the owner's closing position

The owner ended the session with: *"debating if we need to tear this down and completely redesign it.
im not happy at all with what we did tonight."* That judgement is supported by the session's own evidence.

**Every defect found tonight traces to one root: agent-plugin content is PUSHED by prompt injection
instead of PULLED by a tool.** Verified: there is **no `src/features/agent-plugins/agent-tools.ts`**
and no registered tool anywhere mentions agent plugins. Compare:

| kind | can the agent reach it with NO chip? |
|---|---|
| MCP servers | YES — already in the registry it searches (`mcp__<connectionId>__<tool>`) |
| regular plugins | YES — `plugins_list` is a registered tool |
| **agent plugins** | **NO. Zero tools. The pinned chip is the only path that content has.** |

That asymmetry explains everything: the 15KB-per-message cost, the hardcoded eponymous-skill lookup,
the inability to pin an individual skill, and the entire pin/effect/hint machinery that produced 5 of
the 12 verified defects.

**The redesign the owner has been circling since the START of the session** (their words, hours before
the cowork: *"should there be a tool to retrieve the mcps, plugins, agent plugins?"*):
chip sends a short MANDATORY pointer; a TOOL fetches the content on demand.
Effect: 15KB -> ~100 bytes; the eponymous-skill constraint disappears; a bad ref becomes a tool error
instead of a fail-closed run; **all three kinds become uniform** (chip = hint, agent = tool); and most
of both winning plans becomes unnecessary.

**The honest counter-argument, which must not be lost:** a tool can be *ignored*. Run A proved the agent
skips optional things. Injection's one real virtue is that it is guaranteed. That is why the POINTER
stays mandatory and only the CONTENT moves to a tool.

**Coordinator's own failure, recorded so it is not repeated:** the owner raised the tool idea at the
start; the Coordinator confirmed it was the real gap and then spent six rounds designing a composer
layer *on top of* the architecture that made it necessary, never questioning the architecture itself.

## §3 — The cowork: 5 models, 6 rounds, 0 lines of code

Full record, committed: `ADS-memory/reports/2026-08-21-cowork-generalized-composer-tooling-layer.md`.
Read it before re-deriving anything; it also records which peer critiques were verified **FALSE**.

- Rounds 1-2: blind proposals + challenge. Settled 5/5 and 3/3 **with position changes** (Codex and
  Flash each moved): pin state stores only `item.id`; effect union keyed on effect type not envelope
  destination; no wire change; no daemon change; reuse the existing typeahead.
- Rounds 3-4: the Coordinator's merged plans v1 and v2 were BOTH rejected. 12 defects verified against
  source. Worst: the Coordinator's own prescribed "Step 0" would have **silently blanked the entire
  composer menu** (7 skill folders -> duplicate `pluginRefId` -> explicit throw at
  `composer-capabilities.ts:180` -> swallowed by `AssistantDock.hooks.tsx:604` -> catalog stays empty).
  Found independently by Sonnet AND Codex.
- Round 5 (owner-initiated fix — *"they should also propose their own design"*): all four authored
  their own plan.
- Round 6: anonymized cross-scoring with the Coordinator's rejected v2 slipped in as a control.

**THE TRANSFERABLE FINDING — self-assessment was INVERTED:**

| plan | author | self-score | blind cross-score |
|---|---|---|---|
| B | **Sonnet** | 8 | **7.0** |
| A | Gemini Flash | 9 | 4.5 |
| C | Coordinator v2 (**control**) | — | 4.5 |
| E | Gemini Pro | 9 | 2.25 |
| D | Codex | 9 | 2.0 |

Every plan self-scoring 9 scored 1.5-4.5 blind; **three of four authored plans scored at or below the
already-rejected control**. All four reviewers independently identified the control, and its blind score
matched its earlier direct score — the calibration held. Never trust a model's score of its own work.

## §4 — Verified traps (each confirmed against source; do not re-derive)

1. `ui-ux-design` has **7 skill folders**. Any per-skill row scheme collides on `pluginRefId`.
2. `listInstalledPlugins` walks **every digest** under `packages/sha256/*` — two digests of one plugin
   id (the normal upgrade path, anticipated at `resolve-agent-plugin-refs.ts:18-26`) collide the same way.
3. `resolve-agent-plugin-refs.ts:153` hardcodes `skills/${pluginRefId}/SKILL.md` — the resolver ALWAYS
   loads the eponymous skill regardless of which row was pinned.
4. **The eponymous skill is a CONVENTION with ZERO ENFORCEMENT.** The manifest schema requires only
   `name`; nothing validates `skills/<pluginId>/SKILL.md`. A third-party plugin without one installs
   fine and is permanently un-pinnable. This is the scaling cliff.
5. `AgentPluginCapabilityDescriptor` has **no `skillName`** field. `InstalledAgentPlugin` has **no
   `mtime`** (it has `version?`, `archiveDigest`, `packageRoot`, `files`, `skills[].name`).
6. `resolveRunContext` (`AssistantDock.hooks.tsx:1048`) is exported, synchronous, and returns
   `{frontendBindToken?, model?, pluginRefIds?}` — **no field for hints**.
7. `ComposerCapabilitySource.list(): Promise<T[]>` cannot distinguish legitimate emptiness from caught
   failure. `useComposerCapabilities` is a ONE-SHOT mount effect (`[]` deps) — no refresh loop exists.
8. `SelectedAgentPluginTray.tsx` has no unavailable/disabled state. `toTovuComposerCapability` has
   **zero production callers** (only its own test).
9. **THREE transports**, not two: Local CLI, BYOK, and AG-UI (`assistant-transport.ts:606-615`).
   AG-UI stays deliberately unwired per standing owner ruling.
10. Five of six composer groups are hardcoded single-row STUBS. The slash typeahead **already** searches
    the merged catalog — "search everything" needs no new search code, only real sources.

## §5 — The winning plan, IF the §2 redesign is rejected

Sonnet's (Plan B) + four fixes from its own critics. Do not build this before deciding §2.

- **Core rule: one composer row per `pluginId`** — never per skill, never per digest. Defects 1, 2 and
  the bundled-stub collision are the same bug at three fan-out levels; this one rule kills all three.
- New server `list-composer-capabilities.ts` grouping by `pluginId`, `pinnable` = a digest has the
  eponymous skill; one new read-only route; new browser source; delete the bundled stub in the SAME commit.
- Fix 1: do NOT touch `resolve-agent-plugin-refs.ts` — re-implement the scan in the new route.
- Fix 2: select newest digest deterministically by `version` semver + documented tiebreak (**not**
  `mtime` — that field does not exist).
- Fix 3 (**promote to REQUIRED**): move pin state to `item.id` now. This is the single item that decides
  whether adding MCP later is small or is surgery on shipped code.
- Fix 4: surface "N versions installed" on the row when >1 digest exists.
- Known gap: under this plan MCP and regular-plugin rows are **searchable but do nothing when picked**
  (no chip, no effect). Sonnet defers hints deliberately. Per §2 that deferral is architecturally sound —
  those two kinds already have agent-side tools; agent plugins do not.

## §6 — Next steps, ordered

1. **Reload `:3000`** — the §1 wording fix is committed but not live.
2. **Decide §2** (tool-based redesign vs Sonnet's slice). This is the owner's call and it is the whole
   fork. Recommend the redesign; recommend deciding it with a fresh head, not by extending tonight.
3. If redesign: spec `agent_plugin_search` / `agent_plugin_read_skill` as `src/features/agent-plugins/agent-tools.ts`,
   the one capability with no tool surface. Keep the chip as a short mandatory pointer.
4. If not: build §5, fix 3 promoted to required.
5. Independent of either: consider enforcing the eponymous skill at install time (§4.4) — it converts a
   silent scaling cliff into an actionable install-time error.
6. **34 commits unpushed.**

## §7 — Do not touch (other sessions' uncommitted work)
`apps/admin/src/features/plugins/{agent-plugin-catalog,agent-plugin-source-catalog}.ts` + their two
tests; `src/assistant/__tests__/execution-credential-store.test.ts`;
`apps/admin/src/styles/assistant.css` (57-line specificity hack, kept deliberately as a fallback);
and everything in the Jini repo outside `packages/chat`.
Jini `packages/chat` still has 3 unpushed, UNBUILT commits from the prior session — the pinned-context
zone work is still not visible in Tovu.

## §8 — Reusable techniques proven this session
- **Transcript grep**: `grep -c AGENT_PLUGIN ~/.claude/projects/-Users-la-Programming-Tovu/<sessionId>.jsonl`
  plus a `tool_use` histogram is the cheapest objective check for "did it reach the agent, and did the
  agent act on it". Zero code changes. It is what produced §1's A/B table.
- **Anonymized cross-scoring with a known-bad control** caught model self-scoring bias on the first try
  and cost one extra round. Use it for any multi-model panel.
- **Every peer claim in this document was re-verified against source before being written down.**
  Several confident peer claims were verified FALSE and are recorded as such in the cowork report.

## Handoff Contract
- **Inputs used:** live browser session via Claude-in-Chrome (flag read, chip pinned, run driven,
  `window.fetch` wire tap); the spawned CLI's own transcripts; direct reads of `composer-capabilities.ts`,
  `agent-plugin-capability-adapter.ts`, `AssistantDock.hooks.tsx`, `assistant-transport.ts`,
  `resolve-agent-plugin-refs.ts`, `capability-projection.ts`, `install.ts`, `manifest.ts`,
  `mcp-federation/{bootstrap,presets,trust}.ts`; scoped test runs (17/17) and `tsc --noEmit` (exit 0);
  6 rounds of peer output, each spot-checked rather than accepted.
- **Output summary:** lets a fresh session resume without replaying six rounds, and stops it from
  building a well-reviewed plan for an architecture the owner is actively questioning.
- **Risks:** the §2 decision is unmade and blocks §5. The wording fix is committed but not live.
  34 commits unpushed. Jini `packages/chat` is 3 commits ahead and unbuilt.
- **Suggested next assignee:** Coordinator (fresh session), then Software Architect for §2/§3.
