# Primary (Claude Opus 5) — Debate 3 (Agent Plugins → commands), ROUND 2, FROZEN

Written after reading every Round 1 response and the owner's new preview/projection requirements, before reading any Round 2 output.

## Position And Movement

**Position held, one part sharpened, one part conceded.**

Held: Skills → context injection; MCP servers → the existing `mcp-federation` trust layer; `extensions["org.tovu.commands"]` scoped to **presentation metadata only, never executable handlers**. Codex landed in the same place independently.

**Conceded to Sonnet:** I framed this as one question. It is two. "How does a Skill's context get into a turn" is nearly solved and needs no trust model — a Skill is markdown with no arguments, no return value, no side effects. "How does an MCP server's tool get called safely when a *plugin*, not an operator, chose to bundle it" is unsolved and is arguably not a composer question at all. Answering them as one produces a design that is silently incomplete for whichever half it neglected.

**Sharpened, and vindicated by verification:** Gemini 3.1 Pro's lone Option D (absorb into the first-party runtime) is not merely unwise, it is impossible. `loadPlugin()` requires per-file SHA-256 `integrity`, an `sdkRange` against `@tovu/sdk`, and a dynamic `import()` of an ESM entry; the capability vocabulary is exactly three tokens; the only hook is `content.entry.beforeSave`; `adminSurfaces` is "UNUSED in v1". Agent Plugins have none of those, a Skill is markdown, and an MCP server is a subprocess. Closed.

## The Trust Gap — my answer, and it is the contribution I most want on the record

Sonnet identified the real hole and I think it is correct: `mcp-federation`'s allowlist is designed to be authored by someone **other than** the thing being classified — that independence is what makes it a classification rather than a restatement of the remote's own claims. Its "self-declared hints demote only, never promote" rule only protects *within* an already-independently-vetted allowlist. A plugin-supplied `mcp.json` has no independent author, so "just reuse the federation layer" is not wiring, it is a missing design piece.

**My answer: the operator is the independent author, and admission is explicit and per-tool.**

A plugin's `mcp.json` servers land in a **proposed** state, not an admitted one. Enabling the plugin does *not* admit its tools. An operator sees the server's real, inspected tool surface and admits tools individually; nothing the plugin declares about itself can promote a tool into the allowlist. That preserves the exact invariant `trust.ts` was built on, costs one admin screen, and is honest — the plugin proposes, the operator disposes.

The alternative — auto-admitting whatever `mcp.json` declares on enable — is the path of least resistance and it reintroduces precisely the failure the trust rules exist to refuse. It must be named as unacceptable rather than left as the default that happens under schedule pressure.

**Given that, I now think Sonnet's "F" is close to right for v1:** ship the Skills half, and ship the MCP half only behind operator admission. Not "never," but never automatic.

## The Owner's New Requirements Change The Shape

Preview, live projection, and "capabilities I haven't thought of yet" mean this debate is partly absorbed by Debate 2's capability-projection contract. Agent Plugins become **one source feeding the projection**, alongside first-party plugins, agent tools, and connectors — not a parallel command system. That is strictly better than what I argued in Round 1, because it means the answer to "how do Agent Plugins become commands" is "they don't, specially — they're one adapter."

Preview matters more than it looks: `AgentPluginDetailsModal.tsx` already renders read-only source via `PreviewModalShell` + `CodeWithLines`, but behind a static `UI_UX_DESIGN_SOURCE_FILES` allowlist bound to the one bundled plugin and loaded through Vite `?raw`. Generalizing that is the same projection problem, and it must keep the existing path-traversal rejection.

## The Question I Still Think Nobody Has Answered

**What does "installed" mean?** The screen says *Installed*. The only plugin is bundled. The Marketplace is inert by design. The standard defines **no install protocol** — only "load plugins from directory paths." A user looking at that screen has no way to add one, and no answer exists. Every design question in this packet sits downstream of that, and it is a product question, not an architecture one.

## Strongest Counter-Argument

Sonnet's blind-spot (b): that MCP-backed plugin capabilities should not be slash commands at all, but ordinary agent tools the model invokes autonomously — which is exactly how already-federated MCP tools work today (`registrations.ts` registers them into `ToolRegistry`, called by the model's reasoning, never via the palette). If that is right, the entire "project `tools/list` into commands" framing solves a UX problem Tovu hasn't decided it wants, and the real work is just federating a plugin's `mcp.json` the way an existing vendor preset is federated.

I think this is probably correct for *invocation* and wrong for *discovery*: users need to see what a plugin gave them even if the model is what calls it. So the palette entry may be a discoverable, previewable descriptor whose "execute" is "tell the agent this is available," not a direct call. That is a real position change from my Round 1 answer.

## What Would Change My Mind

- The spec adding a native command component type upstream — then the private namespace is debt, and my "keep it small" scoping was the right hedge.
- A second real Agent Plugin shipping an `mcp.json` — that moves the admission gap from forward-looking to blocking.
- Confirmation that the palette is only ever for context and navigation, never side-effecting invocation — that settles Sonnet's reframe as the answer.

<<SWARM_END>>
