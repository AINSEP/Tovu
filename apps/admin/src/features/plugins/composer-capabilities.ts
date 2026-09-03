import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from "@jini-ai/chat/react";

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
 * No third kind exists. `/mcp`'s settings-navigation macro is untouched by this module — it stays
 * exactly as it was (`resolveTovuComposerDiscoveryRoute`, `AssistantDock.tsx`'s own
 * `resolveTovuComposerDiscoveryRoute(...)` check), because it is client-local navigation, not
 * agent- or tool-mediated, and was never part of what this union needed to describe.
 */

/**
 * The two verified execution shapes a composer capability may resolve to. Never inspected by
 * `@jini-ai/chat` — `ComposerDiscoveryItem.command`/`argument`/`needsConfirmation` are the only
 * package-visible fields, all presence-only. This union, and the decision of which kind a given
 * capability uses, live entirely on the host side of that boundary.
 */
export type ComposerHostBinding =
  | {
      readonly kind: "compose-text";
      /** Verbatim replacement for the draft; the user reviews and sends it like any other message. */
      readonly text: string;
    }
  | {
      /**
       * NOT wired to any capability in the bundled catalog today — building the mechanism does
       * not decide policy. Which tool ids may be reached this way is
       * `MCP_UI_REDEEMABLE_TOOL_IDS`'s own operator-owned allowlist
       * (`src/assistant/mcp-ui-tool-calls.ts`); adding one is an explicit owner decision.
       */
      readonly kind: "allowlisted-tool-call";
      readonly toolName: string;
      readonly params: Readonly<Record<string, unknown>>;
    };

/**
 * A previewable capability's content, carried through the projection ahead of any UI that renders
 * it. Added reconciling the Agent Plugins adapter's candidate descriptor shape
 * (`src/features/agent-plugins/capability-projection.ts`'s `AgentPluginCapabilityPreview`) — a
 * Skill's real markdown is genuinely previewable data today, even though `AssistantDock` has no
 * preview surface yet to show it in (debate 3's "previewable but structurally inert" applies to
 * execution, not to whether the data exists to preview).
 */
export interface TovuComposerCapabilityPreview {
  readonly kind: "markdown";
  readonly content: string;
}

/**
 * One capability the composer can discover, paired with how to resolve a selection of it into an
 * effect. `resolve` is omitted for an item with no execution beyond its own `insertText`/`label`
 * macro, an existing client-local route (e.g. `/mcp`), or a source-level decision that the item is
 * structurally inert (see `agent-plugin-capability-adapter.ts`'s handling of an MCP-server
 * descriptor's `execute: { kind: "unavailable" }`) — selecting such an item resolves to `undefined`
 * through `resolveComposerDiscoveryOutcome`, a documented no-op, not a silent bug.
 *
 * `resolve` receives the invocation's `argument` exactly as `ComposerDiscoverySelection` carries
 * it (`undefined` for a plain item, `null` | `""` | the typed text for a `command`-bearing one) so
 * a binding can be built from what the composer actually resolved, not a pre-computed guess.
 */
export interface TovuComposerCapability {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly item: ComposerDiscoveryItem;
  readonly resolve?: (argument: string | null | undefined) => ComposerHostBinding;
  /** See {@link TovuComposerCapabilityPreview}. Absent for a capability with nothing to preview. */
  readonly preview?: TovuComposerCapabilityPreview;
  /**
   * A source-specific cache/invalidation key — e.g. an Agent Plugin's content digest
   * (`AgentPluginCapabilityDescriptor.revision`, "a projection consumer's natural cache/
   * invalidation key" per that module's own doc). Unused by `projectComposerCapabilities` today;
   * carried through so a future source doesn't need a second contract change to add one.
   */
  readonly revision?: string;
  /**
   * When set, selecting this capability pins a removable chip to the composer instead of doing
   * anything to the draft — added 2026-08-21 so the "UI/UX Design (Agent Plugin)" row actually
   * reaches the agent (previously `insertText` typed an inert label string into the draft; the
   * agent had no way to tell that apart from the user having typed the same words themselves).
   * The value is the installed Agent Plugin's own `plugin.json` `name` (e.g. `"ui-ux-design"`),
   * carried opaque through `AssistantDock`'s composer state, `onSend`'s `contextRef.pluginRefIds`,
   * and finally resolved against the on-disk package by `agent-daemon-server.ts`'s `onStarted` —
   * see that function's own doc for the resolution/failure rules. Never combined with `resolve` in
   * the bundled catalog today (a capability either composes text/calls a tool, or pins a plugin
   * ref), but the two fields are not mutually exclusive by type — a future capability could
   * plausibly want a compose-text default AND a pinnable chip.
   */
  readonly pluginRefId?: string;
}

/**
 * One contributor to the projected catalog. `list()` is async because the real registry this
 * mirrors (`src/assistant/tool-registrations.ts`) is server-side — ~21 domain modules assembled
 * once at daemon boot, never importable into the browser bundle (per `AssistantDock.tsx`'s own
 * module doc). Today's only source (`createBundledComposerCapabilitySource`) is synchronous,
 * compile-time-known data wrapped in a resolved Promise — genuinely async-shaped, not a stub, and
 * the exact seam a future live source (a tool-registry-backed fetch, or the Agent Plugins adapter
 * a separate workstream is building against this same contract) plugs into without this module or
 * `AssistantDock.tsx` changing shape.
 */
export interface ComposerCapabilitySource {
  readonly id: string;
  list(): Promise<readonly TovuComposerCapability[]>;
}

export interface ComposerCapabilityProjection {
  readonly groups: readonly ComposerDiscoveryGroup[];
  /** Keyed by `ComposerDiscoveryItem.id` — what `AssistantDock`'s `onDiscoverySelect` looks a selection up in. */
  readonly byItemId: ReadonlyMap<string, TovuComposerCapability>;
  /**
   * Keyed by `TovuComposerCapability.pluginRefId` — what `AssistantDock.tsx`'s chip tray looks a
   * pinned ref back up in, to render the capability's own `label` on the chip rather than a bare
   * id. Only capabilities that set `pluginRefId` are indexed here; most never do.
   */
  readonly byPluginRefId: ReadonlyMap<string, TovuComposerCapability>;
}

const EMPTY_PROJECTION: ComposerCapabilityProjection = { groups: [], byItemId: new Map(), byPluginRefId: new Map() };

/** The projection an as-yet-unresolved source set renders as: no groups, nothing selectable. */
export function emptyComposerCapabilityProjection(): ComposerCapabilityProjection {
  return EMPTY_PROJECTION;
}

/**
 * Fails closed on a duplicate item id, across sources or within one — the same hazard
 * `buildAssistantToolRegistrations` (`src/assistant/tool-registrations.ts`) already refuses for
 * the equivalent collision in the real tool registry. A silent second binding for the same id
 * would make selecting it non-deterministic depending on source order. Split out of
 * {@link projectComposerCapabilities}'s loop body purely to keep that function's own cognitive
 * complexity under the gate — same behavior, same error text, one less level of loop-nested `if`.
 */
function registerItemId(
  byItemId: Map<string, TovuComposerCapability>,
  capability: TovuComposerCapability,
): void {
  const existing = byItemId.get(capability.item.id);
  if (existing) {
    throw new Error(
      `composer-capabilities: duplicate discovery item id "${capability.item.id}" ` +
        `(groups "${existing.groupId}" and "${capability.groupId}")`,
    );
  }
  byItemId.set(capability.item.id, capability);
}

/**
 * Same "fail closed on a collision" posture as {@link registerItemId} — a silent second
 * capability claiming the same plugin ref would make the chip tray's label lookup
 * non-deterministic depending on source order, which is the exact hazard that guard already
 * exists to prevent for item ids. No-op for a capability that never sets `pluginRefId` (most
 * don't) — see {@link TovuComposerCapability.pluginRefId}'s own doc.
 */
function registerPluginRef(
  byPluginRefId: Map<string, TovuComposerCapability>,
  capability: TovuComposerCapability,
): void {
  if (!capability.pluginRefId) return;
  const existingByRef = byPluginRefId.get(capability.pluginRefId);
  if (existingByRef) {
    throw new Error(
      `composer-capabilities: duplicate pluginRefId "${capability.pluginRefId}" ` +
        `(items "${existingByRef.item.id}" and "${capability.item.id}")`,
    );
  }
  byPluginRefId.set(capability.pluginRefId, capability);
}

/** The capability's group, creating and ordering it on first sight — same behavior as the
 *  inlined `let group = ...; if (!group) {...}` this replaces, extracted for the same
 *  complexity-budget reason as {@link registerItemId}/{@link registerPluginRef}. */
function getOrCreateGroup(
  itemsByGroup: Map<string, { label: string; items: ComposerDiscoveryItem[] }>,
  groupOrder: string[],
  capability: TovuComposerCapability,
): { label: string; items: ComposerDiscoveryItem[] } {
  let group = itemsByGroup.get(capability.groupId);
  if (!group) {
    group = { label: capability.groupLabel, items: [] };
    itemsByGroup.set(capability.groupId, group);
    groupOrder.push(capability.groupId);
  }
  return group;
}

/**
 * Composes every source's capabilities into one grouped catalog plus a selection-lookup index.
 *
 * @complexity O(n) in the total capability count across all sources.
 * @overallScore 100
 */
export async function projectComposerCapabilities(
  sources: readonly ComposerCapabilitySource[],
): Promise<ComposerCapabilityProjection> {
  const bySource = await Promise.all(sources.map((source) => source.list()));
  const capabilities = bySource.flat();

  const groupOrder: string[] = [];
  const itemsByGroup = new Map<string, { label: string; items: ComposerDiscoveryItem[] }>();
  const byItemId = new Map<string, TovuComposerCapability>();
  const byPluginRefId = new Map<string, TovuComposerCapability>();

  for (const capability of capabilities) {
    registerItemId(byItemId, capability);
    registerPluginRef(byPluginRefId, capability);
    const group = getOrCreateGroup(itemsByGroup, groupOrder, capability);
    group.items.push(capability.item);
  }

  return {
    groups: groupOrder.map((id) => ({ id, label: itemsByGroup.get(id)!.label, items: itemsByGroup.get(id)!.items })),
    byItemId,
    byPluginRefId,
  };
}

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
    groupId: "skills",
    groupLabel: "Skills / Design toolbox",
    item: {
      id: "skill:ui-ux-design",
      // See the matching comment on "agent-plugin:ui-ux-design" above.
      label: "UI/UX Design (Skill)",
      description: "Portable skill from the ui-ux-design Agent Plugin",
      kind: "skill",
      keywords: ["skill", "design", "ui", "ux"],
      insertText: "UI/UX Design skill",
    },
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
    resolve: (argument) => ({
      kind: "allowlisted-tool-call",
      toolName: "content_post_search",
      params: { query: argument ?? "" },
    }),
  },
];

/** Resolves only actions backed by an existing Tovu route; inventory rows never carry functions. */
export function resolveTovuComposerDiscoveryRoute(itemId: string): string | null {
  return itemId === "mcp:settings" ? "/settings?tab=external-mcp" : null;
}

export function createBundledComposerCapabilitySource(): ComposerCapabilitySource {
  return {
    id: "bundled",
    list: async () => BUNDLED_CAPABILITIES,
  };
}
