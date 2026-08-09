import type { AdminMenuItem, AdminMenuTarget } from "../../lib/api";
import { useMenuEditor } from "./hooks/use-menu-editor.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { MENUS_DICT } from "./menus-i18n";

type AdminMenuTargetKind = AdminMenuTarget["kind"];

/**
 * @file Per-menu tree editor (ADR-029 whole-tree replace) — markup only.
 *
 * v1 scope: a simple recursive nested-list UI — each item shows its
 * label/target-kind/target-value with add-child/remove/reorder controls.
 * No drag-and-drop.
 *
 * Every piece of state and every API call lives in `hooks/use-menu-editor.hooks.ts`; see that
 * file's header for why. What stays here is `ItemRow` and its two pure helpers
 * (`countDescendants`, `targetForKind`) — presentation concerns invoked directly from `ItemRow`'s
 * own markup, not part of the hook's state transitions.
 */

/** Total nested descendant count (children, grandchildren, …) — used to name exactly how many
 *  items a Remove click would take with it (audit finding, Major: Remove previously deleted a
 *  clicked item's entire subtree in one click with no confirmation and no indication children
 *  existed). Recursive, not just `.children.length`, so a deep removal is described accurately
 *  rather than undercounted — the tree is depth/size-bounded (menu-service.ts caps depth at 5,
 *  item count at 500), so a plain recursive walk is cheap at this scale. */
function countDescendants(item: AdminMenuItem): number {
  const children = item.children ?? [];
  return children.length + children.reduce((sum, child) => sum + countDescendants(child), 0);
}

/**
 * `?? ""` as a named function rather than inline. ESLint's cyclomatic-complexity rule counts each
 * `??` as its own branch — six of them across {@link targetForKind} and {@link MenuItemTargetFields}
 * below (2026-08-06, complexity pass, fourth pass) inflated each function's flat 4-case switch from
 * a base of ~5 to 10, even though cognitive complexity for both is 1: no nesting, four sibling cases,
 * each a single fallback. Naming the fallback removes the count from each switch's own scope without
 * changing what either function produces — every call site still falls back to `""` for exactly the
 * same absent values it did before.
 */
function orEmpty(value: string | undefined): string {
  return value ?? "";
}

export function targetForKind(required: { kind: AdminMenuTargetKind; prev: AdminMenuTarget }): AdminMenuTarget {
  const { kind, prev } = required;
  switch (kind) {
    case "url":
      return { kind, href: orEmpty(prev.href) };
    case "route":
      return { kind, route: orEmpty(prev.route) };
    case "entryRef":
      return { kind, entryId: orEmpty(prev.entryId) };
    case "termRef":
      return { kind, termId: orEmpty(prev.termId), taxonomy: orEmpty(prev.taxonomy) };
  }
}

/**
 * The target-kind-specific field(s) — URL/Route/Entry each show one input, Term shows two.
 * Extracted out of `ItemRow`'s four `item.target.kind === "…" ? (...) : null` blocks (its entire
 * branch count beyond the label field and the children map) into a `switch` over the same
 * `AdminMenuTargetKind` union `targetForKind` above already switches on — same convention, and
 * unlike an if/else-if chain a `switch`'s cases don't nest, which is what keeps this low under
 * cognitive complexity too. Uses {@link orEmpty} for the same reason `targetForKind` above does —
 * see that function's doc.
 */
export function MenuItemTargetFields({
  item,
  path,
  onChange,
}: {
  item: AdminMenuItem;
  path: number[];
  onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
}) {
  switch (item.target.kind) {
    case "url":
      return (
        <label className="a11y-label-wrap">
          <span className="visually-hidden">URL</span>
          <input
            value={orEmpty(item.target.href)}
            placeholder="https://…"
            onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, href: e.target.value } }))}
          />
        </label>
      );
    case "route":
      return (
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Route name</span>
          <input
            value={orEmpty(item.target.route)}
            placeholder="route name"
            onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, route: e.target.value } }))}
          />
        </label>
      );
    case "entryRef":
      return (
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Entry ID</span>
          <input
            value={orEmpty(item.target.entryId)}
            placeholder="entry id"
            onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, entryId: e.target.value } }))}
          />
        </label>
      );
    case "termRef":
      return (
        <>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Term ID</span>
            <input
              value={orEmpty(item.target.termId)}
              placeholder="term id"
              onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, termId: e.target.value } }))}
            />
          </label>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Taxonomy</span>
            <input
              value={orEmpty(item.target.taxonomy)}
              placeholder="taxonomy"
              onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, taxonomy: e.target.value } }))}
            />
          </label>
        </>
      );
  }
}

function ItemRow(props: {
  item: AdminMenuItem;
  path: number[];
  onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
  onRemove: (path: number[]) => void;
  onAddChild: (path: number[]) => void;
  onMove: (path: number[], direction: -1 | 1) => void;
  t: (key: string) => string;
}) {
  const { item, path, onChange, onRemove, onAddChild, onMove, t } = props;

  return (
    <div className="menu-item-row" style={{ marginLeft: path.length * 20 }}>
      <div className="menu-item-fields">
        {/* Audit finding: every control below was placeholder-only (or, for the `<select>`, had no
            accessible name at all — no placeholder, no label, nothing). Each now wraps in a real
            `<label>` with a `.visually-hidden` name, same fix and same reasoning as the title/slug
            fields above — see `styles/editor.css`'s `.a11y-label-wrap` comment for why the wrap
            costs no layout in this dense flex row. */}
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Item label</span>
          <input
            value={item.label ?? ""}
            placeholder={t("Label")}
            onChange={(e) => onChange(path, (it) => ({ ...it, label: e.target.value }))}
          />
        </label>
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Link type</span>
          <select
            value={item.target.kind}
            onChange={(e) =>
              onChange(path, (it) => ({
                ...it,
                target: targetForKind({ kind: e.target.value as AdminMenuTargetKind, prev: it.target }),
              }))
            }
          >
            <option value="url">{t("URL")}</option>
            <option value="route">{t("Route")}</option>
            <option value="entryRef">{t("Entry")}</option>
            <option value="termRef">{t("Term")}</option>
          </select>
        </label>
        <MenuItemTargetFields item={item} path={path} onChange={onChange} />
        {/* `aria-label` alongside `title`: `title` alone isn't reliably exposed to assistive tech
            and isn't keyboard-discoverable without a mouse hover (audit Minor finding). */}
        <button className="tb-btn" onClick={() => onMove(path, -1)} title="Move up" aria-label="Move item up">
          ↑
        </button>
        <button className="tb-btn" onClick={() => onMove(path, 1)} title="Move down" aria-label="Move item down">
          ↓
        </button>
        <button className="tb-btn" onClick={() => onAddChild(path)} title="Add child item">
          {t("+ child")}
        </button>
        <button
          className="tb-btn"
          onClick={() => {
            // Audit Major finding: Remove previously deleted the clicked item's entire subtree in
            // one click, no confirmation, no indication children existed — hits hardest for a
            // screen-reader user, since the same indentation a sighted operator reads "this has
            // children" from (`marginLeft: path.length * 20` below) carries no structural signal
            // for them either. A leaf item (no children) stays a bare click, matching this
            // screen's own `FormFieldsEditor`-sibling "Remove" convention for low-stakes removals.
            const descendantCount = countDescendants(item);
            if (
              descendantCount > 0 &&
              !window.confirm(
                `Remove "${item.label || "this item"}"? This will also remove ${descendantCount} nested item${descendantCount === 1 ? "" : "s"}.`
              )
            ) {
              return;
            }
            onRemove(path);
          }}
          title="Remove item"
          // `✕` is this button's only text content, so — unlike Move up/down above, whose glyphs
          // are at least paired with a real word via `title` alone being insufficient too — its
          // accessible name would otherwise compute to the glyph itself ("✕"/"multiplication
          // sign"), not "Remove item". Found empirically while adding this button's test:
          // `title` is never part of the accessible-name computation when text content exists.
          aria-label="Remove item"
        >
          ✕
        </button>
      </div>
      {(item.children ?? []).map((child, i) => (
        <ItemRow
          key={child.id}
          item={child}
          path={[...path, i]}
          onChange={onChange}
          onRemove={onRemove}
          onAddChild={onAddChild}
          onMove={onMove}
          t={t}
        />
      ))}
    </div>
  );
}

export function MenuEditor(props: { menuId: string | null }) {
  const {
    isNew,
    menu,
    title,
    setTitle,
    slug,
    setSlug,
    items,
    message,
    error,
    loading,
    confirmLeave,
    changeAt,
    removeAt,
    addChildAt,
    moveAt,
    addRootItem,
    save,
  } = useMenuEditor(props.menuId);
  const locale = useAdminLocale();
  const t = (key: string): string => MENUS_DICT[locale]?.[key] ?? key;

  if (error && !isNew && !menu) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading menu…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t(isNew ? "New menu" : "Edit menu")}</h1>
          <p className="page-description">{t("Build this menu's items and where each one links to.")}</p>
        </div>
        <div className="page-actions">
          {/* Audit finding: no editor screen warns before an in-app navigation discards unsaved
              edits — confirmed live on this exact screen. `preventDefault()` here also stops
              `router.ts`'s document-level click interceptor from firing `navigate()`, since that
              listener's first check is `event.defaultPrevented` — no change to `router.ts` needed. */}
          <a
            href="/admin/menus"
            onClick={(e) => {
              if (!confirmLeave()) e.preventDefault();
            }}
          >
            <button type="button" className="btn-secondary">
              ← {t("Menus")}
            </button>
          </a>
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          <button onClick={save}>{t("Save")}</button>
        </div>
      </div>
      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title/slug
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). */}
      <label className="a11y-label-wrap">
        <span className="visually-hidden">Menu title</span>
        <input
          className="editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("Menu title")}
        />
      </label>
      <div className="editor-slug">
        /{" "}
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Menu slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="menu-slug" />
        </label>
      </div>
      <div className="menu-tree">
        {items.map((item, i) => (
          <ItemRow
            key={item.id}
            item={item}
            path={[i]}
            onChange={changeAt}
            onRemove={removeAt}
            onAddChild={addChildAt}
            onMove={moveAt}
            t={t}
          />
        ))}
        {/* Secondary, not bare/primary — Save in the header is this screen's one primary action;
            an equally-loud "+ Add item" here would be the same two-primaries flatness problem
            `styles.css`'s button-hierarchy comment describes for row actions, just at the
            page level instead of a table row. */}
        <button type="button" className="btn-secondary" onClick={addRootItem}>
          {t("+ Add item")}
        </button>
      </div>
    </div>
  );
}
