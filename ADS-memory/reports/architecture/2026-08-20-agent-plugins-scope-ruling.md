# Ruling — Is `src/features/agent-plugins/` a third extension mechanism?

**Date:** 2026-08-20 · **Branch:** general-work · **Author:** codebase-analyzer dispatch

**Context:** `ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md` unanimously
merges `src/features/plugin-runtime/` and `src/features/site-glue/`, and flags `src/features/agent-plugins/`
as excluded from that debate "by inference, never confirmed" — this report supplies that ruling.

## Sampling Notice

**Read in full:** `src/features/agent-plugins/{install,layout,capability-projection,manifest}.ts`;
`apps/admin/src/features/plugins/{agent-plugin-capability-adapter,composer-capabilities,agent-plugin-catalog,
agent-plugin-source-catalog,AgentPlugins.tsx,README.md}`; `ADS-memory/reports/swarm-consensus/runs/
2026-08-12-tovu-six-debates-FINAL.md` §3 (Agent Plugins → commands); `ADS-memory/reports/swarm-consensus/context/
CTX-tovu-agent-plugins-commands-2026-08-12.md` (F2/F3).
**Not read:** `package-paths.ts`, `yauzl-archive-reader.ts`, all `__tests__/*` (existence and count confirmed
via `find`, content not read — not load-bearing for the scope question). `plugin-runtime/` and `site-glue/`
were not re-read; their shape is taken from the SYNTHESIS doc, which the prior debate verified directly.
**Confidence:** High on "what it is" and "callers on both ends" (direct source read + repo-wide grep,
zero non-test/non-comment hits). High on "prior decision already settled scope" (source document read
directly, quotes verified verbatim, not just the header's paraphrase). Medium on "overlap with the merged
system" — based on the merge candidates' documented shape in SYNTHESIS.md, not a fresh re-read of their code.

---

## 1. What it actually is

`src/features/agent-plugins/` implements the **open agent-plugins.org v1.0.0 standard** — a third-party
`plugin.json`/`mcp.json` package format, unrelated to Tovu's own `.tovu-plugin` tarball format:

- `manifest.ts:74-152` — `parseAgentPluginManifest`/`parseAgentPluginMcpConfig` validate the spec's
  `plugin.json` (`name` grammar, pinned `$schema` `https://agent-plugins.org/schemas/1.0.0/...`) and
  `mcp.json` (`{$schema, mcpServers}`). No integrity map, no SDK range, no capability vocabulary — the
  open spec defines none (`manifest.ts:7-12`).
- `install.ts:197-259` (`installAgentPlugin`) — content-addressed, adversarially-hardened archive
  extraction: zip-slip defense (`install.ts:279-294`), decompression-bomb bounding on bytes actually
  observed rather than declared size (`install.ts:359-367`), digest-gated before any parsing
  (`install.ts:213-219`), atomic publish-then-freeze (`install.ts:249-250, 464-477`). It writes real
  bytes to `infra/agent-plugins/ws/<workspaceId>/packages/sha256/<digest>/`.
- `layout.ts:122-155` — per-workspace path resolution only; `layout.ts:5-45` documents an owner decision
  (2026-08-12) for tenant-grade isolation: no instance-wide shared package tree, to close a
  workspace-existence oracle.
- `capability-projection.ts:96-141` — projects an installed plugin's Skills and MCP servers into
  descriptors. A Skill's `execute` is real (`{kind: "context-injection", markdown}`,
  `capability-projection.ts:117`); an MCP server's `execute` is **unconditionally**
  `{kind: "unavailable", reason}` (`capability-projection.ts:131-136`) — there is no parameter anywhere
  in this module that can promote it to runnable.

No code from an installed archive is ever imported or executed. Skills are markdown read for context
injection; MCP servers are preview-only.

## 2. What calls it, on both ends — **confirmed still zero, both ends**

Repo-wide grep (`src`, `apps`, excluding `__tests__` and self-referential doc-comments):

- `installAgentPlugin` — 0 real callers. Only hits are its own definition/doc-comments
  (`install.ts:2,158,163,197`) and one unrelated file citing it as a precedent for the *same* pattern
  (`apps/admin/src/features/deployment/FullSiteTab.tsx:18`, "same 'no callers' shape project memory
  already flags for `installAgentPlugin`").
- `projectInstalledAgentPluginCapabilities` — 0 real callers outside its own file and the admin adapter's
  doc-comment (`agent-plugin-capability-adapter.ts:39`) explaining why it *isn't* called.
- No route under `src/server/` references `agent-plugin` at all (`grep -rln "agent-plugin" src/server
  src/assistant` → empty).
- On the consumer end, `agent-plugin-capability-adapter.ts:36-44` states explicitly: *"No
  `ComposerCapabilitySource` here — that needs a browser-reachable transport for
  `AgentPluginCapabilityDescriptor[]`, and none exists... nothing proxies its output to the admin
  session."* This is the module's own author confirming the gap, not my inference.
- The admin composer catalog that *does* ship (`composer-capabilities.ts:184-268`,
  `BUNDLED_CAPABILITIES`) is synchronous, hand-written, compile-time data — an `agent-plugin:ui-ux-design`
  entry with `resolve` omitted entirely (composer-capabilities.ts:198-208, not executable), wired to
  nothing under `src/features/agent-plugins/`.

**Both ends are still missing** — not "built and awaiting a consumer" in the sense of one finished side
idling. It's a write path (`install.ts`) with no HTTP route calling it, and a read/projection path
(`capability-projection.ts`) with no transport exposing its output, either side of an entirely separate,
still-unbuilt wiring layer (`agent-plugin-capability-adapter.ts:41-44` calls this "reported as remaining,
not invented here").

## 3. Relation to `apps/admin/src/features/plugins/`

Two things live in that directory and they are **not the same system**:

- **A genuinely disconnected static source browser** (`agent-plugin-source-catalog.ts:1-53`) — 47
  hardcoded `?raw` imports reaching across the filesystem into a sibling checkout
  (`../../../../../../Jini/packages/agent-plugins/ui-ux-design/...`), an explicit allowlist ("a file
  added to the package stays invisible until it is reviewed and added here",
  `agent-plugin-source-catalog.ts:59-63`). `AgentPlugins.tsx:69-70` renders it under a banner: *"Tovu
  does not execute Agent Plugins yet."* This has **zero relationship** to `src/features/agent-plugins/`
  — it never installs an archive, never calls `installAgentPlugin`, never reads
  `infra/agent-plugins/ws/.../packages/`. It is a bundled-in-source demo catalog
  (`agent-plugin-catalog.ts:1-46`, `TOVU_BUNDLED_AGENT_PLUGINS`), read-only by design.
- **`agent-plugin-capability-adapter.ts`** — a *pure mapping function* (`toTovuComposerCapability`,
  `agent-plugin-capability-adapter.ts:82-109`) that would consume `src/features/agent-plugins/`'s output
  type *if* a transport existed. It hand-copies (not imports) `AgentPluginCapabilityDescriptor`
  specifically to avoid a bundler pulling `node:fs/promises` into the browser build
  (`agent-plugin-capability-adapter.ts:10-20`). This is real, tested, forward-looking scaffolding for a
  future wiring — but it is not itself a caller; nothing invokes `toTovuComposerCapability` outside its
  own unit test today.

So: one Jini-source browser (unrelated), one dormant adapter (related-but-unwired) — two different things
sharing a directory, neither of which makes `src/features/agent-plugins/` reachable today.

## 4. The FINAL decision — verified against the source document, not the header's paraphrase

`capability-projection.ts:8-10` cites `2026-08-12-tovu-six-debates-FINAL.md`, "3 — Agent Plugins →
commands," for: *"one adapter feeding the composer's capability projection, not a parallel command
system."*

I read that document directly (`ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md:64-96`).
**The header's summary is accurate, verbatim-checkable:**

> `66: **RECOMMENDATION: Agent Plugins are one adapter feeding debate 2's projection, not a parallel command system.**`
> `70: **Absorbing into the `.tovu-plugin` runtime is impossible, not merely unwise** — verified: the loader requires per-file SHA-256 `integrity`, an `sdkRange`, and an ESM entry...`
> `71: **No `org.tovu.commands` namespace.**... executable bindings and argument schemas must be produced by the host adapter, not by the package being classified — the same rule that forbids a plugin authoring its own MCP allowlist.`

Also cross-checked `capability-projection.ts:31-33`'s claim that "MCP execute is unconditional, not
merely the current default" against the same document — confirmed at
`2026-08-12-tovu-six-debates-FINAL.md:92`: *"a plugin's `mcp.json` has no independent author. **The
operator is that author** — a plugin's MCP servers land proposed, never admitted."* Matches.

Separately, `install.ts:32` cites `CTX-AGENTPLUGINS-2026-08-12.md` F2 for "package format vs.
execution/trust model conflation." Verified at `CTX-tovu-agent-plugins-commands-2026-08-12.md:76`:
*"Agent Plugins v1 is **a package format, not an install, permission, sandbox, or trust model**;
Tovu/Jini must provide those client policies."* Also accurate.

Neither citation is inference dressed as fact. Both check out against the governing documents.

## 5. Overlap with the merged system's concerns

| Concern | plugin-runtime/site-glue (merged) | agent-plugins |
|---|---|---|
| Manifest format | `.tovu-plugin` tarball: `integrity` (per-file SHA-256), `sdkRange`, `tier`, 3-token capability vocabulary, single ESM entry | Open standard `plugin.json`/`mcp.json`: none of the above fields exist in the spec (`manifest.ts:7-12`) |
| Trust tiers | tier-1/2/3, an accepted execution/trust ADR (`CTX-...:83`) | none — MCP execute is permanently `unavailable`, no tier field anywhere |
| Activation/hooks | `loader.ts`, `activation.ts`, `hook-registry.ts` — real runtime that `import()`s and calls `setup()` | none — a Skill's "execution" is markdown text composed into a chat draft; an MCP server is never invoked |
| Capability gating | capability-scoped SDK handed to `setup()` | not applicable — nothing runs, so there's nothing to scope |
| Lifecycle (install/enable/uninstall) | discovery + activation records, workspace-scoped | `install.ts` only extracts bytes to a frozen, read-only tree; explicitly no enable/run control (`AgentPlugins.tsx:16-17`, "intentionally no Enable or Run control") |

The overlap is **naming-level only** ("manifest," "capability," "install") — every field the merge
candidates actually reuse (integrity, sdkRange, tier, hook attachment) is a field the open standard does
not define and the FINAL decision explicitly forbids inventing values for. The one real shared concern —
"a capability descriptor feeding a composer" — already has its own decided target (`debate 2`'s
projection, i.e. `composer-capabilities.ts`, not `plugin-runtime`/`site-glue`).

---

## Recommendation: **Keep separate.**

`src/features/agent-plugins/` implements a different open, externally-governed package format with no
execution model, sitting a full FINAL-decision layer away from the code-execution extension system
(`plugin-runtime` + `site-glue`) being merged. Its concerns — archive containment, tenant-isolated
extraction, markdown-only capability projection — do not overlap the merge's actual reuse targets
(integrity/sdkRange/tier/hook-attachment). A prior debate already ruled out absorbing it, with a verified
technical reason (the loader requires fields the standard doesn't define), not merely a preference. It is
not dead code either: it is fully tested, carries deliberate security engineering, and its own governing
decision names its real integration point — the composer capability projection — which is a different,
still-open wiring gap (no HTTP route, no browser transport), not a scope question this debate should
re-decide.

**Strongest argument against this recommendation:** both ends being unreachable *right now* is
functionally identical to what made `site-glue` fold into the merge — "one working substrate plus an
unfinished design is not two systems." If one applies that same test mechanically, `agent-plugins`
(zero callers, zero routes) looks weaker than `site-glue` was (which at least had `GlueHostPort` call
sites, per SYNTHESIS.md's own framing) and could be judged the *more* orphaned of the two, not the more
separate. The counter is that `site-glue`'s missing piece was purely mechanical (wire an existing
attachment point to an existing loader), while `agent-plugins`'s missing piece is a real decision
(build a marketplace-fetch/consent flow and a browser transport) that the FINAL decision deliberately
deferred — but this is a judgment call, not a settled fact, and the owner may weigh it the other way.
