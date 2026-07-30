# ADR-011: Two Deployment Topologies — Standalone Single Binary + Open-Design Desktop Host

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime

## Context

Tovu's design deferred the "desktop multi-site manager." The product owner's
direction: **open-design** (local Electron monorepo, CBM-indexed as
`…OSS-Repos-open-design`) becomes the desktop engine Tovu hooks into. Its
`apps/daemon` is already a local AI-infrastructure host:

- installed-AI detection (`codex-cli.ts` `probeCodexInstall`,
  `claude-diagnostics.ts`, local-CLI providers in `memory-llm.ts`)
- BYOK provider registry (`byok-tools.ts`, `apps/web/src/providers/registry.ts`)
- MCP server management: config, OAuth discovery, custom servers, its own MCP
  endpoint (`mcp-config.ts`, `mcp-oauth.ts`, `mcp-live-artifacts-server.ts`)
- external connectors (Composio at `connectors/composio.ts`), agents/ACP,
  memory, chat, automation routines, deploy, plugin registry

At the same time, Tovu must remain installable the WordPress way: download one
binary, run it, log into the admin.

## Decision

Two topologies over one unchanged core; **the dependency arrow only ever points
from open-design to Tovu, never the reverse.**

1. **Standalone (primary, the WordPress mode).** `tovu` single binary boots an
   install dir (config + SQLite + uploads + themes + plugins), serves the site
   and admin; user logs in. AI works via direct provider adapters on `LLMPort`
   (env/BYOK key) — no Electron, no daemon, no open-design anywhere in the
   dependency tree. CI runs this mode; it can never regress to "requires the
   desktop app."
2. **Desktop-hosted (the engine mode).** open-design's Electron app is the
   host: users fork/create as many sites as they want; each site is a standard
   Tovu install dir (identical layout to standalone — "site is a folder" is
   the portability contract between the two modes). The host embeds or spawns
   Tovu server instances per site and injects **daemon-backed adapters** for
   the AI seams: `LLMPort` → daemon provider registry (which already knows
   what AI is on the machine + BYOK), external tools → daemon-managed MCP
   servers/connectors (Composio, HeyGen, user-added).

Integration is at the **daemon's HTTP API boundary** — Tovu never imports
open-design source. Concretely, Tovu grows one adapter package when this lands
(e.g. `packages/host-open-design/`): implementations of existing ports backed
by daemon endpoints. This satisfies ADR-006's rule of two with real adapters:
`LLMPort` = {direct-Anthropic, open-design-daemon}; external-tool source =
{none/built-in, daemon MCP}.

## Consequences

- The deferred `desktop/` package is **cancelled** — Tovu does not build its
  own Electron manager; open-design is that product. Big scope reduction.
- The install-dir format is now a *compatibility contract*: a site created in
  the desktop app must run under standalone `tovu` and vice versa (this is the
  fork/export story, and UF-13 portability applies between the two modes).
- Version coupling risk: the daemon API is not currently a stable public
  contract. Pin an explicit minimal surface (provider completion/stream, MCP
  tool list/call, connector invoke) in the adapter and contract-test it
  against a recorded daemon fixture, so daemon churn breaks the adapter's
  tests, not Tovu core.
- Tovu's AI tool registry (kernel/tools) is unaffected: in both modes Tovu
  *exposes* its tools over MCP; in desktop mode the daemon can additionally
  register Tovu sites as tool sources for its own agents — bidirectional, but
  each side only via protocol, never via import.
