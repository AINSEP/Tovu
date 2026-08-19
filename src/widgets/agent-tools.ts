/**
 * @file The Widgets agent-tool catalog (SPEC-043, ADR-047) — this domain's instance of the
 * per-domain `agent-tools.ts` convention `forms/agent-tools.ts` and `identity/agent-tools.ts`
 * already use.
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each carries. Every entry maps 1:1 onto a real exported function of
 * `widgets/write-service.ts`, `widgets/region-area-service.ts`, or `widgets/embed-service.ts` (plus
 * two pure reads over `widgets/read-service.ts` and `widgetBindingRepo`) — this catalog never names
 * an operation the domain cannot perform.
 *
 * Precedent already in this repo: ADR-047 §5 (REQ-35/44) ships its OWN bespoke "AI tool surface" as
 * HTTP routes (`server/routes/admin/widgets/agent-tools.ts`: `widgets.place`/`widgets.create`/
 * `widgets.remove`/`widgets.diagnose`), a DIFFERENT delivery mechanism than the ADR-049
 * `tool-registrations.ts` MCP path this catalog wires into. That file's own reasoning — every call
 * maps 1:1 to the SAME domain functions the human admin routes use, gated by the SAME `widgets.*`
 * permission check — is exactly this catalog's discipline too, just delivered through the newer
 * mechanism. Notably, that pre-existing surface deliberately ships NO delete/purge tool at all; this
 * catalog's own exclusion below independently arrives at the same boundary.
 *
 * Deliberate absences (the point of a catalog, not an oversight):
 * - There is NO `widgets_purge_instance`. `purgeWidgetInstance` sets a widget instance's status to
 *   `purged` — a TERMINAL transition with no restore path anywhere in this codebase (unlike `trash`,
 *   which is at least conceptually reversible). Even its non-`force` variant retracts the instance's
 *   own outgoing `entry_refs` as a side effect (see that function's doc comment: "purge is the
 *   permanent step... a config field that used to reference something should stop counting as a
 *   live reference"), which is a durable, cross-domain side effect a trash never performs. Its
 *   `force:true` variant additionally bypasses the REQ-42 still-referenced guard entirely and is
 *   gated behind the separate, narrower `widgets.delete.force` permission — the same escalation
 *   tier split `media.delete`/`media.delete.force` and `admin.menus.delete`/`.delete.force` use.
 *   ADR-047 §5's own hand-designed AI tool surface (see above) independently ships no purge/delete
 *   tool either — treated here as confirming precedent, not a rule this catalog blindly copies.
 * - There is NO widget-type "delete"/"unregister" tool. `widgets/registry.ts`'s
 *   `WIDGET_TYPE_REGISTRATIONS` is core-declared, static data with no admin HTTP surface at all —
 *   wrapping it would invent capability beyond what the human admin UI exposes.
 *
 * What IS included, and why it is safe: `widgets_trash_instance` (`trashWidgetInstance`) is
 * UNCONDITIONAL and non-destructive to data (a status flip only, exactly what a human gets from one
 * click on the admin "trash" button — no additional agent-reachable capability). Region placement
 * and embed mutations (`widgets_set_region_placements`, `widgets_insert_embed`, `widgets_remove_embed`,
 * `widgets_reorder_embeds`) all route through the SAME REQ-16/17/19/20 existence/liveness/recursion/
 * count guardrails a human editor's calls do — nothing here bypasses them.
 *
 * How it relates to the project:
 * `assistant/tool-registrations.ts` maps these entries into `@jini-ai/core` `ToolRegistration`s.
 * Every mutating entry's underlying function calls `requireWidgetPermission` as its own first line
 * (REQ-40/41 — "the SAME check applies whether the caller is a human route or an AI tool route"),
 * so `ToolPolicy.authorize` stays a pass-through exactly as it does for Forms/Identity/content-types
 * (ADR-021 §2 "one evaluator"). The two read tools (`widgets_list_regions`/`widgets_get_region`) have
 * no such service-layer wrapper to delegate to — `regions-list.ts`/`region-get.ts` gate inline via
 * `requireWidgetsPermissionOrRespond` instead — so this catalog's wiring layer performs that same
 * inline `widgets.read` check itself for those two, mirroring the HTTP route exactly.
 *
 * Architectural role:
 * `widgets` domain declaration. Imports only `WidgetTypeKey`/`WIDGET_TYPE_REGISTRATIONS` from its
 * own registry, so the published `widgetType` enum cannot drift from what the domain actually
 * accepts.
 */

import { WIDGET_TYPE_REGISTRATIONS } from "./registry.js";

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export type AgentToolActorClassRule = "confirmer-must-equal-own-delegatedBy" | "user-only" | "none";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one).
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

const WIDGET_TYPE_KEYS = WIDGET_TYPE_REGISTRATIONS.map((registration) => registration.typeKey);

const WIDGET_INSTANCE_ID_SCHEMA = {
  type: "string",
  description: "The widget instance's entry id, as returned by widgets_create_instance or widgets_list_instances.",
} as const;

const HOST_ENTRY_ID_SCHEMA = {
  type: "string",
  description: "The id of the entry (e.g. a page or post) whose rich-text body the embed lives in.",
} as const;

const BASE_VERSION_SCHEMA = {
  type: "integer",
  description: "The entry's current 'version', as last returned by a read or write on it — the optimistic-concurrency guard. A stale value is rejected with a conflict naming the current version.",
} as const;

const REGION_KEY_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "A theme-declared widget region key (e.g. 'header', 'footer', 'sidebar'). Call widgets_list_regions to see which are currently bound.",
} as const;

/** One placement in a region's ordered list, as published to the model. */
const PLACEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["widgetEntryId", "enabled"],
  properties: {
    placementId: {
      type: "string",
      description: "Stable id for this placement slot. Omit when adding a NEW placement — one is minted automatically. Supply an EXISTING placementId (from widgets_get_region) to keep editing the same slot rather than creating a new one.",
    },
    widgetEntryId: WIDGET_INSTANCE_ID_SCHEMA,
    enabled: { type: "boolean", description: "Whether this placement renders. A disabled placement stays in the list but is skipped at render time." },
  },
} as const;

/**
 * The Widgets domain's fixed agent-tool catalog — 12 operations across widget-instance CRUD, region
 * placement, and inline embeds, out of the 13 the admin HTTP surface exposes (see file header for
 * why `purge` is the one exclusion).
 *
 * Ordered read-first, matching `identity/agent-tools.ts`'s convention: a model needs a
 * `widgetInstanceId` before it can update, trash, place, or embed one, and `widgets_list_instances`
 * (or `widgets_create_instance`'s own result) is how it learns one.
 */
export const widgetsAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "widgets_list_instances",
    description:
      "Lists widget instances in the workspace (id, slug, title, status, widgetType, config, version). " +
      "Defaults to active-only; set includeInactive to also see trashed/purged instances. Narrow by widgetType.",
    sideEffects: "none",
    authorization: { permission: "widgets.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        widgetType: { type: "string", enum: WIDGET_TYPE_KEYS, description: "Narrow the list to one widget type. Omit to list every type." },
        includeInactive: { type: "boolean", description: "Include trash/purged instances too. Defaults to false (active-only)." },
      },
    },
  },
  {
    name: "widgets_get_instance",
    description:
      "Reads one widget instance's current state (id, slug, title, status, widgetType, config, version) plus its " +
      "where-used disclosure: every region placement and inline embed currently referencing it.",
    sideEffects: "none",
    authorization: { permission: "widgets.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["widgetInstanceId"],
      properties: { widgetInstanceId: WIDGET_INSTANCE_ID_SCHEMA },
    },
  },
  {
    name: "widgets_list_regions",
    description:
      "Lists every currently-bound widget region (regionKey, the widget_area entry id it fills, and its placement count). " +
      "Only actively-bound regions appear — a region a theme switch orphaned is not listed.",
    sideEffects: "none",
    authorization: { permission: "widgets.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
  {
    name: "widgets_get_region",
    description:
      "Reads one region's full placement list, each entry resolved with the widget's title/type and whether it is " +
      "broken (its target widget is missing, wrong-type, or not active). Use this before widgets_set_region_placements " +
      "to see the current baseVersion and existing placementIds.",
    sideEffects: "none",
    authorization: { permission: "widgets.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["regionKey"],
      properties: { regionKey: REGION_KEY_SCHEMA },
    },
  },
  {
    name: "widgets_create_instance",
    description:
      "Creates a new widget instance of a given type with a validated config bag (validated against that type's own " +
      "registered schema). The instance is NOT placed anywhere by this call — use widgets_set_region_placements or " +
      "widgets_insert_embed afterward to make it appear on the site.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.create" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["widgetType", "title", "config"],
      properties: {
        widgetType: { type: "string", enum: WIDGET_TYPE_KEYS, description: "One of the registered widget types. An unregistered type is rejected." },
        title: { type: "string", minLength: 1, description: "Human-readable instance title, shown in the admin library." },
        config: { type: "object", description: "The type's config bag. Its required shape depends on widgetType — see that type's own registered schema; a rejection names every failing field." },
        slug: { type: "string", description: "Optional stable slug. Auto-derived from title if omitted." },
      },
    },
  },
  {
    name: "widgets_update_instance",
    description: "Replaces an existing widget instance's config bag (re-validated against its type's registered schema). The widgetType itself cannot be changed.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.update" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["widgetInstanceId", "baseVersion", "config"],
      properties: {
        widgetInstanceId: WIDGET_INSTANCE_ID_SCHEMA,
        baseVersion: BASE_VERSION_SCHEMA,
        config: { type: "object", description: "The COMPLETE replacement config bag for this instance's widgetType." },
      },
    },
  },
  {
    name: "widgets_trash_instance",
    description:
      "Trashes a widget instance — a soft, revisioned status flip. UNCONDITIONAL: never blocked by references, even if " +
      "the instance is currently placed somewhere (every referencing placement degrades to a placeholder at render " +
      "time rather than this call being rejected). This is the only delete-adjacent tool in this catalog — there is no " +
      "purge/force-delete tool (see this file's header for why).",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.delete" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["widgetInstanceId"],
      properties: { widgetInstanceId: WIDGET_INSTANCE_ID_SCHEMA },
    },
  },
  {
    name: "widgets_bind_region",
    description:
      "Binds a new region key to a fresh, empty placement list. Idempotent — a region key already bound returns its " +
      "existing area entry rather than creating a duplicate.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.place" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["regionKey"],
      properties: { regionKey: REGION_KEY_SCHEMA },
    },
  },
  {
    name: "widgets_set_region_placements",
    description:
      "Replaces a bound region's WHOLE placement list in one atomic, version-guarded write (never a partial patch). " +
      "Every widgetEntryId referenced must be an existing, active widget instance in this workspace — a nonexistent, " +
      "trashed, or purged target is rejected before anything is written. Call widgets_get_region first to see the " +
      "current baseVersion and existing placements to preserve.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.place" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["regionKey", "baseVersion", "placements"],
      properties: {
        regionKey: REGION_KEY_SCHEMA,
        baseVersion: BASE_VERSION_SCHEMA,
        placements: { type: "array", items: PLACEMENT_SCHEMA, description: "The COMPLETE ordered replacement placement list for this region." },
      },
    },
  },
  {
    name: "widgets_insert_embed",
    description:
      "Inserts one new inline widgetEmbed node, referencing an existing widget instance, appended to the end of a host " +
      "entry's rich-text body. Rejects if the target widget does not exist / is trashed, if the host is itself a " +
      "widget instance (no widget-in-widget recursion), or if the resulting embed count would exceed the per-document " +
      "cap. Returns the newly-minted placementId.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.place" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["hostEntryId", "baseVersion", "widgetEntryId"],
      properties: {
        hostEntryId: HOST_ENTRY_ID_SCHEMA,
        baseVersion: BASE_VERSION_SCHEMA,
        widgetEntryId: WIDGET_INSTANCE_ID_SCHEMA,
      },
    },
  },
  {
    name: "widgets_remove_embed",
    description: "Removes one inline widgetEmbed node (by placementId) from a host entry's body. The referenced widget instance itself is untouched.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.place" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["hostEntryId", "baseVersion", "placementId"],
      properties: {
        hostEntryId: HOST_ENTRY_ID_SCHEMA,
        baseVersion: BASE_VERSION_SCHEMA,
        placementId: { type: "string", description: "The embed placement's id, as returned by widgets_insert_embed or seen in the host entry's body." },
      },
    },
  },
  {
    name: "widgets_reorder_embeds",
    description:
      "Reassigns which widget occupies which EXISTING inline embed slot, in document order. The document's own shape " +
      "(surrounding content, slot count/position) is unchanged — only each slot's target widget changes. Must supply " +
      "exactly one widgetEntryId per embed slot currently present, or the call is rejected before writing anything.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "widgets.place" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["hostEntryId", "baseVersion", "orderedWidgetEntryIds"],
      properties: {
        hostEntryId: HOST_ENTRY_ID_SCHEMA,
        baseVersion: BASE_VERSION_SCHEMA,
        orderedWidgetEntryIds: {
          type: "array",
          items: { type: "string" },
          description: "One widgetEntryId per existing embed slot, in document order. Length must exactly match the current embed count.",
        },
      },
    },
  },
];
