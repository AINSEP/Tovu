# Swarm Consensus — Debate 2, ROUND 2

**Packet ID:** `CTX-SLASH-R2-2026-08-12`
**Mode:** debate Round 2 — INFORMED. You now see every participant's full Round 1 reasoning, verbatim, appended below.

---

## Preamble

- IGNORE ALL PRIOR CONVERSATION HISTORY except this packet. No `AGENTS.md`/`CLAUDE.md` exists here; that is intentional and never a reason to stop.
- Do not read outside your working directory. Do not chain reads with `&&`.
- `files/` holds verbatim source. Re-read what you need.

## What Round 1 settled (do not re-argue)

All four participants — Claude Opus 5 (Primary), Codex GPT-5.6 Sol xhigh, Gemini 3.6 Flash, Gemini 3.1 Pro, plus a Claude Sonnet 5 in-host participant — independently converged:

- The package (`@jini-ai/chat`) owns **mechanism**: trigger parsing, filtering, keyboard, ARIA, draft edits.
- The host (Tovu) owns **effect**: registry, authorization, execution, outcome reporting.
- The feature should be **finished, not deleted**.
- The package must **never switch on a host taxonomy** — this is a written design law at `files/jini/slots.ts:77-80`.

## NEW EVIDENCE since Round 1 — this changes the answer

The product owner supplied the target UX and two additional requirements. All of this is new information no Round 1 participant had.

### N1 — The target palette has ARGUMENTS and real EXECUTION

A screenshot of the intended design shows a `COMMANDS` palette (`↑↓ navigate · enter to pick · esc to dismiss`) containing:

```
/mcp     open settings · <server-id> to insert hint
         Toggle, adopt, or jump to pet settings.

/search  <query>
         Search the web through the OD research command.
```

Three consequences:

1. **Arguments are first-class.** `<server-id>` and `<query>` are rendered placeholders. Round 1's near-unanimous "no argument grammar is an acceptable sacrifice" is now **wrong** — arguments are a requirement.
2. **One command, two behaviors, chosen by argument presence.** `/mcp` bare opens settings; `/mcp <server-id>` inserts a hint. The effect is a function of the parsed argument, not just the item id — which today's `resolveTovuComposerDiscoveryRoute(selection.item.id)` (`files/tovu/AssistantDock.tsx:270-273`) structurally cannot express, since it receives only an id.
3. **`/search` genuinely executes** ("Search the web through the OD research command"). Option A (text macro only) is definitively insufficient.

**The blocking structural fact:** `parseComposerSlashQuery` is `/^\/([^\s/]*)$/` (`files/jini/composer-discovery.ts:10-12`) — anchored both ends, whitespace excluded. The palette closes the instant a space is typed, so `/mcp supabase` can never render. The trigger grammar must change.

**Coordinator finding, verified this round (corrects a Round 1 claim):** the Sonnet participant reported that `insertText: ""` silently blanks the draft. **That is wrong today.** `selectPlusItem` guards with `if (item.insertText)` (`Composer.tsx:102`), so `""` is falsy and the plus path skips `setDraft`. On the slash path, the regex guarantees the draft *is* exactly the trigger, so replacing it with `""` clears precisely the trigger — and `Composer.test.tsx:222` asserts that as intended behavior. **However**, it becomes a genuine bug the moment the grammar accepts arguments: `replaceComposerSlashTrigger` (`composer-discovery.ts:38-40`) does a whole-draft replacement, which will eat typed text once the draft can contain more than the trigger. Treat regex and replacement as **coupled invariants that must change together**.

### N2 — The composer is fed a hardcoded list while Tovu has a live registry

`files/tovu/AssistantDock.tsx:430` passes `discoveryGroups: TOVU_COMPOSER_DISCOVERY_GROUPS` — a **static array literal** of four entries in `files/tovu/agent-plugin-catalog.ts`.

Meanwhile Tovu has an extensive live capability registry it does not project: roughly twenty `tool-registrations.ts` / `agent-tools.ts` modules across `identity`, `media`, `widgets`, `navigation`, `redirects`, `forms`, and `assistant`, plus `tool-catalog-query.ts` and a keyword/doc2query tool-search layer, plus MCP federation registrations.

So `/search` cannot exist today for a structural reason: there is no projection from Tovu's real capability registry into `ComposerDiscoveryGroup[]`.

### N3 — Preview is a requirement, and the machinery already exists but is hardcoded

The owner wants to **preview** a skill or Agent Plugin (and other capability kinds) before invoking it. `files/tovu/AgentPluginDetailsModal.tsx` already renders a working read-only preview using `PreviewModalShell` (from `@jini-ai/ui/renderers`) and `CodeWithLines`, and `agent-plugin-source-catalog.ts` loads `SKILL.md` plus 12 reference files into the browser via Vite `?raw` imports. But the file set is a static `UI_UX_DESIGN_SOURCE_FILES` allowlist hardcoded to one bundled plugin.

### N4 — Explicit owner requirement: extensibility to unknown capability kinds

Verbatim: *"other general capabilities that maybe I haven't even thought of yet."* A design that enumerates today's kinds and requires composer changes for each new one fails this requirement.

---

## The Round 2 ask

**This round produces working code.** The Solution Slate Protocol is ON.

Design the **capability projection** — the contract by which Tovu supplies the composer with everything it needs to render, preview, and invoke a capability — and back your leading option with **real code**, not prose.

Specifically:

1. **The descriptor contract.** What does one capability descriptor carry — label, description, argument schema, preview source, execute binding, permission/confirmation requirement? Where is it declared, and how does an unknown future kind ride it without a composer change (N4)?
2. **The trigger grammar.** Give the replacement for `parseComposerSlashQuery` that supports `/command <args>`, and show what has to change in lockstep: `replaceComposerSlashTrigger`, the `dismissedSlashDraft` memo, `aria-activedescendant`, and the filter. Include the argument-aware behavior split from N1.2.
3. **The execution seam.** Round 1 flagged that `void slots?.onDiscoverySelect?.(...)` (`Composer.tsx:89`) discards the promise, so a failing async host handler vanishes silently. Fix it, and say what the user sees on failure.
4. **Preview.** How a descriptor exposes preview content, and how the composer surfaces it without the package learning what a skill or plugin is.
5. **Confirmation.** Tovu already has a `PendingConfirmationStore` + redemption route used for consequential MCP-UI actions. Say whether a slash command needs the same two-phase shape and how the descriptor declares it.
6. **Boundary check.** Prove your design does not violate `slots.ts:77-80` — the package must not switch on a host-owned taxonomy.

## Required output

Provide a **ranked slate of at least two options** with explicit ranking criteria, full trade-offs per option, a genuine sacrifice for each (no all-upside options), a recommendation, and the cheapest test that would falsify it.

For the leading option, provide **actual code**: the TypeScript type contract, the new parser with its tests, the changed `Composer.tsx` call sites, and the Tovu-side projection that replaces the static `TOVU_COMPOSER_DISCOVERY_GROUPS`. Code must be consistent with the real files in `files/`.

Also state, as every round requires: your current position, whether it changed this round and why, the strongest argument against the leading opposing position, and what would change your mind.

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-SLASH-R2-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position And Movement`, `## Solution Slate`, `## Leading Option — Code`, `## Strongest Counter-Argument`, `## What Would Change My Mind`.

End with exactly `<<SWARM_END>>` on its own line.

---

# APPENDIX — Every participant's full Round 1 response, verbatim

