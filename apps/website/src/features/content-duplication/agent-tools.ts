/**
 * @file The `content-duplication` domain's agent-tool catalog — ONE tool, `content_duplicate`,
 * generic over a `resource` parameter rather than one bespoke `*_duplicate` tool per resource.
 *
 * Owner's explicit design correction (`ADS-memory/reports/2026-09-07-page-tool-gap.md`'s follow-up,
 * her own words): *"if we had, like, a copy tool and then we could pass arguments to copy a post,
 * copy a media provider, copy a form… We're not collapsing a bunch of tools into one thing. We are
 * having, like, a category of a tool and then having it flexible enough to do multiple things, like
 * copying different things."* The transpose of merging verbs-per-entity (which the coverage audit's
 * `comments_*` finding correctly flags as a bad merge — different VERBS sharing one permission):
 * this is ONE verb (`duplicate`) generic over resource, with permission resolved PER resource, never
 * a single flat permission for the whole tool. See `tool-registrations.ts`'s own header for how.
 *
 * `resource` is deliberately NOT a closed enum here: the set of duplicable resources grows as more
 * features register into `assistant/duplicate-resource-registry.ts` (today: `post`, `page`; the
 * coverage audit named `collections/entries`, `media`, `redirects`, `widgets`, `forms`,
 * `taxonomy terms`, and `menus` as the same gap, not yet wired). A static JSON-Schema enum authored
 * once at module load could not reflect a registry populated at boot, so an unsupported `resource`
 * is instead rejected at CALL time with the live, enumerated list of what IS supported — see
 * `tool-registrations.ts`'s handler.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "deletes-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const contentDuplicationAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "content_duplicate",
    description:
      "Creates a copy of an existing resource — a post, a page, and (as more resource types are wired) other " +
      "content this workspace holds. The tool for 'copy X and name it Y', 'duplicate this page', or 'use this as a " +
      "starting point for a new one'. One atomic call: reads the source, then creates a new one with a fresh id, " +
      "never touching the source. " +
      "resource names WHICH kind of thing to copy — currently 'post' or 'page'. An unrecognized resource is " +
      "rejected with the exact list of resources this workspace currently supports; if what you need is not on " +
      "that list, this tool cannot copy it yet. " +
      "id is the source resource's own id (for post/page, as returned by content_post_list/content_post_get). " +
      "overrides carries optional fields for the copy — title, slug, status — not every resource type honors " +
      "every field. For post/page: title defaults to 'Copy of <source title>'; slug defaults to a fresh one " +
      "derived from that title; status ALWAYS defaults to 'draft' even when the source is published — a copy " +
      "must never silently go live unless you explicitly override it. " +
      "Permission to duplicate is resolved from the RESOURCE you named, not one flat grant for this whole tool: " +
      "being able to copy a post does not by itself mean you can copy a resource of a different type. " +
      "Each resource type's own detailed behavior (for post/page: widget-embed handling, bespoke-HTML pages) is " +
      "owned by that resource's own domain — see content_post_* for the full detail on post/page specifically.",
    sideEffects: "mutates-durable-state",
    // Declaration only, and DELIBERATELY not a real permission name: this tool spans multiple
    // resources, each with its OWN declared permission (content.write for post/page today), resolved
    // and enforced per call by the handler — see tool-registrations.ts's own header for why a single
    // flat permission here would be actively wrong for a cross-resource tool. `buildDomainRegistrations`
    // never evaluates this field as a real gate (it always sets `policy.authorize` to a pass-through
    // and leaves enforcement to the handler) — same "declaration only" contract `pages_write_html`'s
    // own catalog entry already documents.
    authorization: { permission: "resolved-per-resource" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["resource", "id"],
      properties: {
        resource: {
          type: "string",
          minLength: 1,
          description:
            "Which kind of thing to copy, e.g. 'post' or 'page'. An unrecognized value is rejected, naming every " +
            "resource this workspace currently supports.",
        },
        id: { type: "string", minLength: 1, description: "The source resource's own id." },
        overrides: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "Optional. Defaults to 'Copy of <source title>' for post/page." },
            slug: { type: "string", description: "Optional. Defaults to a fresh one derived from the (possibly defaulted) title, for post/page." },
            status: { type: "string", enum: ["draft", "published"], description: "Optional. Defaults to 'draft' for post/page, regardless of the source's own status." },
          },
          description: "Optional resource-specific overrides for the copy. Omit for the resource's own defaults.",
        },
      },
    },
  },
];
