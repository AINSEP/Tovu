import type { JsonObject } from "@jini-ai/core/primitives";
import { arr, obj, str } from "../value-readers.js";
import { escapeHtml } from "#src/platform/html/escape";
import { toAllowedHref } from "@jini-ai/cms/navigation/href";
import { MAX_SLUG_LENGTH, SLUG_FORMAT_PATTERN } from "#src/features/post/rendering";
import { renderEntryList, renderEntryListStructuredData, type EntryListItem, type EntryListFieldValue, type EntryListRenderOptions } from "#src/features/theme/entry-list-render";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import { COLLECTION_LIST_FAQ_PAGE, isCollectionListLayout } from "#src/features/entries/render-entry";

export function renderWidgetSocialLinks(props: JsonObject): string {
  const items = arr({ value: props.links })
    .map((link) => {
      const o = obj({ value: link });
      if (!o) return "";
      return `<li><a class="widget-social-link" href="${escapeHtml({ text: toAllowedHref({ rawHref: o.url }) })}">${escapeHtml({ text: str({ value: o.platform }) })}</a></li>`;
    })
    .join("");
  return `<ul class="widget widget-social-links">${items}</ul>`;
}

/**
 * `entry-summary` builds its own `href="/${slug}"` rather than calling {@link toAllowedHref} — `slug` is
 * never a full URL, so the allowlist scheme/relative checks {@link toAllowedHref} runs don't apply here.
 * That made it a SECOND, independent open-redirect path (2026-08-20 audit finding, alongside
 * `toAllowedHref`'s own protocol-relative bypass fixed above): a `props.slug` of `"/evil.example"` (a
 * leading slash smuggled inside the widget prop) reconstructs the exact same `"//evil.example"`
 * protocol-relative shape once concatenated behind the hardcoded `/` prefix — `escapeHtml` does not
 * touch `/`, so nothing upstream of this function was stopping it. Fixed the same way
 * {@link renderDocMention} already validates a mentioned post's `id` before trusting it into an
 * `href`: re-validate against the real slug format (`SLUG_FORMAT_PATTERN`/`MAX_SLUG_LENGTH`, the
 * SAME rule the post feature enforces at write time) rather than assuming this prop was ever
 * produced by that write path — `render.contribute`'s IR is attacker-shaped JSON at this boundary,
 * not necessarily a real `PostRecord.slug`. An invalid slug degrades the link target to `"#"`
 * (never a malformed/unsafe href) while the title still renders — same "degrade, don't disappear"
 * convention every other renderer in this file follows.
 */
export function renderWidgetEntrySummary(props: JsonObject): string {
  const slug = str({ value: props.slug });
  const title = str({ value: props.title });
  const href = slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_FORMAT_PATTERN.test(slug) ? `/${escapeHtml({ text: slug })}` : "#";
  return `<li class="widget-entry-summary"><a href="${href}">${escapeHtml({ text: title })}</a></li>`;
}

const RECENT_ENTRIES_EMPTY_HTML = '<ul class="widget widget-recent-entries"><li class="widget-empty">No entries yet.</li></ul>';

/** Converts one `recent-entries` IR child's resolved raw JSON props (built by
 *  `Jini/packages/cms/src/widgets/resolvers/recent-entries.ts`'s `RecentEntryItemProps`, deliberately the same
 *  shape as `entry-list-render.ts`'s `EntryListItem`) back into that typed shape. Read defensively
 *  (`str`/`arr`/`obj`) — this crosses a resolver/renderer JSON boundary, not a compiler-enforced
 *  contract. @complexity O(f) over the item's field count. */
function toEntryListItem(props: JsonObject): EntryListItem {
  return {
    title: str({ value: props.title }),
    href: typeof props.href === "string" ? props.href : null,
    dateIso: str({ value: props.dateIso }),
    dateLabel: str({ value: props.dateLabel }),
    fields: arr({ value: props.fields }).map((raw): EntryListFieldValue => {
      const f = obj({ value: raw }) ?? {};
      return { name: str({ value: f.name }), label: str({ value: f.label }), kind: str({ value: f.kind }), value: f.value ?? null };
    }),
  };
}

/**
 * `recent-entries` widget renderer — extended by collections plan R1 into "Collection list".
 *
 * `"cards"` layout (the one genuinely new display mode this plan adds) — and AW-7's `accordion` /
 * `carousel` with their opt-in `structuredData: "faq-page"` (2026-10-04): every known layout except
 * `list` — delegates entirely to C3's `renderEntryList`, so field display (`<dl>`) and the shared
 * `.entry-list`/`.entry-card` styling
 * work identically to the `{"type":"collection"}` marker — no second implementation. Review fix 3a
 * (2026-09-23): `withEntryListStyleOnce` is called from ONE place per tier — `static-render.ts`'s
 * `renderStaticPage` (used by `finishStaticTierDocument`) for a static theme, and this file's own
 * `pageShell` for every other tier — not from here; this renderer only has to produce the
 * `[data-tovu-entry-list]`-marked markup {@link withEntryListStyleOnce} looks for. Before this fix,
 * `pageShell` never called it at all, so a cards-layout widget on a templated/handlebars/
 * declarative theme (or no theme) rendered with no styling.
 *
 * `"list"` layout (the historical default, D7 — every pre-existing widget config has no `layout` key
 * and lands here) keeps its own exact `ul.widget.widget-recent-entries` / `li.widget-entry-summary`
 * markup instead of C3's generic `entry-list`/`entry-list__item` classes, so an operator's own theme
 * CSS targeting those class names keeps matching byte-for-byte. The one visible change for an old
 * config is the previously-broken `href="/<slug>"` link (`entry-summary`'s `renderWidgetEntrySummary`
 * built it and it 404s — a real bug) becoming plain text: the resolver's `href` is `null` while entry
 * pages are off (D1), and `null` here means no `<a>` at all, matching every other renderer in this
 * file's "degrade, don't disappear" convention.
 *
 * @complexity O(n · f) over the item count and each item's displayed field count.
 */
export function renderWidgetRecentEntries(ir: WidgetRenderIR): string {
  const items = (ir.children ?? []).map((child) => toEntryListItem(child.props));
  const layout = ir.props.layout;
  const structuredData: Pick<EntryListRenderOptions, "structuredData"> = ir.props.structuredData === COLLECTION_LIST_FAQ_PAGE ? { structuredData: COLLECTION_LIST_FAQ_PAGE } : {};
  if (layout !== "list" && isCollectionListLayout(layout)) {
    const columns = typeof ir.props.columns === "number" ? ir.props.columns : 3;
    const typeKey = str({ value: ir.props.typeKey }, { fallback: "recent-entries" });
    // `renderEntryList` returns `undefined` exactly when `items` is empty — that IS this widget's
    // empty state, so no separate length check runs ahead of it on this branch.
    return renderEntryList(items, { columns, layout, typeKey, ...structuredData }) ?? RECENT_ENTRIES_EMPTY_HTML;
  }
  if (items.length === 0) return RECENT_ENTRIES_EMPTY_HTML;

  const lis = items
    .map((item) => {
      const title = escapeHtml({ text: item.title });
      const inner = item.href === null ? title : `<a href="${escapeHtml({ text: toAllowedHref({ rawHref: item.href }) })}">${title}</a>`;
      return `<li class="widget-entry-summary">${inner}</li>`;
    })
    .join("");
  // The legacy markup, plus the FAQPage block when asked for — `list` is the default layout, so an
  // FAQ widget that never set one must not silently lose it.
  return `<ul class="widget widget-recent-entries">${lis}</ul>${renderEntryListStructuredData(items, structuredData)}`;
}
