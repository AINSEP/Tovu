I’m using the codebase-understanding skill to structure the repository analysis, while grounding the debate position directly in the packet’s supplied source files.
ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-2026-08-12 -- I received the packet and will work on it.

## Position

Agent Plugins should supply portable capabilities, not become Tovu’s command runtime. The best design is a host-owned, workspace-scoped command broker that projects validated portable components into slash commands:

- A Skill command activates one specific validated skill as labelled, untrusted instructional context for the next agent run. It cannot change the CLI’s tools, permissions, working directory, environment, or network access.
- An MCP command invokes only a tool already admitted through MCP federation. It inherits that layer’s namespace, operator allowlist, authorization, frozen tool set, provenance labelling, and untrusted-result envelope.
- An optional `org.tovu.commands` extension may add presentation metadata, aliases, argument schemas, and bindings to those portable components. It must not define executable handlers, grant permissions, or be required for the underlying Skill or MCP tool to work.

Thus the actual command surface belongs to the host, while Agent Plugins remain a portable source of Skills and MCP configurations. First-party `.tovu-plugin` commands, if added later, should enter the same broker through their own adapter; Agent Plugins should not be converted into `.tovu-plugin` artifacts.

This matches the repository’s present separation. Composer discovery currently contains descriptors and insertion text, while the only backed action opens MCP settings (`files/tovu/agent-plugin-catalog.ts:42-104`). The composer itself only parses, filters, and replaces or appends text; it has no invocation contract (`files/jini/composer-discovery.ts:9-45`). That boundary should remain honest rather than having palette selection secretly acquire execution authority.

Trust should reuse Tovu’s existing vocabulary at the user-facing level, but not assume that one rung implies one universal containment mechanism. The host—not an Agent Plugin extension—assigns trust from provenance. Each component also needs a distinct execution profile:

- Skill content is instruction-only but still potentially prompt-injecting.
- MCP stdio is local code execution.
- First-party ESM is in-process code with Tovu SDK capabilities.

The current first-party manifest accepts package-declared tiers (`files/tovu/plugin-runtime/manifest.ts:48-63`), but an Agent Plugin must not be allowed to self-promote by declaring equivalent metadata. The existing MCP layer correctly treats remote self-description as untrusted and permits annotations to demote, never promote (`files/tovu/mcp-federation/trust.ts:65-85`, `files/tovu/mcp-federation/trust.ts:271-303`).

For stdio, the federation trust layer is necessary but not a sandbox. It replaces most of the inherited environment, yet still spawns the command directly and exposes `PATH`, `HOME`, and `TMPDIR` (`files/tovu/mcp-federation/adapter.stdio.ts:298-312`, `files/tovu/mcp-federation/adapter.stdio.ts:372-394`). A plugin MCP process therefore requires an OS-enforced boundary: unprivileged identity, read-only plugin root, writable access only to its workspace-specific `PLUGIN_DATA`, resource limits, and network denial unless separately granted. Until that exists, arbitrary Agent Plugin MCP subprocesses must remain unavailable; labelling them “tier-3” is disclosure, not containment.

Workspace state must include enabled version or content digest, admitted components, permissions, aliases, and data directory. The first-party activation model supplies a useful precedent: records are keyed by both workspace and plugin, and disabling preserves the version that was actually active (`files/tovu/plugin-runtime/activation.ts:27-45`, `files/tovu/plugin-runtime/activation.ts:112-127`; `files/tovu/plugin-runtime/repo.sqlite.ts:34-50`).

Canonical names must be authority-qualified. A short `/review` alias may execute only when exactly one enabled command owns it in that workspace. Otherwise the palette must require disambiguation; there is no registration-order or last-write-wins rule. MCP already demonstrates the right construction with `mcp__<connection>__<tool>` plus a live collision assertion (`files/tovu/mcp-federation/trust.ts:57-63`, `files/tovu/mcp-federation/trust.ts:205-227`).

The smallest honest product slice is the bundled `ui-ux-design` Skill as a context-only command, with no installation, subprocess, marketplace inventory, or implied enablement. Rollback is removal of that workspace command projection; the package remains catalogued and inspectable. This preserves the current screen’s explicit “does not execute” and future-only Marketplace claims (`files/tovu/AgentPlugins.tsx:65-67`, `files/tovu/AgentPlugins.tsx:85-95`) and its exact source allowlist (`files/tovu/agent-plugin-source-catalog.ts:21-27`, `files/tovu/agent-plugin-source-catalog.ts:48-58`).

The packet’s specification rendering is not byte-verbatim. That does not materially affect this conclusion because it depends on the stated absence of portable command, trust, and installation semantics. Exact conformance and schema-edge behavior should nevertheless be checked against the pinned upstream v1 document before loader acceptance tests are treated as normative.

## Option Assessment

- **A — Skills-as-commands:** Useful as the default projection, but wrong as the complete model. A Skill is an instruction bundle, not an action contract: it does not define arguments, side effects, result semantics, or authorization. Automatically exposing every skill would also turn package discovery into permission to inject instructions. It is acceptable only after validation and workspace enablement, with provenance visible and no expansion of the agent CLI’s existing authority.

- **B — Reverse-domain extension:** Valuable only as an optional UX overlay. It is not a fork if other clients can ignore it and the package remains useful through its portable Skills and MCP servers. It becomes a de facto fork if Tovu requires it for invocation or lets it define execution semantics. It is worth proposing upstream only after multiple independent hosts need the same target-binding and argument model; Tovu-specific labels alone do not justify standardization.

- **C — MCP-tools-as-commands:** Correct for MCP-backed actions, not for Agent Plugins as a whole. The real bundled plugin has no MCP component (`files/tovu/plugin.json:1-6`), so this option would produce no command for it. Dynamic MCP descriptions and schemas are attacker-controlled (`files/tovu/mcp-federation/ports.ts:32-69`). Tovu’s federation already provides strong admission controls—default-deny allowlists, schemas, caps, namespaces, per-call authorization, and wrapped results (`files/tovu/mcp-federation/registrations.ts:75-135`)—but it intentionally refuses remotely declared destructive or non-read-only tools (`files/tovu/mcp-federation/trust.ts:276-289`). That makes it a restricted backend, not a general command ontology.

- **D — Reuse the first-party runtime:** Reuse its concepts and control-plane patterns, not its artifact or loader. Its manifest vocabulary, fixed capabilities, hooks, integrity map, SDK range, and strict unknown-key rejection are Tovu-specific (`files/tovu/plugin-runtime/manifest.ts:106-131`, `files/tovu/plugin-runtime/manifest.ts:165-173`). Adapting an open package into that manifest changes its meaning and creates two sources of truth. More importantly, the current loader dynamically imports code in-process and explicitly leaves setup plus capability-scoped SDK/hook attachment unwired (`files/tovu/plugin-runtime/loader.ts:121-158`). The hook registry confirms that historical gap (`files/tovu/plugin-runtime/hook-registry.ts:11-20`). It is therefore not an Agent Plugin sandbox.

- **E — Component projection through a host command broker:** This is the strongest decomposition. It preserves portable components, centralizes collisions and workspace policy, and lets Skill, federated MCP, and future native commands retain different trust semantics without presenting three unrelated palettes.

Version handling belongs to the installation and activation record. Tovu should accept only the pinned Agent Plugins v1 schema; an unknown schema remains inspectable but unavailable. A `plugin.json`/`mcp.json` schema mismatch invalidates only MCP-derived commands, not valid Skills. Plugin SemVer is descriptive rather than provenance: execution should pin immutable content, and changed capabilities or MCP surfaces require renewed approval. This mirrors the first-party runtime’s useful active-version concept without importing its artifact format.

A marketplace cannot honestly launch on package metadata alone. The format’s author and version fields are not signatures. Distribution requires an independently signed index or envelope, immutable digests, provenance, revocation, and workspace approval. Until those exist, the current inert Marketplace is the correct product.

## Failure Modes And Sacrifice

Principal failure modes and hidden costs are:

- A malicious Skill persuades the CLI to exercise powers the slash command did not visibly request. The invariant must be that context changes, authority does not.
- A stdio MCP process reads host files, credentials, or other workspaces despite having a carefully limited tool catalog. MCP admission protects the model-facing boundary, not the machine; the trust module itself expressly declines to claim external servers are safe (`files/tovu/mcp-federation/trust.ts:98-103`).
- Global process registries or sessions leak one workspace’s enabled commands into another. Existing activation persistence is workspace-aware, but federation wiring receives a single `workspaceId` and registers into a daemon registry (`files/tovu/mcp-federation/registrations.ts:47-53`, `files/tovu/mcp-federation/bootstrap.ts:110-130`); that distinction must not be papered over.
- A package update retains the same name and version while changing bytes, commands, or MCP tools. SemVer alone cannot authorize replacement.
- Short aliases collide or change owners after enablement. Ambiguity must stop execution rather than resolve by ordering.
- A frozen MCP surface prevents runtime rug-pulls but can become stale after a legitimate server upgrade. Reconnection must not silently convert a newly advertised surface into approved commands.
- “Installed” or “inspected” is mistaken for “trusted.” The source inspector is a closed display surface, not signature verification or permission approval.
- Sandboxing across Linux, macOS, containers, and varied self-hosted deployments is a substantial operational product, including cleanup, quotas, process lifecycle, diagnostics, and support.
- Revocation can prevent future invocation but cannot reverse external effects already caused by a tool. Rollback claims must be limited accordingly.

The genuine sacrifice is ecosystem immediacy: Tovu would not automatically run arbitrary downloaded plugins or expose every MCP tool as a convenient slash command. Command names may also differ across clients because the open standard does not define them. That is preferable to manufacturing interoperability or safety that does not exist.

## What Would Change My Mind

I would favor a more direct Agent-Plugin-as-command model if the upstream standard introduced a normative command component with target semantics, typed arguments, component isolation, capability declarations, and conformance tests.

I would give `org.tovu.commands` greater weight if at least two independent clients adopted compatible semantics and real packages demonstrated that Skills and MCP tools alone could not express common invocations.

I would support absorption into the first-party runtime if that runtime gained a completed activation path, a containment model appropriate to subprocesses and instruction content, and a lossless adapter that did not require rewriting the portable package’s meaning.

I would relax the MCP restriction if independent classification—not remote annotations—could establish tool effects, and the local process sandbox were shown to contain filesystem, credential, resource, and network access across Tovu’s supported self-hosted environments.

Finally, evidence from user testing could change whether individual Skills deserve commands at all. If skill-per-command produces clutter or users expect slash entries to perform immediate actions, skills should remain discoverable context resources rather than masquerade as actions.

## Unlisted Option

A strong unlisted option is a workspace-owned command profile stored outside the package. An administrator explicitly binds a host alias and argument contract to a validated Skill or admitted MCP tool. Packages remain completely standard; different workspaces can expose different subsets and names; revocation removes bindings without rewriting package contents.

This is less portable at the alias level, but more honest: the portable object is the capability, while the command is local policy. The chosen host-broker design can support such profiles alongside conservative synthesized names.

## Blind Spots

**(a) Viable option not listed:** Do not expose plugin components as slash commands at all. Let the assistant select enabled Skills through ordinary capability discovery, while slash commands remain a small, host-curated set of stable workflows. This avoids falsely equating “discoverable” with “directly executable.”

**(b) Missing question:** What exact authority does a plugin-triggered agent CLI inherit, and what user-visible consent is required when a context-only Skill influences later native or federated tool calls? Trust analysis focused only on package code will miss the more indirect instruction-to-tool escalation path.

**(c) Likely-wrong framing assumption:** The assumption that a plugin should “become a command.” Packages, Skills, MCP servers, MCP tools, and commands have different cardinalities and semantics. The bundled package already appears separately as an Agent Plugin and a Skill in composer discovery (`files/tovu/agent-plugin-catalog.ts:57-83`), demonstrating that even today there is no natural one-package/one-command mapping. Commands should be host-owned views over enabled capabilities, not another portable component invented by implication.

<<SWARM_END>>