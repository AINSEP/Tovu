import { escapeHtml, safeHref } from "./static-render.js";

/**
 * @file Pure entry-list renderer for the `{"type":"collection"}` static-tier marker (C3, plan lines
 * 168-191). Takes an already-fetched, already-formatted list of entries (C2's query result, reduced
 * to display values) and turns it into markup — cards, a plain list, or an operator-authored
 * template. Performs no I/O, no field-name humanization and no query logic; those live upstream
 * (`entries/public-list.ts`). Every entry value is attacker-shaped content (an operator's — or an
 * agent tool acting on an operator's behalf — free-text field value) that reaches every visitor of
 * the public site, so it is HTML-escaped on every path, matching this codebase's existing posture for
 * post-previews (`static-render.ts`'s `renderPostPreviewCard`) and menu links (`safeHref`'s own doc).
 *
 * D1: entry pages are OFF. `href` is `EntryDisplayListPort`'s caller's already-resolved
 * `entryPublicHref(...)` result, which returns `null` while pages are off — a `null` href renders the
 * title as plain text, never a dead `<a>`.
 */

/** One already-formatted field value to show on a card/list item, or to fill a `{{fields.<name>}}`
 * template placeholder. `label` is already humanized by the caller ({@link humanizeFieldName} in
 * `entries/public-list.ts`); this module never derives a label from `name`. `kind` selects display
 * formatting — currently only `"boolean"` is special-cased (rendered as `"Yes"`/`"No"`); every other
 * kind is shown via `String(value)`. */
export interface EntryListFieldValue {
  readonly name: string;
  readonly label: string;
  readonly kind: string;
  readonly value: unknown;
}

/** One entry, already reduced to exactly what a card/list item or an author template can show.
 * `href` is `null` when entry pages are off (D1) or the entry has none — the title then renders as
 * plain text with no `<a>`. `dateIso`/`dateLabel` exist only for the `{{date}}` template placeholder;
 * neither the default card nor list markup shows a date (plan lines 176-178 name only the title and
 * the fields `<dl>`). */
export interface EntryListItem {
  readonly title: string;
  readonly href: string | null;
  readonly dateIso: string;
  readonly dateLabel: string;
  readonly fields: readonly EntryListFieldValue[];
}

/** Per-marker rendering knobs. `template`, when present, switches `renderEntryList` into
 * author-template mode: the built-in cards/list markup is skipped entirely and `template` is repeated
 * once per item with its placeholders substituted. `columns` only affects the cards grid's CSS
 * variable; it is ignored in list and template mode. `typeKey` names the collection's content type,
 * used only for the `entry-list--<key>` class. */
export interface EntryListRenderOptions {
  readonly template?: string;
  readonly columns: number;
  readonly layout: "cards" | "list";
  readonly typeKey: string;
}

/** One `<style>` block providing the default `.entry-list`/`.entry-card` look via zero-specificity
 * `:where()` rules and theme tokens with fallbacks (D6: no theme.css edit — any theme rule still
 * wins). Cards default to a 3-column grid (overridden per-marker by `--entry-list-columns`),
 * collapsing to a single column under 640px so a narrow theme column or mobile viewport never clips
 * a card. `data-tovu-entry-list` is the injection marker {@link withEntryListStyleOnce} checks for. */
export const ENTRY_LIST_DEFAULT_STYLE =
  "<style data-tovu-entry-list>" +
  ":where(.entry-list){display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr));list-style:none;padding:0;margin:0}" +
  ":where(.entry-list--list){display:flex;flex-direction:column;grid-template-columns:none}" +
  ":where(.entry-card){border:1px solid var(--border,#ddd);background:var(--surface,transparent);padding:1rem;border-radius:.5rem}" +
  ":where(.entry-card__title){margin:0 0 .5rem}" +
  ":where(.entry-card__fields dt){color:var(--muted,#666);font-size:.85em}" +
  ":where(.entry-card__fields dd){margin:0 0 .75rem}" +
  "@media (max-width:640px){:where(.entry-list){grid-template-columns:1fr}}" +
  "</style>";

/**
 * Format one field's value for display. Boolean fields are the one kind with dedicated formatting
 * (D9: `"Yes"`/`"No"` in English); every other kind falls back to `String(value)`, treating `null`/
 * `undefined` as an empty string rather than the literal text `"null"`/`"undefined"`.
 *
 * @complexity O(1).
 */
function formatFieldValue(field: EntryListFieldValue): string {
  if (field.kind === "boolean") return field.value ? "Yes" : "No";
  return field.value === null || field.value === undefined ? "" : String(field.value);
}

/** One field row inside a card/list item's `<dl>`, escaped for plain HTML content (not a template). */
function renderFieldRow(field: EntryListFieldValue): string {
  return `<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(formatFieldValue(field))}</dd>`;
}

/** The title element shared by cards and list items: linked only when `href` is non-null (D1). */
function renderTitle(item: EntryListItem, tag: "h3"): string {
  const title = escapeHtml(item.title);
  const inner = item.href === null ? title : `<a href="${escapeHtml(safeHref(item.href))}">${title}</a>`;
  return `<${tag} class="entry-card__title">${inner}</${tag}>`;
}

/** One card: title (optionally linked) plus a `<dl>` of its fields, omitted entirely when there are
 * none — matching the empty-`fields` case producing no empty `<dl></dl>`. */
function renderCard(item: EntryListItem): string {
  const fields = item.fields.length === 0 ? "" : `<dl class="entry-card__fields">${item.fields.map(renderFieldRow).join("")}</dl>`;
  return `<article class="entry-card">${renderTitle(item, "h3")}${fields}</article>`;
}

/** One list item: same title/fields content as a card, without the `<article>`/card wrapper. */
function renderListItem(item: EntryListItem): string {
  const fields = item.fields.length === 0 ? "" : `<dl class="entry-card__fields">${item.fields.map(renderFieldRow).join("")}</dl>`;
  return `<li class="entry-list__item">${renderTitle(item, "h3")}${fields}</li>`;
}

/** Resolves one `{{...}}` template placeholder's RAW (unescaped) text for `item`. Unknown
 * placeholders — including a `{{fields.<name>}}` naming a field this entry doesn't carry — resolve to
 * `""` rather than throwing, so one theme's differently-shaped entries never break another's template.
 */
function resolvePlaceholderRawValue(key: string, item: EntryListItem): string {
  if (key === "title") return item.title;
  if (key === "url") return item.href ?? "";
  if (key === "date") return item.dateLabel;
  if (key.startsWith("fields.")) {
    const field = item.fields.find((candidate) => candidate.name === key.slice("fields.".length));
    return field === undefined ? "" : formatFieldValue(field);
  }
  return "";
}

const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
const HREF_OR_SRC_ATTRIBUTE_PATTERN = /((?:href|src)\s*=\s*)"([^"]*)"/g;

/** Substitutes every `{{...}}` placeholder in `text` with its resolved raw value for `item`, each
 * passed through `transform` before insertion. Both template passes below share this: one for the
 * inside of an `href=`/`src=` attribute value (`transform` applies `safeHref` before escaping), one
 * for everything else (`transform` only escapes). */
function substitutePlaceholders(text: string, item: EntryListItem, transform: (raw: string) => string): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, key: string) => transform(resolvePlaceholderRawValue(key, item)));
}

/**
 * Renders one item through an operator-authored `template` string. A placeholder that lands inside an
 * `href=`/`src=` attribute's value is sanitized with {@link safeHref} before escaping — the same rule
 * `safeHref`'s own doc states for menu links — so an entry field value can never smuggle a
 * `javascript:` (or other unsafe-scheme) URL into an authored template. Every other placeholder is
 * HTML-escaped only. No Tovu card/list markup is added around the template's own content.
 *
 * @complexity O(n) over `template`'s length for each of the two placeholder-substitution passes.
 */
function renderTemplateItem(template: string, item: EntryListItem): string {
  const withHrefAndSrcResolved = template.replace(HREF_OR_SRC_ATTRIBUTE_PATTERN, (_match, prefix: string, attributeValue: string) => {
    const resolved = substitutePlaceholders(attributeValue, item, (raw) => escapeHtml(safeHref(raw)));
    return `${prefix}"${resolved}"`;
  });
  return substitutePlaceholders(withHrefAndSrcResolved, item, escapeHtml);
}

/**
 * Renders a resolved, already-visibility-filtered list of entries into markup for the `collection`
 * static-tier marker: either the built-in cards/list presentation, or `options.template` repeated
 * once per item when present (author-template mode; `options.columns`/`options.layout` are then
 * ignored). Mirrors {@link injectPostPreviewsEmbeds}'s own "no data ⇒ nothing to substitute" contract:
 * an empty `items` returns `undefined` so the marker's caller can leave the theme's own authored
 * fallback content untouched instead of splicing in an empty container.
 *
 * @returns the rendered markup, or `undefined` when `items` is empty.
 * @complexity O(n · f) over the number of items and each item's field count; template mode is
 * O(n · t) over each item's template-length substitution pass instead.
 */
export function renderEntryList(items: readonly EntryListItem[], options: EntryListRenderOptions): string | undefined {
  if (items.length === 0) return undefined;
  if (options.template !== undefined) {
    return items.map((item) => renderTemplateItem(options.template as string, item)).join("");
  }
  const typeClass = escapeHtml(options.typeKey);
  if (options.layout === "list") {
    return `<ul class="entry-list entry-list--${typeClass} entry-list--list">${items.map(renderListItem).join("")}</ul>`;
  }
  return (
    `<div class="entry-list entry-list--${typeClass}" style="--entry-list-columns:${options.columns}">` +
    `${items.map(renderCard).join("")}</div>`
  );
}

/**
 * Inserts {@link ENTRY_LIST_DEFAULT_STYLE} once before `</head>`, only when `html` actually contains
 * an `.entry-list` (no wasted style block on a page with no collection marker) and doesn't already
 * carry the style (idempotent across repeated calls or multiple collection markers on one page).
 * Mirrors the existing "scan the assembled HTML, inject once" shape `withEntryListStyleOnce`'s callers
 * already use for other once-per-page embeds.
 *
 * @returns `html` unchanged when there is no `.entry-list`, the style is already present, or there is
 * no `</head>` to insert before; otherwise `html` with the style spliced in.
 * @complexity O(n) over `html`'s length for the two substring scans plus the slice/concat.
 */
export function withEntryListStyleOnce(html: string): string {
  if (!html.includes("entry-list")) return html;
  if (html.includes("data-tovu-entry-list")) return html;
  const headCloseIndex = html.indexOf("</head>");
  if (headCloseIndex === -1) return html;
  return `${html.slice(0, headCloseIndex)}${ENTRY_LIST_DEFAULT_STYLE}${html.slice(headCloseIndex)}`;
}
