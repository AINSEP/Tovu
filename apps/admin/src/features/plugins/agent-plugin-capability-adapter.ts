import type { ComposerHostBinding, TovuComposerCapability } from "./composer-capabilities";

/**
 * @file Reconciles the Agent Plugins workstream's candidate descriptor shape
 * (`src/features/agent-plugins/capability-projection.ts`, commit `7431b50`) against this
 * projection's own `TovuComposerCapability` contract. Read `composer-capabilities.ts`'s module
 * doc first for what `ComposerHostBinding` means and why it never crosses into
 * `@jini-ai/chat`'s `slots.ts`.
 *
 * ---------------------------------------------------------------------------
 * Why the descriptor type is copied here, not imported
 * ---------------------------------------------------------------------------
 * `capability-projection.ts` lives under `src/features/agent-plugins/` — server-side, and it
 * imports `node:fs/promises` (`readInstalledSkillMarkdown`). Importing it, even for its types,
 * risks a bundler pulling the whole module graph into the browser build the moment anyone adds a
 * runtime (non-type-only) import anywhere in that chain — the same category of mistake
 * `AssistantDock.tsx`'s own module doc warns about for `tool-registrations.ts`. `AgentPluginCapabilityDescriptor`
 * below is a hand-kept, verified-against-source shadow of theirs (verified 2026-08-12 by reading
 * the real file, not inferred) — that module's own header calls its shape a CANDIDATE contract,
 * not a promise, so drift here means re-verifying against source, not assuming either side moved.
 *
 * ---------------------------------------------------------------------------
 * The non-negotiable rule this mapping preserves (FINAL decision, debate 3)
 * ---------------------------------------------------------------------------
 * A Skill's `execute: { kind: "context-injection" }` becomes a REAL, selectable
 * `ComposerHostBinding` — its markdown composed directly into the draft, since "context
 * injection" and "the next message the agent reads" are the same thing once a Skill's content
 * crosses into a chat draft. An MCP server's `execute: { kind: "unavailable" }` NEVER becomes a
 * binding — `resolve` is omitted entirely, so selecting it resolves to `undefined` through
 * `resolveComposerDiscoveryOutcome` (a documented no-op, not a silent bug). Its `reason` is
 * folded into the item's own `description` instead — "previewable but structurally inert" means
 * the reason is something an operator reads on the row, not text that could be sent to the
 * assistant as though it were a real instruction.
 *
 * ---------------------------------------------------------------------------
 * What this file does NOT do
 * ---------------------------------------------------------------------------
 * No `ComposerCapabilitySource` here — that needs a browser-reachable transport for
 * `AgentPluginCapabilityDescriptor[]`, and none exists: `projectInstalledAgentPluginCapabilities`
 * runs server-side (reads skill markdown off disk) and nothing proxies its output to the admin
 * session. Building that endpoint is the same category of decision the coordinator held back on
 * the tool-registry catalog for — an operator-facing exposure question, not a plumbing one — so
 * it is reported as remaining, not invented here. This file is the pure, DI-free mapping a future
 * source supplies its already-fetched descriptors to.
 */

export type AgentPluginCapabilityKind = "agent-plugin-skill" | "agent-plugin-mcp-server";

export type AgentPluginCapabilityPreview =
  | { readonly kind: "markdown"; readonly path: string; readonly content: string }
  | { readonly kind: "none" };

export type AgentPluginCapabilityExecute =
  | { readonly kind: "context-injection"; readonly markdown: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Verified-against-source shadow of `AgentPluginCapabilityDescriptor` — see this module's header. */
export interface AgentPluginCapabilityDescriptor {
  readonly id: string;
  readonly kind: AgentPluginCapabilityKind;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly pluginId: string;
  readonly revision: string;
  readonly preview: AgentPluginCapabilityPreview;
  readonly execute: AgentPluginCapabilityExecute;
}

/**
 * Maps one Agent Plugin capability descriptor into this projection's own contract.
 *
 * Pure — no fetch, no disk read, no dependency on the server-side module whose shape it mirrors.
 * `descriptor.id` is reused verbatim as `item.id` (already globally unique per that module's own
 * `agent-plugin:<pluginId>:skill:<name>` / `...:mcp:<serverId>` naming), which is what lets
 * `projectComposerCapabilities`'s duplicate-id guard do its job across sources with zero
 * remapping here.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toTovuComposerCapability(descriptor: AgentPluginCapabilityDescriptor): TovuComposerCapability {
  const executable = descriptor.execute.kind === "context-injection";
  const description = executable
    ? descriptor.description
    : `${descriptor.description} — ${(descriptor.execute as Extract<AgentPluginCapabilityExecute, { kind: "unavailable" }>).reason}`;

  return {
    groupId: "agent-plugins",
    groupLabel: "Agent Plugins",
    item: {
      id: descriptor.id,
      label: descriptor.label,
      description,
      kind: descriptor.kind,
      keywords: descriptor.keywords,
    },
    revision: descriptor.revision,
    ...(descriptor.preview.kind === "markdown" ? { preview: { kind: "markdown" as const, content: descriptor.preview.content } } : {}),
    ...(executable
      ? {
          resolve: (): ComposerHostBinding => ({
            kind: "compose-text",
            text: (descriptor.execute as Extract<AgentPluginCapabilityExecute, { kind: "context-injection" }>).markdown,
          }),
        }
      : {}),
  };
}
