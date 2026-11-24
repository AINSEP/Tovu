import type { ComposerCapability as TovuComposerCapability, ComposerCapabilitySource } from "@jini-ai/admin/screens/plugins/composer-capabilities";

/**
 * @file The Tovu (host) half of debate 2's projection
 * ("Composer slash commands", ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md
 * §2): the package (`@jini-ai/chat`) owns mechanism — trigger grammar, filtering, keyboard, ARIA —
 * and never learns a host taxonomy (`slots.ts:77-80`'s written law: `kind` is filtered/rendered,
 * never switched on). This module is the other half: it owns EFFECT.
 *
 * `ComposerHostBinding` names the only two execution shapes verified against source, not assumed:
 *
 * - `compose-text` — writes agent-directed instruction text into the draft for the user to review
 *   and send. This is the ONLY execution path available to a tool that runs through the spawned
 *   agent CLI: `AssistantDock.tsx`'s own module doc states "Tool execution is not a prop here — it
 *   happens server-side... through the daemon's `/api/delegated-tool-calls` gate," and that path's
 *   only legitimate caller is the run's own spawned `jini-mcp` subprocess
 *   (`src/assistant/agent-daemon-server.ts`'s `DELEGATED_TOOL_CALLS_PATH` exemption comment) — the
 *   browser cannot call it directly.
 * - `allowlisted-tool-call` — POSTs to `/api/admin/v1/mcp-ui/tool-calls` through the same
 *   `McpUiToolCallHandler` `AssistantDock.tsx` already instantiates for MCP-UI surface rendering
 *   (`createMcpUiToolCaller`, `@jini-ai/chat/react`'s `create-mcp-ui-tool-caller.ts`). That route
 *   is genuinely browser-callable — session-authenticated, same-origin, reached through Tovu's own
 *   admin proxy — but gated by a per-tool allowlist (`src/assistant/mcp-ui-tool-calls.ts`'s
 *   `MCP_UI_REDEEMABLE_TOOL_IDS`, currently just `content_post_delete` plus a dev-only demo tool).
 *   A capability using this binding gets `TOOL_NOT_ALLOWLISTED` (403) until an operator decision
 *   adds its tool id to that set — a decision this module deliberately does not make (see the
 *   binding's own doc below).
 *
 * `installed-skill` pins current guidance as context and adds it only to the dispatched prompt. `/mcp`'s settings-navigation macro is untouched by this module — it stays
 * exactly as it was (`resolveTovuComposerDiscoveryRoute`, `AssistantDock.tsx`'s own
 * `resolveTovuComposerDiscoveryRoute(...)` check), because it is client-local navigation, not
 * agent- or tool-mediated, and was never part of what this union needed to describe.
 */

/**
 * Today's five bundled entries. The first four are byte-identical content to the array this
 * replaces (`TOVU_COMPOSER_DISCOVERY_GROUPS`, pre-2026-08-12), now flowing through the async
 * `ComposerCapabilitySource` contract instead of a static import — genuinely compile-time-known
 * data, so a trivially-resolved source is correct here, not a stand-in for a real one. The fifth,
 * `/search`, is this dispatch's own addition: the first capability to actually use the
 * `allowlisted-tool-call` binding kind against a real, wired tool (`content_post_search`) rather
 * than a synthetic test fixture — see `mcp-ui-tool-calls.ts`'s allowlist entry for that tool's own
 * justification.
 */
const BUNDLED_CAPABILITIES: readonly TovuComposerCapability[] = [
  {
    groupId: "regular-plugins",
    groupLabel: "Plugins",
    item: {
      id: "regular-plugin:word-count",
      label: "Word Count",
      description: "Built-in Tovu plugin",
      kind: "plugin",
      keywords: ["plugin", "content"],
      insertText: "Word Count plugin",
    },
  },
  {
    groupId: "agent-plugins",
    groupLabel: "Agent Plugins",
    item: {
      id: "agent-plugin:ui-ux-design",
      // Suffixed to disambiguate from the "skills" group's identically-named entry below — the
      // composer menu renders label only (description is a hover/focus tooltip, invisible at
      // scan time; see ComposerDiscovery.tsx's own doc), so two bare "UI/UX Design" rows were
      // indistinguishable by sight.
      label: "UI/UX Design (Agent Plugin)",
      description: "UI/UX Design Agent Plugin bundled with Tovu — pins its skill as context for the agent",
      kind: "agent-plugin",
      keywords: ["agent plugin", "design", "ui", "ux"],
      // Slash-command entry point (2026-08-23): lets the composer's own `command` grammar
      // (`composer-discovery.ts`'s `matchesLockedCommand`/`resolveComposerSlashInvocation`) match
      // the literal, id-shaped `/ui-ux-design` the way `/search` and `/mcp` already do — before
      // this, typing that exact hyphenated string produced zero fuzzy matches (the label/keywords
      // above use spaces and slashes, never hyphens), so the one string an operator is most likely
      // to type for "the ui-ux-design plugin" silently fell through to a literal chat message. No
      // `argument`: selecting this item (Enter/Tab/click) invokes immediately once the typed word
      // matches, same as any other no-argument command.
      command: "ui-ux-design",
      // `insertText: ""` (fixed 2026-08-21), not omitted: Composer.tsx has two selection paths and
      // they read a missing `insertText` differently. The "+" menu path (`selectPlusItem`) guards
      // on `item.insertText ? ... : composer.draft` — falsy either way, draft untouched, which is
      // why omitting it looked correct there. But the SLASH-trigger path (`selectSlashItem`) calls
      // `replaceComposerSlashTrigger(draft, match.item.insertText ?? match.item.label)` — an absent
      // `insertText` falls back to `label`, typing the literal "UI/UX Design (Agent Plugin)" into
      // the draft. Same precedent as `mcp:settings` below: an explicit `""` clears the slash
      // trigger to an empty draft (`replaceComposerSlashTrigger` returns its second arg verbatim)
      // while staying falsy for the "+" path's guard, so both paths leave the draft empty. The
      // real effect is `pluginRefId` below, not the draft text.
      insertText: "",
    },
    pluginRefId: "ui-ux-design",
  },
  {
    groupId: "mcp",
    groupLabel: "MCP",
    item: {
      id: "mcp:settings",
      label: "/mcp",
      description: "Open Tovu's existing External MCP settings",
      kind: "mcp",
      keywords: ["mcp", "server", "tools", "settings"],
      insertText: "",
    },
  },
  {
    groupId: "tools",
    groupLabel: "Tools",
    item: {
      id: "tool:content-search",
      label: "/search",
      description: "Search this workspace's posts and pages by title, slug, and body text",
      kind: "tool",
      keywords: ["search", "find", "content", "posts", "pages"],
      // Argument-aware grammar (Jini's `composer-discovery.ts`, 2026-08-12): `/search <terms>`
      // completes the trigger until a separator plus non-blank text is typed, then invokes with
      // that text as `argument` — see `resolveComposerSlashInvocation`'s own doc for the exact
      // state machine. `required: true` means `resolve` below is never reached with a blank
      // argument through the real composer; the `?? ""` fallback exists only for a caller (e.g. a
      // unit test) that invokes `resolve` directly, bypassing that grammar.
      command: "search",
      argument: { placeholder: "search terms", required: true },
      // No `needsConfirmation`: unlike a capability that could mutate or destroy something,
      // `content_post_search` is read-only (`postDerivedRisk` classifies it "none" — see
      // `mcp-ui-tool-calls.ts`'s allowlist entry) and executes immediately on selection with no
      // further review step. Setting this flag would assert a safety gate that does not exist
      // for this tool — Jini renders it only as a cue and never enforces it itself
      // (`ComposerDiscoveryItem.needsConfirmation`'s own doc), so a false claim here would be
      // exactly the "declares a confirmation it doesn't get" trap: worse than declaring none.
    },
    // Immediate, browser-only execution — no agent turn. `argument` is the composer's already-
    // grammar-validated search text; `content_post_search`'s own schema requires `query` non-empty,
    // which the composer's `required: true` argument already guarantees before `resolve` is called
    // for real (see the item's own doc above).
    resolve: ({ argument }, _optional = {}) => ({
      kind: "allowlisted-tool-call",
      toolName: "content_post_search",
      params: { query: argument ?? "" },
    }),
  },
];

/** Resolves only actions backed by an existing Tovu route; inventory rows never carry functions. */
export function resolveTovuComposerDiscoveryRoute({ itemId }: { itemId: string }, _optional = {}): string | null {
  return itemId === "mcp:settings" ? "/settings?tab=external-mcp" : null;
}

export function createBundledComposerCapabilitySource(): ComposerCapabilitySource {
  return {
    id: "bundled",
    list: async () => BUNDLED_CAPABILITIES,
  };
}
