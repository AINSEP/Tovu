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

/**
 * Review fix 3a (`2026-09-23-review-E4-R1-report.md`): every selector below is scoped under the
 * `[data-tovu-entry-list]` attribute {@link renderEntryList} puts on ITS OWN wrapper element (the
 * `<div>`/`<ul>` cards/list root), never a bare `.entry-list` class selector. Declarative themes
 * already use the plain `entry-list`/`entry-list--<route>` classes for their own built-in post/
 * product index (`render.ts`'s `entryList`/`productEntryList`) — a bare `.entry-list` rule would
 * silently turn THAT unrelated vertical list into a grid the moment this style is wired into a
 * second call site ({@link withEntryListStyleOnce}'s `pageShell` wiring). Scoping to the attribute
 * (which only this module's own markup ever emits) makes the style unable to match anything this
 * module didn't render, regardless of how many other places call {@link withEntryListStyleOnce}.
 */
const ENTRY_LIST_STYLE_OPEN_TAG = "<style data-tovu-entry-list>";

/** One `<style>` block providing the default `.entry-list`/`.entry-card` look via zero-specificity
 * `:where()` rules and theme tokens with fallbacks (D6: no theme.css edit — any theme rule still
 * wins). Cards default to a 3-column grid (overridden per-marker by `--entry-list-columns`),
 * collapsing to a single column under 640px so a narrow theme column or mobile viewport never clips
 * a card. `data-tovu-entry-list` is also the injection marker {@link withEntryListStyleOnce} checks
 * for (see {@link ENTRY_LIST_STYLE_OPEN_TAG}'s doc for why every rule is attribute-scoped). */
export const ENTRY_LIST_DEFAULT_STYLE =
  ENTRY_LIST_STYLE_OPEN_TAG +
  ":where([data-tovu-entry-list]){display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr));list-style:none;padding:0;margin:0}" +
  ":where([data-tovu-entry-list].entry-list--list){display:flex;flex-direction:column;grid-template-columns:none}" +
  ":where([data-tovu-entry-list] .entry-card){border:1px solid var(--border,#ddd);background:var(--surface,transparent);padding:1rem;border-radius:.5rem}" +
  ":where([data-tovu-entry-list] .entry-card__title){margin:0 0 .5rem}" +
  ":where([data-tovu-entry-list] .entry-card__fields dt){color:var(--muted,#666);font-size:.85em}" +
  ":where([data-tovu-entry-list] .entry-card__fields dd){margin:0 0 .75rem}" +
  "@media (max-width:640px){:where([data-tovu-entry-list]){grid-template-columns:1fr}}" +
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

/** One pass over a template: an opening tag (quote-aware, so a `>` inside a quoted attribute value
 * does not end it) or a text-context placeholder. Matching both in ONE `replace` pass means a
 * substituted value is never rescanned, so a value that itself contains `{{...}}` is never re-expanded. */
const QUOTED_VALUE_SOURCE = `"[^"]*"|'[^']*'`;
const PLACEHOLDER_SOURCE = String.raw`\{\{([a-zA-Z0-9_.]+)\}\}`;
const TEMPLATE_TAG_OR_PLACEHOLDER = new RegExp(`<[a-zA-Z][^>"']*(?:(?:${QUOTED_VALUE_SOURCE})[^>"']*)*>|${PLACEHOLDER_SOURCE}`, "g");

/** Inside one opening tag: a `name=value` attribute (double-, single- or un-quoted value) or a
 * placeholder standing in an attribute-name position. */
const TAG_ATTRIBUTE_OR_PLACEHOLDER = new RegExp(
  String.raw`([^\s"'=<>/\x60]+)(\s*=\s*)(${QUOTED_VALUE_SOURCE}|[^\s"'=<>\x60]+)|${PLACEHOLDER_SOURCE}`,
  "g"
);

/** Attributes whose value a browser follows or loads as a URL, so an entry value placed in one gets
 * the {@link safeHref} scheme allowlist. */
const URL_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(["href", "src", "action", "formaction", "poster", "cite", "background", "data", "xlink:href"]);

/** Non-global twin of {@link PLACEHOLDER_PATTERN} for a stateless "does this contain one" test. */
const HAS_PLACEHOLDER = /\{\{[a-zA-Z0-9_.]+\}\}/;

type PlaceholderEscape = (raw: string) => string;

/** Substitutes every `{{...}}` placeholder in `text` with its resolved raw value for `item`, each
 * passed through `transform` before insertion. One `replace` pass, so inserted text is never rescanned. */
function substitutePlaceholders(text: string, item: EntryListItem, transform: PlaceholderEscape): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, key: string) => transform(resolvePlaceholderRawValue(key, item)));
}

/** Entity-encodes the characters that end or split an UNQUOTED attribute value (whitespace, `=`,
 * backtick) on top of {@link escapeHtml}, so an entry value there cannot start a second attribute. */
function escapeForUnquotedAttribute(raw: string): string {
  return escapeHtml(raw).replace(/[\s=`]/g, (char) => `&#${char.codePointAt(0)};`);
}

/**
 * A URL attribute's value with its placeholders filled. The COMPOSED url (author text plus raw entry
 * values) must pass {@link safeHref}, else the whole value becomes `#` — checking the composed value,
 * not each placeholder alone, keeps `https://x.test/{{fields.id}}` working while still catching an
 * entry value that sets the scheme. The author's own literal text is never re-escaped.
 *
 * @complexity O(n) over the value's length (two placeholder passes).
 */
function renderUrlAttributeValue(value: string, item: EntryListItem, escapeValue: PlaceholderEscape): string {
  const composed = substitutePlaceholders(value, item, (raw) => raw);
  if (safeHref(composed) !== composed.trim()) return "#";
  return substitutePlaceholders(value, item, escapeValue);
}

/**
 * One `name=value` attribute of an opening tag, placeholders filled by context: dropped inside an
 * `on*` handler or `srcdoc` (both re-parse the entity-decoded value as script/HTML, so escaping
 * cannot make an entry value safe there), scheme-checked in a {@link URL_ATTRIBUTE_NAMES} attribute,
 * HTML-escaped otherwise — with the extra unquoted-value encoding when the author left it unquoted.
 * An attribute with no placeholder is returned exactly as the author wrote it.
 *
 * @complexity O(n) over the attribute's length.
 */
function renderTemplateAttribute(attribute: { name: string; equals: string; value: string }, item: EntryListItem): string {
  const { name, equals, value } = attribute;
  const quote = value.startsWith('"') || value.startsWith("'") ? value.charAt(0) : "";
  const inner = quote === "" ? value : value.slice(1, -1);
  const escapeValue: PlaceholderEscape = quote === "" ? escapeForUnquotedAttribute : escapeHtml;
  return `${name}${equals}${quote}${fillAttributeValue(name.toLowerCase(), inner, item, escapeValue)}${quote}`;
}

/** {@link renderTemplateAttribute}'s per-name rule, split out to keep each function's branching small. */
function fillAttributeValue(lowerName: string, inner: string, item: EntryListItem, escapeValue: PlaceholderEscape): string {
  if (lowerName.startsWith("on") || lowerName === "srcdoc") return substitutePlaceholders(inner, item, () => "");
  if (URL_ATTRIBUTE_NAMES.has(lowerName) && HAS_PLACEHOLDER.test(inner)) return renderUrlAttributeValue(inner, item, escapeValue);
  return substitutePlaceholders(inner, item, escapeValue);
}

/** Fills one opening tag's placeholders attribute by attribute ({@link renderTemplateAttribute}); a
 * placeholder in an attribute-name position gets the unquoted-value encoding. @complexity O(n). */
function renderTemplateTag(tag: string, item: EntryListItem): string {
  return tag.replace(
    TAG_ATTRIBUTE_OR_PLACEHOLDER,
    (_match, name: string | undefined, equals: string, value: string, key: string | undefined) =>
      key === undefined ? renderTemplateAttribute({ name: name ?? "", equals, value }, item) : escapeForUnquotedAttribute(resolvePlaceholderRawValue(key, item))
  );
}

/**
 * Renders one item through an operator-authored `template` string. Entry values are attacker-shaped
 * (see this file's header), so each placeholder is filled for the context it lands in: text is
 * HTML-escaped; inside a tag, {@link renderTemplateTag} applies the attribute rules (URL scheme check
 * for every URL attribute and quote style, dropped inside `on*`/`srcdoc`, unquoted values cannot
 * break out). No Tovu card/list markup is added around the template's own content.
 *
 * @complexity O(n) over `template`'s length — one pass, plus one pass per opening tag over that tag.
 */
function renderTemplateItem(template: string, item: EntryListItem): string {
  return template.replace(TEMPLATE_TAG_OR_PLACEHOLDER, (match, key: string | undefined) =>
    key === undefined ? renderTemplateTag(match, item) : escapeHtml(resolvePlaceholderRawValue(key, item))
  );
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
    return `<ul class="entry-list entry-list--${typeClass} entry-list--list" data-tovu-entry-list>${items.map(renderListItem).join("")}</ul>`;
  }
  return (
    `<div class="entry-list entry-list--${typeClass}" data-tovu-entry-list style="--entry-list-columns:${options.columns}">` +
    `${items.map(renderCard).join("")}</div>`
  );
}

/**
 * Inserts {@link ENTRY_LIST_DEFAULT_STYLE} once before `</head>`, only when `html` actually contains
 * a `[data-tovu-entry-list]` wrapper (no wasted style block on a page with no collection/cards
 * list) and doesn't already carry the style tag (idempotent across repeated calls, multiple
 * collection markers, or multiple call sites on one page — see {@link withEntryListStyleOnce}'s own
 * callers). Two independent checks on purpose (review fix 3a): the FIRST looks for the wrapper
 * attribute {@link renderEntryList} itself emits, never the bare `entry-list` class — a theme's own,
 * unrelated `.entry-list`-classed markup (e.g. `render.ts`'s declarative post/product index) must
 * never trigger this on its own. The SECOND looks for the exact `<style data-tovu-entry-list>` open
 * tag, not just the bare attribute name, because after the first injection the wrapper's own copy of
 * that attribute would otherwise make a same-string check trivially true even before the style tag
 * itself exists.
 *
 * @returns `html` unchanged when there is no `[data-tovu-entry-list]` wrapper, the style is already
 * present, or there is no `</head>` to insert before; otherwise `html` with the style spliced in.
 * @complexity O(n) over `html`'s length for the two substring scans plus the slice/concat.
 */
export function withEntryListStyleOnce(html: string): string {
  if (!html.includes("data-tovu-entry-list")) return html;
  if (html.includes(ENTRY_LIST_STYLE_OPEN_TAG)) return html;
  const headCloseIndex = html.indexOf("</head>");
  if (headCloseIndex === -1) return html;
  return `${html.slice(0, headCloseIndex)}${ENTRY_LIST_DEFAULT_STYLE}${html.slice(headCloseIndex)}`;
}
