ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

**Position, unchanged in substance:** Skills stay context-injection-only with no trust model. MCP-backed execution stays gated by `mcp-federation`'s trust tier (`files/tovu/mcp-federation/trust.ts:57-107`), never a new one. Option D stays dead — the packet's own "What Round 1 settled" paragraph closes it on exactly the evidence I cited in Round 1 (`loader.ts:8-20`'s integrity/sdkRange/import() pipeline, `manifest.ts:36`'s three-member capability vocabulary, `manifest.ts:59-60`'s unused `adminSurfaces`), so I have nothing to add there — it's settled, not re-argued.

**What actually moved:** in Round 1 I argued the packet's question was mis-shaped — "how do Agent Plugins become commands" is really two unrelated questions (context vs. execution) wearing one costume — and my strongest deliverable was Unlisted Option F: *refuse* MCP-backed commands until the allowlist-authorship problem (Failure Mode 1 in my R1 answer) has a real answer, ship Skills-only. That was a critique plus a refusal. N1-N4 don't reopen that critique; they make it non-optional to *operationalize* it: build one generic contract that already accommodates a future answer to the MCP question without the composer caring, while today's shipped slice keeps refusing MCP execution exactly as F said. Round 2 is F turned into code, not a new position.

**Strongest counter-argument against me:** Gemini 3.1 Pro's Round 1 Unlisted Option — Subagent Delegation. Its point: Tovu's own federated MCP tools already reach the model by autonomous tool selection through `ToolRegistry` (`mcp-federation/registrations.ts:90-132`), never through a typed slash command with rendered argument placeholders. N4 asks me to build exactly that argument-placeholder UI (`/mcp … <server-id>`) for a source type Tovu's own precedent never routes that way. I'm complying with N4 as stated below, but I think this is a real, unresolved tension between the packet's target UX and the codebase's own existing pattern, and I'm not going to pretend building the argument-schema plumbing settles it.

## Solution Slate

**Ranking criteria**, in order: (1) honesty — a descriptor may never claim capability that outruns what's actually admitted (C6); (2) buildable now, grounded in what `files/` actually shows, not a speculative admin surface; (3) extensibility — a new capability source needs zero composer code change (N3); (4) preserves the Round-1-settled boundaries (Skills = context only, MCP = federation trust only, D stays dead).

### Option 1 — Descriptor projection; Skills execute, MCP catalogued-not-executed (RECOMMENDED)

One generic `CapabilityDescriptor` contract projects every source (Agent Plugin skills, Agent Plugin MCP servers, native tools, first-party regular plugins) into the composer. Skills get a real `insert-text` execute binding — nothing new, this already works today. Agent-Plugin-declared MCP servers get a real *preview* (the raw `mcp.json`, so N1 is genuinely satisfied) but their `execute` binding is always `{ kind: "unavailable", reason: ... }" — never `tool-call`.

- **Meets:** honesty (nothing is presented as working that isn't), buildable today against `files/` alone, extensible by construction (see code), and it doesn't touch `mcp-federation`'s trust model at all.
- **Genuine sacrifice:** identical to the one I named in Round 1 — a plugin that ships `mcp.json` gets zero "install it, get a working command" experience. That gap is *visible* in the UI (see Honesty Gate below), not hidden.

### Option 2 — Same contract + an operator-authored per-plugin MCP allowlist

Everything in Option 1, plus a new admin surface: after a site operator inspects a plugin's `mcp.json` (via the exact same preview N1 asks for), they hand-author a connection config for it — the same shape `mcp-federation/config.ts`'s `ResolvedFederatedConnection`/`allowedToolNames` already takes for `supabase-mcp-plugin.ts`, just authored by a human reviewing a specific installed plugin instead of a preset shipped in the repo. This is the only path that actually admits a plugin's MCP tools honestly (see The Trust Gap).

- **Meets:** honesty (still an independent author, just a runtime one instead of a code-reviewed one) and preserves Round-1 boundaries.
- **Fails right now on:** buildable-today. There is no persistence or admin UI for "author a connection config for an arbitrary installed plugin" anywhere in `files/` — `plugin-runtime/activation.ts`/`repo.sqlite.ts` are the *first-party* tier-1/2/3 runtime's storage, a different system by Round 1's own D-rejection, so it can't be silently repurposed. This is real future work, not this round's leading option.

### Option 3 — Auto-admit whatever `mcp.json` declares (rejected, listed for legibility)

Treat the plugin's own `mcp.json` `allowedToolNames`-equivalent as the allowlist. Rejected outright: this is exactly Round 1's Failure Mode 1 — every peer independently converged on refusing it (Codex: "an Agent Plugin must not be allowed to self-promote"; both Gemini instances route MCP only through the *existing, operator-configured* federation layer; Opus and I both named the allowlist-authorship mismatch by name). Not re-litigated here; kept only so the ranking has a rejected floor to rank against.

**Cheapest falsifying test (for Option 1):** feed `agentPluginToDescriptors()` a fixture `LoadedAgentPluginPackage` whose `mcpServers` is non-empty, and assert every descriptor with `provenance.sourceKind === "agent-plugin-mcp-tool"` has `execute.kind === "unavailable"`; separately assert `projectCapabilityDescriptors()` never emits an item with `descriptor.execute.kind === "tool-call"` for any `sourceKind` beginning `"agent-plugin"`. About ten lines, no server, no admin flow, no fixture beyond what the plugin's own directory shape (`files/tovu/plugin.json`, `files/tovu/agent-plugin-source-catalog.ts`) already implies. If this test can be made to fail without editing the adapter, the MCP half has silently started shipping.

## Leading Option — Code

### 1. The descriptor type

```ts
// tovu/capability-projection/capability-descriptor.ts
//
// The one contract every source (Agent Plugin skill, Agent Plugin MCP server, native tool, regular
// plugin, future connector) is projected through. The composer depends on THIS file and nothing
// source-specific — see capability-projector.ts for why that's what makes N3 true.

/** JSON-Schema object, same shape `mcp-federation/trust.ts` R4 already requires of a remote tool's
 * `inputSchema` (`asJsonSchemaObject`, trust.ts:326-329) — reused rather than reinvented, so an
 * admitted federated tool's own schema can become a descriptor's argumentSchema unchanged. */
export type CapabilityArgumentSchema = Readonly<Record<string, unknown>>;

export interface CapabilityPreviewFile {
  readonly relativePath: string;
  readonly content: string;
}

/** Closed, 3-member. The preview modal switches on `kind`, never on where the descriptor came
 * from — that's the mechanism behind "the composer never learns what a skill is" (item 3 below). */
export type CapabilityPreviewSource =
  | { readonly kind: "none" }
  | { readonly kind: "files"; readonly files: readonly CapabilityPreviewFile[] }
  | { readonly kind: "json"; readonly value: unknown };

/** Closed, 4-member. An adapter can only ever select ONE of these named, host-interpreted
 * behaviors — never supply code, a URL to fetch-and-eval, or anything else open-ended. This is the
 * same "self-declaration can demote, never invent a new grant" discipline `trust.ts` R3 uses,
 * applied to execution shape instead of risk level. */
export type CapabilityExecuteBinding =
  | { readonly kind: "insert-text"; readonly text: string }
  | { readonly kind: "route"; readonly path: string }
  | { readonly kind: "tool-call"; readonly toolId: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Open on purpose (N3): a recognized literal gets a curated label in the projector, an
 * unrecognized one still renders — humanized from its own string — with zero composer code change. */
export type CapabilitySourceKind =
  | "native-tool"
  | "regular-plugin"
  | "agent-plugin-skill"
  | "agent-plugin-mcp-tool"
  | "connector"
  | (string & {});

export type CapabilityTrustTier =
  | "native" // Tovu's own reviewed catalog, tool-catalog-query.ts's world
  | "reviewed-vendor-preset" // e.g. supabase-mcp-plugin.ts via mcp-federation/presets.ts
  | "bundled-source-tree" // e.g. ui-ux-design — first-party bytes, zero execution surface (Skill)
  | "unreviewed-third-party"; // anything an operator hasn't personally vetted

export interface CapabilityProvenance {
  readonly sourceKind: CapabilitySourceKind;
  readonly sourceLabel: string; // e.g. the plugin's displayName, or the MCP connection's label
  readonly trustTier: CapabilityTrustTier;
}

export interface CapabilityDescriptor {
  readonly id: string; // namespaced by construction — see collisions section
  readonly label: string;
  readonly description: string;
  readonly keywords?: readonly string[];
  readonly argumentSchema?: CapabilityArgumentSchema; // absent = no-argument capability
  readonly preview: CapabilityPreviewSource;
  readonly execute: CapabilityExecuteBinding;
  readonly requiresConfirmation: boolean;
  readonly provenance: CapabilityProvenance;
}

export interface CapabilityProvider {
  readonly providerId: string;
  listDescriptors(): readonly CapabilityDescriptor[];
}
```

### 2. The Agent Plugins adapter

```ts
// tovu/capability-projection/agent-plugin-adapter.ts

import type { CapabilityDescriptor, CapabilityPreviewFile } from "./capability-descriptor";

/**
 * The EXACT shape Tovu reads out of `extensions["org.tovu.commands"]` (Round 1's Option B, scoped
 * to presentation metadata only). There is deliberately no `run`, `handler`, `script`, `command`, or
 * `execute` field anywhere in this type. That is the proof this namespace carries no executable
 * semantics: `readCommandsOverride` below is the ONLY function that ever reads this extension, and
 * it destructures exactly `label` / `description` / `order` — nothing else in the object is ever
 * looked at, so an author who adds a `run` field gets it silently ignored, never invoked. The
 * `execute` binding for every descriptor below is derived by THIS adapter from the portable
 * component's own kind (Skill -> insert-text of its own markdown; MCP server -> see below) — never
 * taken from `extensions`.
 */
export interface AgentPluginCommandsExtension {
  readonly [skillOrToolName: string]:
    | { readonly label?: string; readonly description?: string; readonly order?: number }
    | undefined;
}

export interface LoadedAgentPluginSkill {
  readonly name: string;
  readonly skillMarkdown: string;
  readonly referenceFiles: readonly CapabilityPreviewFile[];
}

export interface LoadedAgentPluginMcpServer {
  readonly serverId: string;
  /** Verbatim `mcp.json` content for ONE declared server. Never executed, never `import()`ed,
   * never dialed — display-only data, same posture `ports.ts` gives every remote-controlled field:
   * typed, carried, and never trusted by construction. */
  readonly declaredConfig: Readonly<Record<string, unknown>>;
}

export interface LoadedAgentPluginPackage {
  readonly pluginId: string;
  readonly displayName: string;
  readonly pluginJsonSchema: string | undefined; // plugin.json's own "$schema" (plugin.json:2)
  readonly mcpJsonSchema: string | undefined; // mcp.json's own "$schema", if the plugin ships one
  readonly skills: readonly LoadedAgentPluginSkill[];
  readonly mcpServers: readonly LoadedAgentPluginMcpServer[];
  readonly commandsExtension: AgentPluginCommandsExtension | undefined;
  /** `true` only for plugins physically bundled in Tovu's source tree (ui-ux-design today —
   * `tovu/plugin.json:1-6`, `tovu/agent-plugin-catalog.ts:23-33`). Round 1 established there is no
   * install protocol for anything else (Round 1 Opus, Blind Spot b), so this is always
   * "bundled-source-tree" in what actually ships this round — `"sideloaded"` exists in the type for
   * when that changes, not because it's reachable today. */
  readonly installOrigin: "bundled-source-tree" | "sideloaded";
}

function readCommandsOverride(
  ext: AgentPluginCommandsExtension | undefined,
  name: string,
): { label?: string; description?: string; order?: number } {
  const entry = ext?.[name];
  return entry ? { label: entry.label, description: entry.description, order: entry.order } : {};
}

/** Skills -> context-injection descriptors. Zero execution, zero new trust decision — the only
 * "grant" is bundling the plugin at all, exactly as `AgentPlugins.tsx:65-66`'s existing copy says. */
function skillToDescriptor(pkg: LoadedAgentPluginPackage, skill: LoadedAgentPluginSkill): CapabilityDescriptor {
  const override = readCommandsOverride(pkg.commandsExtension, skill.name);
  return {
    id: `agent-plugin:${pkg.pluginId}:skill:${skill.name}`,
    label: override.label ?? skill.name,
    description: override.description ?? `Portable skill from the ${pkg.displayName} Agent Plugin`,
    keywords: ["skill", pkg.pluginId, skill.name],
    preview: {
      kind: "files",
      files: [{ relativePath: `skills/${skill.name}/SKILL.md`, content: skill.skillMarkdown }, ...skill.referenceFiles],
    },
    execute: { kind: "insert-text", text: skill.skillMarkdown },
    requiresConfirmation: false,
    provenance: {
      sourceKind: "agent-plugin-skill",
      sourceLabel: pkg.displayName,
      trustTier: pkg.installOrigin === "bundled-source-tree" ? "bundled-source-tree" : "unreviewed-third-party",
    },
  };
}

/**
 * MCP servers -> NEVER a `tool-call` descriptor from this adapter alone. See "The Trust Gap": the
 * one thing that would make a `tool-call` binding honest here — an independently-authored allowlist
 * — does not exist for a plugin's own `mcp.json`, and this function has no authority to manufacture
 * one. What it CAN do honestly is make the declared surface visible (N1) while being explicit that
 * it is inert (the honesty gate) — a `$schema` mismatch degrades the copy further without changing
 * the outcome, since the outcome ("unavailable") was never conditional on the schema matching.
 */
function mcpServerToDescriptor(pkg: LoadedAgentPluginPackage, server: LoadedAgentPluginMcpServer): CapabilityDescriptor {
  const schemaMismatch =
    pkg.mcpJsonSchema !== undefined && pkg.pluginJsonSchema !== undefined && pkg.mcpJsonSchema !== pkg.pluginJsonSchema;
  return {
    id: `agent-plugin:${pkg.pluginId}:mcp:${server.serverId}`,
    label: server.serverId,
    description: `MCP server declared by the ${pkg.displayName} Agent Plugin`,
    preview: { kind: "json", value: server.declaredConfig },
    execute: {
      kind: "unavailable",
      reason: schemaMismatch
        ? "mcp.json's $schema does not match plugin.json's — shown for inspection only, not admitted"
        : "not available — Tovu has no independent reviewer for a plugin-declared MCP server yet (mcp-federation/trust.ts R2)",
    },
    requiresConfirmation: false,
    provenance: { sourceKind: "agent-plugin-mcp-tool", sourceLabel: pkg.displayName, trustTier: "unreviewed-third-party" },
  };
}

export function agentPluginToDescriptors(pkg: LoadedAgentPluginPackage): readonly CapabilityDescriptor[] {
  return [...pkg.skills.map((s) => skillToDescriptor(pkg, s)), ...pkg.mcpServers.map((s) => mcpServerToDescriptor(pkg, s))];
}
```

### 3. Preview — generic, without the composer learning what a skill is

The preview modal (today's hardcoded `AgentPluginDetailsModal.tsx` + `UI_UX_DESIGN_SOURCE_FILES`, per N1's description — not in `files/`, so I'm designing to the packet's description of it, not quoting its lines) collapses to one generic renderer that switches on `CapabilityPreviewSource.kind` — a 3-member enum owned by the *contract*, never on `sourceKind`. It performs zero I/O: every `files`/`json` payload arrives already resolved.

```ts
// tovu/capability-projection/preview-allowlist.ts
//
// Generalizes agent-plugin-source-catalog.ts's UI_UX_DESIGN_SOURCE_FILES / getBundledAgentPluginSourceFiles
// / findBundledAgentPluginSourceFile from "one hardcoded plugin id" to "one allowlist keyed by plugin
// id" — a second bundled plugin adds a map entry, not a copy of the lookup functions.
//
// The traversal defense is UNCHANGED, not re-implemented: this stays a closed, compile-time,
// `?raw`-imported inventory (agent-plugin-source-catalog.ts:1-14's import list is exactly this
// mechanism). Resolution is Array.find over exact relativePath equality against bytes that were
// already imported at build time — a caller-supplied "../../../etc/passwd" simply never equals any
// entry's relativePath, so there is nothing to detect or reject as a special case; the class of bug
// (reading a caller-controlled path off disk) is structurally absent rather than guarded against.

export interface DeclaredPreviewFile {
  readonly relativePath: string;
  readonly content: string;
}

export type BundledPreviewAllowlist = Readonly<Record<string, readonly DeclaredPreviewFile[]>>;

export function getDeclaredPreviewFiles(allowlist: BundledPreviewAllowlist, pluginId: string): readonly DeclaredPreviewFile[] {
  return allowlist[pluginId] ?? [];
}

export function findDeclaredPreviewFile(
  files: readonly DeclaredPreviewFile[],
  relativePath: string,
): DeclaredPreviewFile | null {
  return files.find((file) => file.relativePath === relativePath) ?? null;
}
```

The modal itself becomes a pure function of `CapabilityDescriptor["preview"]`: `files` renders the existing file tree + `CodeWithLines` (unchanged rendering, generalized input); `json` renders a read-only formatted viewer (new, needed for `mcpServerToDescriptor`'s output); `none` renders the existing inert notice. Nothing in the modal branches on `provenance.sourceKind` — that's what "without the composer learning what a skill is" means concretely: the modal knows about *preview shapes*, never about *source types*. The same renderer also replaces `AgentPluginDetailsModal`'s whole-package "Inspect package files" button in `AgentPlugins.tsx:45-47` — feed it a `files` preview built from every skill's files concatenated, and the settings-dialog inspector and the composer's per-item preview share one implementation instead of two.

### 5. Collisions and versioning

**Collision:** descriptor `id`s are namespaced by construction (`agent-plugin:<pluginId>:skill:<name>`), mirroring `mcp-federation/trust.ts` R1's `mcp__<connectionId>__<remoteName>` (`trust.ts:57-63`) — two different plugins literally cannot produce the same `id` string, so an *id* collision is structurally impossible, not merely checked for. The real risk two plugins both offering `/review` create is a *label* collision — both entries read "Review" in the palette. That's resolved the way `filterComposerDiscovery` already treats ambiguity (`jini/composer-discovery.ts:15-35`): surface both, never silently pick one:

```ts
// tovu/capability-projection/capability-projector.ts (excerpt)

/** Two descriptors may share a label; they never share an id. When a label repeats, every affected
 * item is suffixed with its own provenance so the palette stays disambiguated instead of picking a
 * winner — there is no "first plugin wins" rule anywhere in this contract, deliberately, matching
 * mcp-federation's own refusal to let registration order decide anything security-relevant. */
export function disambiguateComposerLabels(items: readonly ComposerDiscoveryItem[]): readonly ComposerDiscoveryItem[] {
  const countByLabel = new Map<string, number>();
  for (const item of items) countByLabel.set(item.label, (countByLabel.get(item.label) ?? 0) + 1);
  return items.map((item) => {
    if ((countByLabel.get(item.label) ?? 0) <= 1) return item;
    const sourceLabel = item.descriptor?.provenance.sourceLabel;
    return sourceLabel ? { ...item, label: `${item.label} — ${sourceLabel}` } : item;
  });
}
```

**Versioning:** descriptor `id`s carry no version. A plugin upgrade in place (same `pluginId`) replaces its descriptors wholesale at the next catalog build — the same behavior `TOVU_BUNDLED_AGENT_PLUGINS` already has today (source-tree bundling, rebuilt at compile time) and the same "latest wins, others stay dormant" precedent `plugin-runtime/discovery.ts:144-161` uses for the first-party runtime. No new versioning mechanism is invented for Agent Plugins specifically.

**`$schema` mismatch:** handled inside `mcpServerToDescriptor` above — it degrades the `unavailable` reason string but never changes the outcome (MCP was never going to execute regardless), and Skills descriptors are built completely independently of `pkg.mcpServers`, so a broken `mcp.json` never touches a plugin's Skills. That is Round 1 Failure Mode 2 (silent partial plugin) made *loud* instead of silent: the reason string names the mismatch explicitly rather than the plugin just quietly having zero MCP entries with no explanation.

### 6. Honesty gate

Two concrete, checkable commitments, not just a promise:

1. **Composer copy.** `toComposerDiscoveryItem` appends `execute.reason` to the description whenever `execute.kind === "unavailable"`, and the composer's selection resolver (below) refuses to invoke it — not just visually greyed, structurally inert:

```ts
// jini/composer-discovery.ts — ONE additive function; every existing export is unchanged.

export type ComposerSelectionEffect =
  | { readonly type: "insert-text"; readonly text: string }
  | { readonly type: "navigate"; readonly path: string }
  | { readonly type: "invoke-tool"; readonly toolId: string; readonly requiresConfirmation: boolean }
  | { readonly type: "disabled"; readonly reason: string };

/** The one place a selected item's `execute` binding becomes host behavior. Every branch is a
 * closed, host-interpreted effect; an item selects ONE of these, never supplies code — which is what
 * lets a brand-new sourceKind reach the composer with zero further composer changes (N3). Legacy
 * items with no `descriptor` (nothing in files/ has one yet outside this design) keep today's
 * insertText-only behavior untouched. */
export function resolveComposerSelection(item: ComposerDiscoveryItem): ComposerSelectionEffect {
  const execute = item.descriptor?.execute;
  if (!execute) return { type: "insert-text", text: item.insertText };
  switch (execute.kind) {
    case "insert-text":
      return { type: "insert-text", text: execute.text };
    case "route":
      return { type: "navigate", path: execute.path };
    case "tool-call":
      return { type: "invoke-tool", toolId: execute.toolId, requiresConfirmation: item.descriptor!.requiresConfirmation };
    case "unavailable":
      return { type: "disabled", reason: execute.reason };
  }
}
```

2. **Settings-dialog copy.** `AgentPlugins.tsx`'s existing inert note (`AgentPlugins.tsx:65-66`, "Tovu does not execute Agent Plugins yet") gets a second, conditional line whenever a plugin's loaded package has a non-empty `mcpServers`: *"This plugin also declares N MCP server(s) — visible for inspection, not available as commands yet."* If a future slate ships Skills but not MCP (which is exactly what Option 1 does), that sentence is the whole honesty gate for this feature made user-visible, not just a code-level guarantee.

`ComposerDiscoveryItem` gains exactly one optional field this round — `descriptor?: CapabilityDescriptor` — alongside its existing `insertText`. That is the one Jini-side contract change; everything after it (a fifth, sixth, twentieth capability source) needs none.

## The Trust Gap

Not glossing this: `mcp-federation`'s R2 allowlist (`trust.ts:65-69`) is only as good as its author, and the codebase is explicit about who that author must be — `ports.ts:114-119` says an allowlist default "is a per-vendor judgement and therefore belongs to a vendor preset... authored from that server's real, inspected tool surface, which is what makes it an independent classification rather than a restatement of the remote's own claims." Today there are exactly two ways to be that independent author: (a) a site operator's own `allowedToolNames` env value (`config.ts:60-66`'s `parseAllowedToolNames`), or (b) a vendor preset like `supabase-mcp-plugin.ts`, registered as "ordinary reviewed code in this repository" through `presets.ts` (`presets.ts:20-23`). Both are Tovu-side humans, one at deploy time and one at code-review time.

A plugin's `mcp.json` is neither. It is the plugin author's own file, shipped inside the exact package under review — there is no third case in the existing trust model for "the thing being classified wrote its own allowlist," and R3's one-way-demotion rule (`trust.ts:70-74`) does not rescue this: it only ever *removes* an already-admitted tool from an *independently authored* allowlist. If the allowlist itself is the plugin's own claim, R3 has nothing to demote from — a compromised plugin's `mcp.json` could set `destructiveHint: false` on something destructive and R3 would wave it through, because the rule was never designed to adjudicate the allowlist's own authorship, only a remote's honesty about tools already on one. Namespacing (`trust.ts` R1) doesn't rescue it either — it stops a plugin's tool from *impersonating* a native id, but says nothing about whether the tool is safe to expose at all; a namespaced `mcp__ui-ux-design__execute_sql` is still `execute_sql`.

So, concretely, what admits a plugin's MCP tools:

- **Not this slate.** `mcpServerToDescriptor` above always returns `execute: { kind: "unavailable", ... }`. This is a decision, stated in code and in UI copy (the Honesty Gate section), not a gap I'm leaving implicit.
- **The only honest future path (Option 2):** a site operator personally inspects the plugin's real `mcp.json` — which this round's own `preview: { kind: "json", value: server.declaredConfig }` now makes visible for the first time — and hand-authors a connection config for it, the same way `supabase-mcp-plugin.ts` was hand-authored for Supabase, just as a runtime admin action instead of a code review. That requires new persistence and UI this round's `files/` gives no evidence of, which is why it's ranked second, not first.

The MCP half does not ship in the leading option. That sentence is the answer to item 4, not a placeholder for one.

## What Would Change My Mind

- **Evidence Option 2's admin surface is already planned or exists elsewhere** (a per-plugin connection-config authoring UI/store not shown in `files/`) — the descriptor contract above is identical either way, so this would promote Option 2 to leading immediately with no redesign, only a different `mcpServerToDescriptor` implementation.
- **A product decision that argument-schema slash commands (N4) are reserved for native, first-party bindings only** (`/mcp`, `/search`) and never meant to reach third-party-sourced `tool-call` descriptors at all — this would resolve Gemini 3.1 Pro's Subagent-Delegation counter-argument by scoping it away rather than answering it, and would mean the `tool-call` variant in `CapabilityExecuteBinding` never needs to point at anything Agent-Plugin-sourced, simplifying the trust question to "does it apply to this contract at all" instead of "how do we solve it."
- **A real second bundled Agent Plugin that ships `mcp.json`.** Today only `ui-ux-design` exists and `files/tovu/plugin.json:1-6` has no `mcp` field — Codex and I both flagged this in Round 1. The moment a real one exists, (A) vs (B) in The Trust Gap stops being a hypothetical design choice and becomes a live product blocker, which would raise how much I'd argue for building Option 2 now rather than after.

<<SWARM_END>>
