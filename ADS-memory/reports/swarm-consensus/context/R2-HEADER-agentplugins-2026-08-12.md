# Swarm Consensus — Debate 3 (Agent Plugins → commands), ROUND 2

**Packet ID:** `CTX-AGENTPLUGINS-R2-2026-08-12`
**Mode:** debate Round 2 — INFORMED. Every participant's full Round 1 reasoning is appended verbatim below.

- IGNORE ALL PRIOR CONVERSATION HISTORY except this packet. No `AGENTS.md`/`CLAUDE.md` here; intentional, never a reason to stop. Do not read outside your working directory. Do not chain reads with `&&`.

## What Round 1 settled

Skills → context injection (no execution, no new trust model). MCP servers → the **existing** `mcp-federation` layer and its trust module, not a new one. Agent Plugins supply portable capabilities; they do not become Tovu's command runtime.

**Option D is dead, and now on structural grounds, not preference.** Gemini 3.1 Pro alone argued for absorbing Agent Plugins into the first-party `.tovu-plugin` runtime as tier-3. Coordinator-verified: `loadPlugin()` requires per-file SHA-256 `integrity`, an `sdkRange` against `@tovu/sdk`, and a dynamic `import()` of an ESM entry (`loader.ts:8-20`); the capability vocabulary is exactly `content.read | content.extend | hooks.attach` (`manifest.ts:36`); the only hook is `content.entry.beforeSave` (`manifest.ts:125`); `adminSurfaces` is **"UNUSED in v1"** (`manifest.ts:59-60`). Agent Plugins have none of integrity, sdkRange, or an ESM entry, and a Skill is markdown while an MCP server is a subprocess. Absorption is impossible, not merely unwise. That was a solo Gemini position and is now closed.

**Still genuinely open from Round 1:** whether `extensions["org.tovu.commands"]` should exist at all. Two participants scoped it to *presentation metadata only, never executable handlers*; two rejected it outright as a vendor-locking fork. Settle it with the new requirements below.

## NEW REQUIREMENTS from the product owner — these change the design

### N1 — Preview is required

The owner wants to **preview a skill, preview an Agent Plugin, and preview other capability kinds** before invoking them. The machinery already exists but is hardcoded: `AgentPluginDetailsModal.tsx` renders a working read-only preview via `PreviewModalShell` (`@jini-ai/ui/renderers`) and `CodeWithLines`, and `agent-plugin-source-catalog.ts` loads `SKILL.md` plus 12 reference files into the browser through Vite `?raw` imports — behind a static `UI_UX_DESIGN_SOURCE_FILES` allowlist bound to the single bundled plugin.

### N2 — The composer is fed a static list while Tovu has a live registry

`AssistantDock.tsx:430` passes `discoveryGroups: TOVU_COMPOSER_DISCOVERY_GROUPS` — a hardcoded array literal of four entries. Tovu meanwhile has ~20 `tool-registrations.ts`/`agent-tools.ts` modules (identity, media, widgets, navigation, redirects, forms, assistant), `tool-catalog-query.ts`, a keyword/doc2query tool-search layer, and MCP federation registrations — none of it projected.

### N3 — Extensibility to unknown kinds is an explicit requirement

Verbatim: *"other general capabilities that maybe I haven't even thought of yet."* A design that enumerates today's kinds and needs a code change per new kind fails this.

### N4 — The target palette has arguments and real execution

The owner's reference UX shows `/mcp … <server-id>` and `/search <query>` with rendered argument placeholders, and `/search` genuinely executes. So a capability descriptor must be able to declare arguments and an execute binding, not just insert text.

## The Round 2 ask — PRODUCE CODE

Solution Slate Protocol is ON. Back the leading option with **real code**, not prose.

Design the **capability projection contract** — how Tovu supplies the composer with everything needed to render, preview, and invoke a capability from any source (Agent Plugin skills, Agent Plugin MCP tools, first-party plugins, agent tools, connectors) — such that a new source needs no composer change.

1. **The descriptor type.** Label, description, argument schema, preview source, execute binding, confirmation requirement, provenance/trust. Show the TypeScript.
2. **The Agent Plugins adapter.** How a `plugin.json` + `skills/*/SKILL.md` (+ optional `mcp.json`) becomes descriptors. Say whether `extensions["org.tovu.commands"]` is used and, if so, prove it carries no executable semantics.
3. **Preview.** How a descriptor exposes preview content generically, replacing the hardcoded `UI_UX_DESIGN_SOURCE_FILES` allowlist, without the composer learning what a skill is. Keep the existing path-traversal rejection.
4. **The unsolved trust problem — do not gloss it.** `mcp-federation`'s allowlist is designed to be authored by someone *other than* the thing being classified; a plugin-supplied `mcp.json` is authored by the plugin. Its "self-declared hints demote only, never promote" rule only protects *within* an already-independently-vetted allowlist. Show what admits a plugin's MCP tools, or state plainly that the MCP half does not ship.
5. **Collisions and versioning.** Two plugins offering `/review`; `$schema` mismatch between `plugin.json` and `mcp.json` (which invalidates MCP config while skills keep loading — a silently half-working plugin).
6. **Honesty gate.** Nothing may present unproven capability as working. If your slate ships only the Skills half, say so in the UI copy.

Provide a ranked slate of ≥2 options with explicit ranking criteria, full trade-offs, a genuine sacrifice per option, a recommendation, and the cheapest falsifying test. Then the code for the leading option, consistent with the real files in `files/`.

Also state your current position, whether it changed this round and why, the strongest counter-argument, and what would change your mind.

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-R2-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position And Movement`, `## Solution Slate`, `## Leading Option — Code`, `## The Trust Gap`, `## What Would Change My Mind`.

End with exactly `<<SWARM_END>>` on its own line.

---

# APPENDIX — Every participant's full Round 1 response, verbatim

