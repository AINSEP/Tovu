/**
 * @file Plan G1 (`plan-publish-all-types-2026-09-25.md` §4, "Section buttons + dialog type names") —
 * the ONE table of publishable sections. Each admin list page's "Publish …" button, the dialog's
 * title/description for a section-scoped run, and the dialog's type column all read from here, so
 * adding a publishable type is one row (or one `entityTypes` entry) instead of four hand-kept maps.
 *
 * A section sends its WHOLE `entityTypes` list: a collection is its content type plus its entries,
 * a category group is its taxonomy plus its terms. Every registered publish-content contributor sits
 * in exactly one section — `__tests__/sections.test.ts` pins that against the real registry.
 *
 * `labelKey`/`descriptionKey`/`typeLabelKeys` are English copy keys; the admin resolves them through
 * its own dictionary (`dashboard-i18n.ts`). Pure data, no runtime dependency (see `index.ts`).
 */

export interface PublishSection {
  /** Stable id a list page names its button by, e.g. `<PublishSectionButton section="forms" />`. */
  readonly section: string;
  /** Everything this section's button sends — the dialog's `scope.entityTypes`, verbatim. */
  readonly entityTypes: readonly string[];
  /** Button label and the section-scoped dialog's title. */
  readonly labelKey: string;
  /** The section-scoped dialog's description line. */
  readonly descriptionKey: string;
  /** Friendly name per entity type, shown in the dialog's type column. */
  readonly typeLabelKeys: Readonly<Record<string, string>>;
  /** The same names, plural — the dialog's counted lines ("Forms (7) can't publish yet…"). Same keys
   *  as `typeLabelKeys`, enforced by `section()`'s signature. */
  readonly typePluralLabelKeys: Readonly<Record<string, string>>;
}

export const PUBLISH_SECTIONS = [
  section({ id: "pages", labelKey: "Publish pages", descriptionKey: "Sends your pages to the live site.", typeLabelKeys: { page: "Page" }, typePluralLabelKeys: { page: "Pages" } }),
  section({ id: "posts", labelKey: "Publish posts", descriptionKey: "Sends your posts to the live site.", typeLabelKeys: { post: "Post" }, typePluralLabelKeys: { post: "Posts" } }),
  section({ id: "media", labelKey: "Publish media", descriptionKey: "Sends your media to the live site.", typeLabelKeys: { media: "Media" }, typePluralLabelKeys: { media: "Media" } }),
  section({ id: "menus", labelKey: "Publish menus", descriptionKey: "Sends your menus to the live site.", typeLabelKeys: { menu: "Menu" }, typePluralLabelKeys: { menu: "Menus" } }),
  section({ id: "redirects", labelKey: "Publish redirects", descriptionKey: "Sends your redirects to the live site.", typeLabelKeys: { redirect: "Redirect" }, typePluralLabelKeys: { redirect: "Redirects" } }),
  // The active theme goes with the themes: a theme published without it sits unused on the live site.
  section({ id: "themes", labelKey: "Publish themes", descriptionKey: "Sends your themes to the live site.", typeLabelKeys: { "theme-files": "Theme", "active-theme": "Active theme" }, typePluralLabelKeys: { "theme-files": "Themes", "active-theme": "Active theme" } }),
  section({ id: "forms", labelKey: "Publish forms", descriptionKey: "Sends your forms to the live site.", typeLabelKeys: { form: "Form" }, typePluralLabelKeys: { form: "Forms" } }),
  section({ id: "collections", labelKey: "Publish collections", descriptionKey: "Sends your collections and their entries to the live site.", typeLabelKeys: { "content-type": "Collection", "collection-entry": "Entry" }, typePluralLabelKeys: { "content-type": "Collections", "collection-entry": "Entries" } }),
  section({ id: "categories", labelKey: "Publish categories & tags", descriptionKey: "Sends your categories and tags to the live site.", typeLabelKeys: { taxonomy: "Taxonomy", term: "Term" }, typePluralLabelKeys: { taxonomy: "Taxonomies", term: "Terms" } }),
  section({ id: "widgets", labelKey: "Publish widgets", descriptionKey: "Sends your widgets and widget regions to the live site.", typeLabelKeys: { widget: "Widget", "widget-area": "Widget region" }, typePluralLabelKeys: { widget: "Widgets", "widget-area": "Widget regions" } }),
  section({ id: "settings", labelKey: "Publish site settings", descriptionKey: "Sends your site title and SEO defaults to the live site.", typeLabelKeys: { "site-setting": "Site setting" }, typePluralLabelKeys: { "site-setting": "Site settings" } }),
] as const satisfies readonly PublishSection[];

export type PublishSectionId = (typeof PUBLISH_SECTIONS)[number]["section"];

/** @complexity O(sections). */
export function publishSectionById({ id }: { id: string }, _optional = {}): PublishSection | undefined {
  return PUBLISH_SECTIONS.find((candidate) => candidate.section === id);
}

/**
 * The section whose `entityTypes` is exactly this set (order-insensitive), or `undefined` — a
 * scope naming some other mix of types is not any one section's button.
 *
 * @complexity O(sections × types).
 */
export function publishSectionForEntityTypes(entityTypes: readonly string[]): PublishSection | undefined {
  const wanted = new Set(entityTypes);
  return PUBLISH_SECTIONS.find(
    (candidate) =>
      candidate.entityTypes.length === wanted.size && candidate.entityTypes.every((type) => wanted.has(type)),
  );
}

/** The friendly type name for the dialog's type column, or the raw `entityType` for a type no
 *  section names yet (degraded, never blank). @complexity O(sections). */
export function publishEntityTypeLabel({ entityType }: { entityType: string }, _optional = {}): string {
  for (const candidate of PUBLISH_SECTIONS) {
    const label: string | undefined = (candidate.typeLabelKeys as Readonly<Record<string, string>>)[entityType];
    if (label !== undefined) return label;
  }
  return entityType;
}

/** The plural friendly name for a counted line, or the raw `entityType` for a type no section names
 *  yet (degraded, never blank). @complexity O(sections). */
export function publishEntityTypePluralLabel({ entityType }: { entityType: string }, _optional = {}): string {
  for (const candidate of PUBLISH_SECTIONS) {
    const label: string | undefined = (candidate.typePluralLabelKeys as Readonly<Record<string, string>>)[entityType];
    if (label !== undefined) return label;
  }
  return entityType;
}

function section<const S extends string, const T extends Record<string, string>>({ id, labelKey, descriptionKey, typeLabelKeys, typePluralLabelKeys }: { id: S; labelKey: string; descriptionKey: string; typeLabelKeys: T; typePluralLabelKeys: { readonly [K in keyof T]: string } }, _optional = {}): {
  section: S;
  entityTypes: readonly (keyof T & string)[];
  labelKey: string;
  descriptionKey: string;
  typeLabelKeys: T;
  typePluralLabelKeys: { readonly [K in keyof T]: string };
} {
  return {
    section: id,
    entityTypes: Object.keys(typeLabelKeys) as (keyof T & string)[],
    labelKey,
    descriptionKey,
    typeLabelKeys,
    typePluralLabelKeys,
  };
}
