import { OG_TYPE_VALUES, STRING_FIELD_MAX_LENGTH, TWITTER_CARD_VALUES, URL_FIELD_MAX_LENGTH } from "./write-service";
import {
  DEFAULT_DESCRIPTION_MAX_LENGTH,
  DEFAULT_OG_IMAGE_MAX_LENGTH,
  MAX_ROBOTS_RULES,
  MAX_RULE_PATH_ENTRIES,
  TITLE_TEMPLATE_MAX_LENGTH,
} from "./settings";

/**
 * @file The SEO domain's agent-tool catalog, instantiating SPEC-016 REQ-22's naming/callability
 * convention (the same shape `features/workspace/agent-tools.ts`, `newsletter/agent-tools.ts`, and
 * every other domain catalog already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes. Every
 * entry maps 1:1 onto a real admin HTTP route already exposed to a human operator
 * (`server/routes/admin/seo/*.ts`) — this catalog never names an operation the admin UI does not
 * already perform.
 *
 * All 6 admin SEO routes are wired; there is no deliberate exclusion in this domain (unlike
 * Workspace/Settings/Recovery, which each withhold at least one entry). Read the full route
 * surface first: `get-entry.ts`/`get-entry-analyze.ts` (reads), `put-entry.ts` (per-entry override
 * write), `get-settings.ts`/`put-settings.ts` (site-wide settings read/write), and
 * `post-sitemap-regenerate.ts` (forces a sitemap cache rebuild). None of the 6 is bulk (each call
 * targets exactly one entry or the single workspace-level settings row — the same "narrow, single-
 * row write" class as `workspace_update`), none is irreversible (`seo_set_entry_overrides` can
 * always be re-called to change or clear a field; `seo_set_settings` is likewise a re-appliable
 * patch; `seo_regenerate_sitemap` only recomputes a cache from already-durable data, it cannot lose
 * anything), and none is credential-adjacent. So every entry is wired.
 *
 * `seo_regenerate_sitemap`'s `sideEffects` is declared `'mutates-durable-state'` even though
 * `sitemap.ts`'s cache is an in-process `Map`, not a SQL row: `regenerateSitemapCache` forces a
 * real, observable state transition — the next public `/sitemap.xml`/`/robots.txt` read reflects
 * the recomputed entries — so classifying it `'none'` (as a pure read) would understate what the
 * tool actually does. `'mutates-durable-state'` is the closest of this catalog's 3-value vocabulary
 * to "has a real, persisted-for-the-process-lifetime effect other reads depend on," which is a
 * closer match than either `'none'` or `'mints-token'`.
 *
 * `seo_set_entry_overrides` and `seo_set_settings` publish JSON Schemas built from the SAME
 * exported constants (`STRING_FIELD_MAX_LENGTH`/`URL_FIELD_MAX_LENGTH`/`OG_TYPE_VALUES`/
 * `TWITTER_CARD_VALUES` from `write-service.ts`; `TITLE_TEMPLATE_MAX_LENGTH`/
 * `DEFAULT_DESCRIPTION_MAX_LENGTH`/`DEFAULT_OG_IMAGE_MAX_LENGTH`/`MAX_ROBOTS_RULES`/
 * `MAX_RULE_PATH_ENTRIES` from `settings.ts`) their respective chokepoints (`setEntrySeoOverrides`/
 * `setSeoSettings`) actually validate against — those constants were previously module-private;
 * this dispatch adds `export` to each (no value changes) so the published schema cannot silently
 * drift from the validator, the same discipline `newsletter/agent-tools.ts` uses for
 * `campaign-write-service.ts`'s `SUBJECT_MAX`/`SUBJECT_MIN`/`PREHEADER_MAX`.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `seo` domain logic. Imports only the constants its own domain already enforces (`write-service.ts`/
 * `settings.ts`), so the published JSON Schemas cannot drift from the single sources of those
 * values, rather than restating either.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registration-kit.ts`'s `buildDomainRegistrations`, which refuses to wire any
   * tool lacking one). Every entry in this catalog is wired, so this is required, not optional —
   * mirrors `identity/agent-tools.ts`'s identical reasoning.
   */
  inputSchema: Readonly<Record<string, unknown>>;
}

/** No arguments. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

const ENTRY_ID_PROPERTY = {
  type: "string",
  minLength: 1,
  description: "The entry's id (a post or page), as returned by other tools that list or return entries.",
} as const;

const ENTRY_ID_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entryId"],
  properties: { entryId: ENTRY_ID_PROPERTY },
} as const;

/** Shared by every `SeoExtFields` string field this catalog publishes. */
const SEO_STRING_FIELD = {
  type: "string",
  maxLength: STRING_FIELD_MAX_LENGTH,
  description: `Optional override. At most ${STRING_FIELD_MAX_LENGTH} characters. Omit to leave the existing override (if any) unchanged.`,
} as const;

/** Shared by every `SeoExtFields` URL/media-ref field this catalog publishes. */
const SEO_URL_FIELD = {
  type: "string",
  maxLength: URL_FIELD_MAX_LENGTH,
  description: `Optional override. At most ${URL_FIELD_MAX_LENGTH} characters. Omit to leave the existing override (if any) unchanged.`,
} as const;

/** `seo_set_entry_overrides`'s input — a partial patch onto `SeoExtFields`, mirroring `put-entry.ts`'s
 * request body field-for-field. `entryId` is the one required field; every other key is an optional
 * per-field override, merged onto the entry's existing overrides (omitted keys are left unchanged —
 * this is a PATCH, not a full replace, matching `setEntrySeoOverrides`'s own merge semantics). */
const SET_ENTRY_OVERRIDES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entryId"],
  properties: {
    entryId: ENTRY_ID_PROPERTY,
    title: { ...SEO_STRING_FIELD, description: `Meta title override. ${SEO_STRING_FIELD.description}` },
    description: { ...SEO_STRING_FIELD, description: `Meta description override. ${SEO_STRING_FIELD.description}` },
    canonical: { ...SEO_URL_FIELD, description: `Canonical URL override (absolute). ${SEO_URL_FIELD.description}` },
    noindex: { type: "boolean", description: "Set true to exclude this entry from indexing (emits robots:noindex and drops it from the sitemap)." },
    nofollow: { type: "boolean", description: "Set true to emit robots:nofollow for this entry." },
    schemaType: { ...SEO_STRING_FIELD, description: `JSON-LD schema.org @type override. ${SEO_STRING_FIELD.description}` },
    ogTitle: { ...SEO_STRING_FIELD, description: `OpenGraph title override. ${SEO_STRING_FIELD.description}` },
    ogDescription: { ...SEO_STRING_FIELD, description: `OpenGraph description override. ${SEO_STRING_FIELD.description}` },
    ogImage: { ...SEO_URL_FIELD, description: `OpenGraph image override (media ref or absolute URL). ${SEO_URL_FIELD.description}` },
    ogType: { type: "string", enum: [...OG_TYPE_VALUES], description: `OpenGraph type override. One of ${OG_TYPE_VALUES.join(", ")}.` },
    twitterTitle: { ...SEO_STRING_FIELD, description: `Twitter/X card title override. ${SEO_STRING_FIELD.description}` },
    twitterDescription: { ...SEO_STRING_FIELD, description: `Twitter/X card description override. ${SEO_STRING_FIELD.description}` },
    twitterImage: { ...SEO_URL_FIELD, description: `Twitter/X card image override (media ref or absolute URL). ${SEO_URL_FIELD.description}` },
    twitterCard: { type: "string", enum: [...TWITTER_CARD_VALUES], description: `Twitter/X card kind override. One of ${TWITTER_CARD_VALUES.join(", ")}.` },
  },
} as const;

/** `seo_set_settings`'s input — a partial patch onto the workspace-level `SeoSettings`, mirroring
 * `put-settings.ts`'s request body field-for-field. Every field is optional (all-or-nothing
 * validation happens inside `setSeoSettings` itself; omitted fields are left unchanged). */
const SET_SETTINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    titleTemplate: {
      type: "string",
      maxLength: TITLE_TEMPLATE_MAX_LENGTH,
      description: `Title template applied to every entry without its own title override. MUST contain '%s' at least once (the per-page title is substituted there). At most ${TITLE_TEMPLATE_MAX_LENGTH} characters.`,
    },
    defaultDescription: {
      type: ["string", "null"],
      maxLength: DEFAULT_DESCRIPTION_MAX_LENGTH,
      description: `Site-wide default meta description, used when an entry has neither its own override nor a derivable excerpt. At most ${DEFAULT_DESCRIPTION_MAX_LENGTH} characters. Pass null to clear.`,
    },
    defaultOgImage: {
      type: ["string", "null"],
      maxLength: DEFAULT_OG_IMAGE_MAX_LENGTH,
      description: `Site-wide default OpenGraph/Twitter image (media ref or absolute URL). At most ${DEFAULT_OG_IMAGE_MAX_LENGTH} characters. Pass null to clear.`,
    },
    twitterSite: {
      type: ["string", "null"],
      description: "Site-wide @handle attributed as the Twitter/X card's site. Pass null to clear.",
    },
    defaultRobots: {
      type: "object",
      additionalProperties: false,
      required: ["noindex", "nofollow"],
      description: "Site-wide default robots directive, used when an entry has no per-entry noindex/nofollow override.",
      properties: {
        noindex: { type: "boolean" },
        nofollow: { type: "boolean" },
      },
    },
    sitemapEnabled: { type: "boolean", description: "Whether the sitemap is advertised in robots.txt at all." },
    robotsRules: {
      type: "array",
      maxItems: MAX_ROBOTS_RULES,
      description: `Custom robots.txt rules, one per user agent. At most ${MAX_ROBOTS_RULES} rules.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["userAgent"],
        properties: {
          userAgent: { type: "string", minLength: 1, description: "The user agent this rule targets, e.g. '*' or 'Googlebot'." },
          allow: { type: "array", maxItems: MAX_RULE_PATH_ENTRIES, items: { type: "string" }, description: `Allowed path prefixes. At most ${MAX_RULE_PATH_ENTRIES} entries.` },
          disallow: { type: "array", maxItems: MAX_RULE_PATH_ENTRIES, items: { type: "string" }, description: `Disallowed path prefixes. At most ${MAX_RULE_PATH_ENTRIES} entries.` },
        },
      },
    },
  },
} as const;

/**
 * The SEO domain's fixed agent-tool catalog (SPEC-008). Every entry is wired — see this file's
 * header for why nothing here is withheld.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getSeoAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: "seo_get_entry_meta",
      description:
        "Resolves one entry's effective SEO meta (title, description, canonical, robots, OpenGraph, Twitter card, JSON-LD), applying the override > site-default > derived precedence. Read-only.",
      sideEffects: "none",
      authorization: { permission: "admin.seo.manage" },
      inputSchema: ENTRY_ID_SCHEMA,
    },
    {
      name: "seo_analyze_entry",
      description:
        "Runs the SEO analysis (score 0-100 plus a list of issues, e.g. missing title/description) over one entry's effective SEO meta. Read-only.",
      sideEffects: "none",
      authorization: { permission: "admin.seo.manage" },
      inputSchema: ENTRY_ID_SCHEMA,
    },
    {
      name: "seo_set_entry_overrides",
      description:
        "Sets one or more per-entry SEO field overrides, merged onto the entry's existing overrides (omitted fields are left unchanged; an unregistered field name is rejected). If the patch touches 'noindex' or 'canonical', the sitemap cache is invalidated so the next sitemap read reflects the change.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.seo.manage" },
      inputSchema: SET_ENTRY_OVERRIDES_SCHEMA,
    },
    {
      name: "seo_get_settings",
      description: "Reads the workspace's site-wide SEO settings (title template, default description/OG image/Twitter site, default robots directive, sitemap toggle, custom robots.txt rules). Read-only.",
      sideEffects: "none",
      authorization: { permission: "admin.seo.manage" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      name: "seo_set_settings",
      description:
        "Updates one or more of the workspace's site-wide SEO settings. All-or-nothing: if any field in the patch fails validation, nothing is written. Omitted fields are left unchanged.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.seo.manage" },
      inputSchema: SET_SETTINGS_SCHEMA,
    },
    {
      name: "seo_regenerate_sitemap",
      description:
        "Force-rebuilds the workspace's cached sitemap now, bypassing the cache-hit path. Never loses data — it only recomputes the same entries a normal cache-miss read would compute, sooner.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.seo.manage" },
      inputSchema: NO_INPUT_SCHEMA,
    },
  ];
}
