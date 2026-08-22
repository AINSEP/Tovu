/**
 * @file The seam a capability source (today: an installed Agent Plugin's Skills;
 * `features/agent-plugins/capability-source.ts`) registers itself into, so
 * `capability-tool-registrations.ts`'s lazy catalog build can discover every source without
 * importing any of them by name.
 *
 * Modeled directly on `tool-contribution-registry.ts` — same module-level ordered list, same
 * `register*`/`list*`/`reset*ForTests` trio, same "last registration wins, replacing by key rather
 * than appending" semantics for accidental double-registration. See that file's own header for why
 * this shape (not a class, not a DI container) is this codebase's established pattern for "a plugin
 * announces itself to a core-owned seam" — the same reasoning applies here, one seam over: this one
 * is for CONTENT sources (searchable/gettable capability cards), `tool-contribution-registry.ts` is
 * for TOOL sources (native `ToolRegistration`s). They stay two separate registries because a
 * capability source is not itself a tool contributor — it feeds the ONE `capability_search`/
 * `capability_get` pair `capability-tool-registrations.ts` contributes, rather than declaring its
 * own tool ids.
 *
 * `CapabilityCard.handle` is this module's one load-bearing design choice: it is `unknown` on
 * purpose, opaque to everything except the source that produced it (see
 * `capability-catalog-query.ts`'s header for why it must never reach a `capability_search`/
 * `capability_get` response) and never inspected or interpreted here — this registry only ever
 * carries it, exactly like a `ToolRegistration`'s handler is carried but never inspected by
 * `ToolRegistry` itself.
 *
 * Architectural role: in-module registry, no I/O. `assistant/` code (specifically
 * `capability-tool-registrations.ts`) only ever calls `list`/`read` on the `CapabilitySource` object
 * it gets back from {@link listCapabilitySources} — it never imports a registering feature by name,
 * which is what keeps this a one-directional `features/* -> assistant` edge, the same direction
 * every `registerToolContributor` caller already establishes.
 */

/** What a `CapabilitySource`'s `list`/`read` are scoped to. `workspaceId` only, matching
 *  `AssistantToolRegistryDeps`'s own `workspaceId` field — see `capability-tool-registrations.ts`'s
 *  header for why this must be threaded through rather than read from `process.env`. */
export interface CapabilitySourceContext {
  readonly workspaceId: string;
}

/**
 * One discoverable capability, as a source's own `list()` produces it.
 *
 * Discovery-only, deliberately: `id`, `kind`, `pluginId`, `skillName`, `revision`, `name`,
 * `description`, `keywords`, `source`, `handle` — no `execute`/`invoke`/`activate` field of any
 * kind. That absence is the design, not an omission: `AgentPluginCapabilityDescriptor`'s own
 * `execute` is permanently `{ kind: "unavailable", reason }` for every kind this slice's one source
 * produces (`capability-projection.ts`), and it has zero callers today — there is nothing yet for a
 * `capability_search`/`capability_get` pair to invoke, only to describe. A future lifecycle slice
 * that actually runs a capability adds that field then, against real requirements, rather than this
 * slice guessing its shape now.
 *
 * `pluginId`/`skillName`/`revision` are first-class fields, not merely implied by `id`'s own
 * colon-joined structure (`agent-plugin-skill:<pluginId>:<archiveDigest>:<skillName>`) — so a later
 * slice can group or dedupe by `(pluginId, skillName)` without parsing an id string apart.
 */
export interface CapabilityCard {
  readonly id: string;
  /** An unrestricted string, deliberately not an enum — in this type AND in the tools' published
   *  JSON Schema. A closed union here would mean every future source edits this file to add its own
   *  kind, which is exactly the by-name coupling this registry exists to avoid. */
  readonly kind: string;
  readonly pluginId: string;
  readonly skillName: string;
  readonly revision: string;
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  /** The registering source's own {@link CapabilitySource.id}, passed straight through — NOT derived
   *  by splitting `id` on a separator the way `tool-catalog-query.ts`'s `sourceForToolId` does for
   *  tool ids. That function's split-on-first-underscore trick would silently mis-parse a capability
   *  id, which already uses colons as its own internal separator for unrelated fields. */
  readonly source: string;
  /**
   * Opaque to everyone except the source that produced it. In practice, this slice's one source
   * hands back `{ packageRoot, skillPath }` — absolute host paths — for its own later `read()` call
   * to resolve. It travels from here into `capability-catalog-query.ts`'s in-memory index and back
   * out to `capability-tool-registrations.ts`'s `capability_get` handler, entirely inside this
   * process; it must never be serialized into a `capability_search`/`capability_get` response, which
   * is the boundary "never leaves the process" actually means.
   */
  readonly handle: unknown;
}

/**
 * One source of capability cards. `list` is required; `read` and `listFiles` are both optional,
 * since a future source that only lists callable-but-not-readable things (a preview-only MCP
 * server, say) may have nothing to read and nothing to enumerate either.
 */
export interface CapabilitySource {
  readonly id: string;
  list(ctx: CapabilitySourceContext): Promise<readonly CapabilityCard[]>;
  /** Resolves one previously-listed card's `handle` into its real content (markdown today).
   *  Omitted entirely — not merely throwing — by a source with nothing readable to give back. */
  read?(handle: unknown, ctx: CapabilitySourceContext): Promise<string>;
  /**
   * Resolves one previously-listed card's `handle` into the absolute paths of every OTHER file in
   * its installed package — everything besides the content `read()` already returns — so a caller
   * (`capability_get`) can hand them straight to the model instead of the model having to `grep`/
   * `find` its way to them (the gap `resolve-agent-plugin-refs.ts`'s `inject` delivery already
   * closes for its own run-start prefix; this is the same inventory for the pointer-delivery /
   * `capability_get` path). Omitted entirely — not merely returning an empty array — by a source
   * with no such inventory to give back, mirroring `read?`'s own "omitted, not throwing" convention
   * above: an omitted method and an empty result mean different things to a caller, and only the
   * source itself knows which is true.
   */
  listFiles?(handle: unknown, ctx: CapabilitySourceContext): Promise<readonly string[]>;
}

let sources: CapabilitySource[] = [];

/**
 * Registers one capability source. Re-registering the same `id` REPLACES the earlier entry rather
 * than appending — mirrors `registerToolContributor`'s identical reasoning: a double import of the
 * same feature module should not silently double-count that source's cards in the final catalog,
 * and replacing in place (rather than throwing) keeps this call idempotent per catalog instance.
 * Registration order is otherwise preserved so a replacement does not silently reorder sources.
 */
export function registerCapabilitySource(source: CapabilitySource): void {
  const existing = sources.findIndex((candidate) => candidate.id === source.id);
  if (existing >= 0) {
    sources[existing] = source;
    return;
  }
  sources.push(source);
}

/** Every capability source registered so far, in registration order. */
export function listCapabilitySources(): readonly CapabilitySource[] {
  return sources;
}

/** Test-only reset of the module-level registry (mirrors `resetToolContributorsForTests`). A test
 *  that builds a catalog from a clean slate must call this before registering just the sources it
 *  wants present — otherwise sources registered by an earlier test in the same process persist,
 *  since this is ordinary module-level state. */
export function resetCapabilitySourcesForTests(): void {
  sources = [];
}
