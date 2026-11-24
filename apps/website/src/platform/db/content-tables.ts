import { WIDGET_REGION_BINDINGS_TABLE } from "@tovu/contracts/widget-tables";

/**
 * @file The content database's persisted table names, the host schema every Jini `@jini-ai/cms/<feature>/sql`
 * repo is constructed with. Tovu owns the persisted table names; the Jini repos take them as required injected values.
 */

/** Plugin-owned comments tables (`p_comments__*` are the data module's, created by its install). */
export const COMMENTS_TABLES = { comments: "p_comments__comments", moderationLog: "p_comments__moderation_log" } as const;

export const CONTENT_TYPE_TABLES = { contentTypes: "content_types", revisions: "content_type_revisions" } as const;

export const ENTRY_TABLES = { entries: "entries", revisions: "entry_revisions" } as const;

/** Forms table names belong to Tovu's unchanged schema. */
export const FORMS_TABLES = { definitions: "form_definitions", submissions: "form_submissions" };

export const NAVIGATION_TABLES = { menus: "menus", navLocationBindings: "nav_location_bindings" } as const;

export const TAXONOMY_TABLES = {
  taxonomies: "taxonomies",
  terms: "terms",
  entryTerms: "entry_terms",
  taxonomyRevisions: "taxonomy_revisions",
} as const;

export const WIDGETS_TABLES = { regionBindings: WIDGET_REGION_BINDINGS_TABLE } as const;
