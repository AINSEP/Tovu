# Primary (Claude Opus 5, 1M) — Debate 3 (Agent Plugins → commands), Round 1, FROZEN

Written before reading any peer or subagent output. Packet: `CTX-AGENTPLUGINS-2026-08-12`.

## Position

**A + C together, with B carrying display metadata only — and a hard refusal to let Agent Plugins become a second execution system.**

The spec ships exactly two portable component types, and each maps onto a rail Tovu already owns:

- **Skills → context injection.** No execution, no subprocess, no new trust model. Reading a `SKILL.md` and putting it in the agent's context is the safest thing in this entire debate.
- **MCP servers → the existing federation + trust module.** Tovu already federates MCP with stdio/memory adapters, config, presets, registrations and an explicit trust module. An Agent Plugin's `mcp.json` server should land there, not somewhere new.

So Agent Plugins don't need an execution model invented for them. They need **routing into two rails that already exist**. Option B's reverse-domain namespace should carry only what the standard genuinely omits and Tovu genuinely needs for *presentation* — command label, description, ordering, which skill or tool to surface — never a new execution type. A small namespace is one you could plausibly propose upstream; a large one is a fork wearing a standard's clothes.

## Option Assessment

**Option A (skills-as-commands) — correct but insufficient alone.** It covers context injection and nothing else. Ship it first because it needs no trust model at all.

**Option C (MCP-tools-as-commands) — correct for the executing half, and better than any alternative because it is the spec's *own* execution primitive.** Inventing a Tovu-specific execution path alongside `mcp.json` would mean maintaining two ways for a plugin to do things.

**Option B (extension namespace) — accept, but scope it hard.** Used for display metadata it is exactly what the extension mechanism is for, and other clients ignore it for free. Used to define commands as a third component type, it is a private fork of a public standard and it will rot the moment the spec adds its own command type.

**Option D (absorb into the first-party `.tovu-plugin` runtime) — reject, and it is the most tempting wrong answer** because that runtime is genuinely more mature. Two reasons it fails. First, converting a portable open-format package into a proprietary signed tarball at install time destroys C1 — portability was the entire reason to adopt the standard. Second and worse, it moves trust the wrong way: the first-party loader is explicitly **tier-3 — local / first-party / explicitly sideloaded only**. Feeding untrusted marketplace packages into a tier-3 in-process ESM loader would *lower* that system's trust posture, not raise Agent Plugins'.

## Failure Modes And Sacrifice

**The unaddressed risk that should gate everything: stdio MCP is arbitrary local subprocess execution, and the standard has no signing story.**

This is not incidental — the spec's *conformance requirements actively assume you will spawn processes*: clients MUST provide `PLUGIN_ROOT` and `PLUGIN_DATA`, MUST expand `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` in `args`/`env`/`cwd`, and MUST use the plugin root as default working directory. On a self-hosted box, installing an Agent Plugin from a marketplace means running a stranger's binary with a writable data directory. The spec gives path containment (reject paths resolving outside the plugin root) — that is a *filesystem* control, not a *process* control, and it does nothing once the subprocess is running.

**Genuine sacrifice:** a plugin can inject context or expose tools. That is all. No custom admin panels, no render hooks, no arbitrary UI. Some of what people mean by "plugin" is only available through the first-party system, and the two systems will have to be explained to users as genuinely different things rather than merged for tidiness.

**Other failure modes:** name collisions across plugins with no resolution rule in the spec; `$schema` mismatch between `plugin.json` and `mcp.json` invalidating MCP config while skills keep loading (a partially-working plugin, which is worse than a failed one for user comprehension); and Working-Draft churn against a pinned v1 loader.

## What Would Change My Mind

- **The spec adding a first-class command component type upstream.** Then B's namespace becomes debt to migrate off, and I'd want to have kept it as small as possible — which is an argument for my scoping even under uncertainty.
- Evidence that the first-party runtime is being retired. Then D's "one system" argument gets much stronger.
- A real process sandbox landing in the host. That would make the MCP half safe enough to open to a marketplace, which today it is not.

## Unlisted Option

**Skills-only v1: support the safe half and explicitly refuse the subprocess half until a sandbox exists.** Agent Plugins become a *distribution format for skills* and nothing more. It ships something real immediately, it needs no trust model, no permission prompt, no sandbox, and no marketplace risk — and it is honest, which matters here because this product has a standing rule against presenting unproven capability as working. MCP support arrives when containment does. This is narrower than my lead position and I would genuinely consider it the better first slice.

## Blind Spots

**(a) Option not listed:** skills-only v1, above.

**(b) The question we should be asking but aren't:** *what does "installed" mean?* The screen already says **Installed**, but the only plugin present is bundled, the Marketplace tab is inert by design, and the standard defines **no install protocol whatsoever** — only "load plugins from directory paths." A user looking at that screen will ask how to add one, and there is currently no answer. Adoption is the actual blocker, and it is upstream of every question this packet does ask.

**(c) The framing assumption most likely wrong:** that Agent Plugins should be an *execution* surface at all. Their genuine value may be as a **portable distribution format** — how a skill or an MCP server travels between clients — with execution remaining entirely the host's own concern through rails it already owns. If that is right, "make Agent Plugins work with slash commands" is really "make skills and MCP tools appear in the palette," and the plugin format is plumbing the user should never have to think about.

<<SWARM_END>>
