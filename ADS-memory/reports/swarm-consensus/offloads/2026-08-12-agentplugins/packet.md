# Swarm Consensus Context Packet

**Packet ID:** `CTX-AGENTPLUGINS-2026-08-12`
**Date:** 2026-08-12
**Slug:** tovu-agent-plugins-commands
**Project Type:** brownfield
**Mode:** debate — Round 1 (independent first pass, solution-neutral)

---

## Preamble for peer models — read this first

- IGNORE ALL PRIOR CONVERSATION HISTORY. New task. If you recall a packet about theme tiers or composer internals, discard it.
- There is **no** `AGENTS.md`/`CLAUDE.md`/bootstrap file here. Intentional. A missing file is never a reason to stop.
- Do not read outside your working directory. Do not chain reads with `&&`.
- Read the `files/` subtree; ground claims in `path:line`.
- Round 1. Independent position. No other participant's answer is included, deliberately.

---

## The Need

Tovu (a self-hostable CMS with an embedded AI assistant) wants **Agent Plugins** — packages conforming to the open agent-plugins.org standard — to surface as runnable **slash commands** in its chat composer.

The standard is deliberately minimal. What it does *not* define is most of what Tovu needs.

## The Exact Question

> How should Agent Plugins become invokable commands in a host application, given that the standard defines packaging only and leaves install, trust, permissions, sandboxing, and invocation entirely to the client?

---

## Source Material — Agent Plugins Specification v1.0.0

> **Source Material Limitation:** the agent-plugins.org homepage is an overview that links out to the spec repository. The text below was retrieved from the specification document at `agentplugins/agent-plugins-spec`. It is a faithful rendering including direct normative quotes, but it is **not** a byte-verbatim copy of the full spec. Treat quoted `MUST`/`SHOULD` language as authoritative and unquoted structure as accurate summary. Flag any place where this limitation materially affects your reasoning.

**Plugin structure.** A self-contained directory. **Required:** a `plugin.json` manifest at the root. **Optional:** skills in `skills/`, MCP servers in `mcp.json`. *"A plugin MUST include a manifest at `plugin.json` in the plugin root."*

**Manifest.** Valid JSON. Required: `$schema` (must equal `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) and `name` (1–64 chars; lowercase alphanumeric, hyphens, periods; no leading/trailing hyphens, no consecutive delimiters). Optional metadata: `version`, `description`, `author`, `license`, `keywords`. Unknown top-level fields produce warnings but do not block loading.

**Component discovery.** Skills live in `skills/<name>/SKILL.md` per the Agent Skills specification; invalid skills are skipped without stopping plugin loading. MCP servers are configured in `mcp.json` with three transports: `stdio`, `streamable-http`, and `sse` (legacy, optional client support).

**Path safety.** All plugin-relative paths MUST begin with `./` and resolve within the filesystem-resolved plugin root. *"symlinks, junctions, reparse points, and equivalent filesystem mechanisms MAY resolve to targets within the plugin root, but clients MUST reject package paths that resolve outside it."*

**Environment & placeholders.** For clients launching subprocesses (stdio MCP): required env vars `PLUGIN_ROOT` (absolute path to plugin root) and `PLUGIN_DATA` (absolute path to a persistent client-managed directory). Placeholders `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expand in `args`, `env` values, and `cwd`. No other expansion occurs; unrecognized placeholder-like text stays literal.

**Client conformance (minimum).** Load plugins from directory paths; parse and validate `plugin.json` against the closed schema; discover components from fixed locations; support at least one component type; if launching subprocesses, provide both env vars and expand placeholders; resolve MCP `command` as a single bare or `./`-prefixed executable token; use plugin root as default subprocess cwd; skip unsupported MCP transports without affecting other components. *"Clients MUST ignore unsupported component types."* *"An unknown top-level field or a non-object `extensions` field is non-fatal."*

**Extension mechanism.** Client-specific data uses **reverse-domain namespaces** under `extensions` in `plugin.json`, or as top-level directories named for the namespace (e.g. `com.example.client/`). Each client defines the semantics of its own namespace; validation is client-specific.

**Versioning.** SemVer recommended. `plugin.json` and `mcp.json` must declare the same Agent Plugins `$schema` version; a mismatch invalidates MCP configuration but does not affect other components. Component failures are isolated: a broken MCP server does not prevent skill loading.

**Critical observation for this debate:** the specification defines **no command/slash-command component type, no hooks, no agents, no install protocol, no permission model, no sandbox, and no trust model.** Skills and MCP servers are the only two portable component types.

---

## Repository Facts (verified)

### F1 — Tovu already ships a conforming Agent Plugin

`files/tovu/plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "ui-ux-design",
  "version": "1.1.0",
  "description": "AI Dev Shop UI/UX and interface design guidance packaged as a portable Agent Skill."
}
```

It carries `skills/ui-ux-design/SKILL.md` plus 12 reference files. `mcp.json` is **deliberately absent** — the spec makes it optional and this package declares no MCP server. An admin screen renders `Installed` and an inert `Marketplace` tab plus a read-only source inspector over an exact 14-file allowlist, with traversal rejection. There is no fetch, no install, and no fake inventory.

### F2 — Decisions already locked by the owner (context, not up for re-litigation)

- Agent Plugins v1 is **a package format, not an install, permission, sandbox, or trust model**; Tovu/Jini must provide those client policies.
- The portable components are **Skills and MCP servers**. Slash commands and Tovu-specific UI metadata belong under a **stable reverse-domain client extension namespace**.
- The loader must **pin the recognized v1 schema** — the standard is a Working Draft.
- Plugin execution, installation, trust, permissions and sandboxing are explicitly **not** part of the shipped UI/discovery slice.

### F3 — A separate, mature plugin system already exists in the same product

Tovu has its own first-party plugin system — a different thing from Agent Plugins — with an accepted artifact-format ADR (`.tovu-plugin` tarball, prebuilt ESM entry, signed manifest), an accepted execution/trust ADR defining **tier-1 / tier-2 / tier-3** trust rungs, an APPROVED spec, and ~1,578 lines of implemented runtime (discovery, manifest, loader, activation, hook registry, capability SDK). Today's in-process ESM loader is explicitly **tier-3**: local / first-party / explicitly sideloaded only.

So the host already has a trust vocabulary and a capability-scoped loader. Whether Agent Plugins should reuse it, parallel it, or stay separate is open.

### F4 — The composer's slash palette exists but executes nothing

Selecting a slash item currently only replaces the draft text. There is no dispatch path. (A separate debate covers the composer's execution semantics; do not assume its outcome.)

### F5 — MCP is already federated in the host

The assistant has an MCP federation layer with stdio and memory adapters, a config/preset system, registrations, and an explicit **trust** module. An MCP server contributed by an Agent Plugin would be landing in an existing, guarded surface rather than a green field.

---

## Constraints

| # | Constraint |
|---|---|
| C1 | **Portability is the point.** A design that only works because Tovu invented private fields defeats adopting an open standard. |
| C2 | The standard is a **Working Draft**; the loader pins v1 and must survive spec churn. |
| C3 | Tovu is **self-hostable and multi-workspace**; plugin state must be workspace-scoped. |
| C4 | The assistant runs **agent CLIs, not a hosted API**. |
| C5 | The existing `Installed`/`Marketplace` screen and inspector must keep working; the Marketplace must not gain fake inventory. |
| C6 | Nothing may present unproven capability as working — a standing rule in this product. |

## Candidate designs to evaluate (options, not a proposal — attack them)

- **A — Skills-as-commands.** Each `skills/<name>/SKILL.md` becomes a slash command; selecting injects the skill into the agent's context. Uses only portable components; no new namespace.
- **B — Reverse-domain extension namespace.** Tovu defines e.g. `org.tovu.commands` under `extensions`, declaring commands explicitly with labels, descriptions and arguments. Portable packages simply carry an extra namespace other clients ignore.
- **C — MCP-tools-as-commands.** A plugin's `mcp.json` servers are the invocation surface; commands are projections of `tools/list`, executed through the existing federation and trust layer.
- **D — Reuse the first-party plugin runtime.** Adapt Agent Plugins into the existing tier-1/2/3 artifact + capability-scoped loader, treating the open format as an import path into a system that already has trust and hooks.
- **E — Something else.**

## Open questions (address; do not treat as decided)

1. **Trust and install.** The spec defines none. What is the minimum honest model, and does it reuse the existing tier-1/2/3 rungs or need its own?
2. **Sandboxing.** A stdio MCP server is a **subprocess with an env-provided data directory**. On a self-hosted box that is arbitrary local code execution. What contains it?
3. **Namespace risk.** If commands live in a private extension namespace, is Tovu standardizing or forking? What would make the namespace worth proposing upstream?
4. **Two plugin systems.** Should Agent Plugins and the first-party `.tovu-plugin` system converge, stay parallel, or should one absorb the other? What does a user see when both exist?
5. **Name collisions.** Two plugins both offering `/review`. Resolution rule?
6. **Versioning/pinning.** Working Draft churn, `$schema` mismatch between `plugin.json` and `mcp.json`, and plugin SemVer against host version.
7. **Marketplace.** Distribution, provenance, and revocation for a format with no signing story.
8. **Phasing.** Smallest honest slice, and its rollback.

## Adversarial task

1. Best design and why. 2. Reject weak options with specific reasons. 3. Failure modes, hidden costs, one genuine sacrifice. 4. What evidence would change your answer. 5. Whether Agent Plugins should be the command surface at all, or whether the first-party system should be.

No implementation plan, no ranked slate, no code this round.

## Unlisted Option (required)

A strong option or decomposition not listed above? "No, the listed options cover it" is valid.

## Blind Spots (required — all three)

**(a)** A viable option not listed. **(b)** A question we should be asking but aren't. **(c)** The framing assumption most likely wrong, and why.

---

## Staged Files

| Path | Why |
|---|---|
| `files/tovu/plugin.json` | The real conforming Agent Plugin manifest |
| `files/tovu/agent-plugin-catalog.ts`, `agent-plugin-source-catalog.ts` | How plugins reach the UI and the source inspector |
| `files/tovu/AgentPlugins.tsx` | The Installed/Marketplace screen |
| `files/tovu/plugin-runtime/*` | The **separate** first-party plugin runtime: manifest, loader, activation, discovery, hook-registry, capability-sdk |
| `files/tovu/mcp-federation/*` | Existing MCP adapters, config, registrations, and trust module |
| `files/jini/composer-discovery.ts` | The slash palette's current parser/filter — what a command would plug into |

---

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-2026-08-12 -- I received the packet and will work on it.
```

Use headings: `## Position`, `## Option Assessment`, `## Failure Modes And Sacrifice`, `## What Would Change My Mind`, `## Unlisted Option`, `## Blind Spots`.

End with exactly `<<SWARM_END>>` on its own line.
