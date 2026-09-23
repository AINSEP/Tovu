import { agentHandle } from "@jini-ai/agentic";

import type { AdminMenuItem, AdminMenuItemAttrs, AdminMenuTarget } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { useWiredMenuEditor } from "./hooks/use-menu-editor.hooks";
import { useMenuItemRemove } from "./MenuEditor.hooks";

type AdminMenuTargetKind = AdminMenuTarget["kind"];

/**
 * @file Per-menu tree editor (ADR-029 whole-tree replace) — markup only.
 *
 * v1 scope: a simple recursive nested-list UI — each item shows its
 * label/target-kind/target-value with add-child/remove/reorder controls.
 * No drag-and-drop.
 *
 * Every piece of state and every API call lives in `hooks/use-menu-editor.hooks.ts`; see that
 * file's header for why. What stays here is `ItemRow` and its pure helper (`targetForKind`) plus
 * `MenuItemTargetFields`/`MenuItemAttrsFields` — presentation concerns invoked directly from
 * `ItemRow`'s own markup, not part of the hook's state transitions. `ItemRow`'s Remove-button
 * confirmation logic (`countDescendants` included) lives in the colocated `MenuEditor.hooks.tsx`
 * instead — see that file's header for why.
 *
 * `MenuItemAttrsFields` exposes `NavItemAttrs`'s five presentational fields (Jini
 * `packages/cms/src/navigation/types.ts:104-115` — `cssClass`/`description`/`icon`/`openInNewTab`/
 * `rel`) behind a per-item `<details>` disclosure. These already round-trip through storage
 * untouched (`validateAndCloneTree` in Jini's `menu-service.ts` clones each node with `{ ...node,
 * children }`, never touching `attrs`) and the static-tier theme renderer already consumed
 * `cssClass`/`icon`/`description` — this screen was simply the one gap in an otherwise-working
 * pipeline. `rel`/`openInNewTab` were not consumed by ANY render path before this change; both the
 * static-tier tree-variant renderer (`features/theme/static-render.ts`) and the widget-IR menu
 * renderer (`server/inbound/public-http/http/site/render.ts`) now honor all five fields.
 */

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

/** Boolean counterpart to {@link orEmpty}, same rationale — see {@link attrsOrDefaults}. */
function orFalse(value: boolean | undefined): boolean {
  return value ?? false;
}

/**
 * Same rationale as {@link orEmpty} above: five `attrs?.field ?? default` fallbacks inlined
 * directly in {@link MenuItemAttrsFields}'s JSX pushed its cyclomatic complexity from a base of
 * ~6 (five sibling fields + the disclosure) to 11 — each `?.` and `??` is its own branch. Naming
 * the defaulting removes that count from the component's own scope without changing what any
 * field renders; every caller still sees the same fallback for the same absent value.
 */
function attrsOrDefaults(attrs: AdminMenuItemAttrs | undefined): Required<AdminMenuItemAttrs> {
  const a = attrs ?? {};
  return {
    cssClass: orEmpty(a.cssClass),
    icon: orEmpty(a.icon),
    description: orEmpty(a.description),
    rel: orEmpty(a.rel),
    openInNewTab: orFalse(a.openInNewTab),
  };
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
  t,
}: {
  item: AdminMenuItem;
  path: number[];
  onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
  t: Translate;
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
          <span className="visually-hidden">{t("Route name")}</span>
          <input
            value={orEmpty(item.target.route)}
            placeholder={t("route name")}
            onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, route: e.target.value } }))}
          />
        </label>
      );
    case "entryRef":
      return (
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Entry ID")}</span>
          <input
            value={orEmpty(item.target.entryId)}
            placeholder={t("entry id")}
            onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, entryId: e.target.value } }))}
          />
        </label>
      );
    case "termRef":
      return (
        <>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">{t("Term ID")}</span>
            <input
              value={orEmpty(item.target.termId)}
              placeholder={t("term id")}
              onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, termId: e.target.value } }))}
            />
          </label>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">{t("Taxonomy")}</span>
            <input
              value={orEmpty(item.target.taxonomy)}
              placeholder={t("taxonomy")}
              onChange={(e) => onChange(path, (it) => ({ ...it, target: { ...it.target, taxonomy: e.target.value } }))}
            />
          </label>
        </>
      );
  }
}

/**
 * `NavItemAttrs`'s five presentational fields, collapsed behind a `<details>` disclosure rather
 * than five more always-visible inputs on an already-dense row (label/kind/target-value/move/
 * child/remove) — see this file's own header for why they're safe to expose now. Applies
 * identically to every target kind, unlike {@link MenuItemTargetFields}'s kind-specific fields, so
 * it renders once per row rather than switching on `item.target.kind`. Native `<details>` needs no
 * open/closed state of its own (browser-managed), so this stays presentation-only, same as
 * {@link MenuItemTargetFields} above.
 */
export function MenuItemAttrsFields({
  item,
  path,
  onChange,
  t,
}: {
  item: AdminMenuItem;
  path: number[];
  onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
  t: Translate;
}) {
  const attrs = attrsOrDefaults(item.attrs);

  return (
    <details className="menu-item-advanced">
      <summary>{t("Advanced")}</summary>
      <div className="menu-item-advanced-fields">
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("CSS class")}</span>
          <input
            value={attrs.cssClass}
            placeholder={t("CSS class")}
            onChange={(e) => onChange(path, (it) => ({ ...it, attrs: { ...it.attrs, cssClass: e.target.value } }))}
          />
        </label>
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Icon")}</span>
          <input
            value={attrs.icon}
            placeholder={t("Icon")}
            onChange={(e) => onChange(path, (it) => ({ ...it, attrs: { ...it.attrs, icon: e.target.value } }))}
          />
        </label>
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Description")}</span>
          <input
            value={attrs.description}
            placeholder={t("Description")}
            onChange={(e) => onChange(path, (it) => ({ ...it, attrs: { ...it.attrs, description: e.target.value } }))}
          />
        </label>
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Link rel")}</span>
          <input
            value={attrs.rel}
            placeholder={t("Link rel")}
            onChange={(e) => onChange(path, (it) => ({ ...it, attrs: { ...it.attrs, rel: e.target.value } }))}
          />
        </label>
        <label className="menu-item-advanced-checkbox">
          <input
            type="checkbox"
            checked={attrs.openInNewTab}
            onChange={(e) => onChange(path, (it) => ({ ...it, attrs: { ...it.attrs, openInNewTab: e.target.checked } }))}
          />
          {t("Open in new tab")}
        </label>
      </div>
    </details>
  );
}

function ItemRow(props: {
  item: AdminMenuItem;
  path: number[];
  onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
  onRemove: (path: number[]) => void;
  onAddChild: (path: number[]) => void;
  onMove: (path: number[], direction: -1 | 1) => void;
  t: Translate;
}) {
  const { item, path, onChange, onRemove, onAddChild, onMove, t } = props;
  const { handleRemoveClick } = useMenuItemRemove(item, path, onRemove);

  return (
    <div className="menu-item-row" style={{ marginLeft: path.length * 20 }}>
      <div className="menu-item-fields">
        {/* Audit finding: every control below was placeholder-only (or, for the `<select>`, had no
            accessible name at all — no placeholder, no label, nothing). Each now wraps in a real
            `<label>` with a `.visually-hidden` name, same fix and same reasoning as the title/slug
            fields above — see `styles/editor.css`'s `.a11y-label-wrap` comment for why the wrap
            costs no layout in this dense flex row. */}
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Item label")}</span>
          <input
            value={item.label ?? ""}
            placeholder={t("Label")}
            onChange={(e) => onChange(path, (it) => ({ ...it, label: e.target.value }))}
          />
        </label>
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Link type")}</span>
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
        <MenuItemTargetFields item={item} path={path} onChange={onChange} t={t} />
        {/* `aria-label` alongside `title`: `title` alone isn't reliably exposed to assistive tech
            and isn't keyboard-discoverable without a mouse hover (audit Minor finding). */}
        <button className="tb-btn" onClick={() => onMove(path, -1)} title={t("Move up")} aria-label={t("Move item up")}>
          ↑
        </button>
        <button className="tb-btn" onClick={() => onMove(path, 1)} title={t("Move down")} aria-label={t("Move item down")}>
          ↓
        </button>
        <button className="tb-btn" onClick={() => onAddChild(path)} title={t("Add child item")}>
          {t("+ child")}
        </button>
        <button
          className="tb-btn"
          // Audit Major finding: Remove previously deleted the clicked item's entire subtree in
          // one click, no confirmation, no indication children existed — hits hardest for a
          // screen-reader user, since the same indentation a sighted operator reads "this has
          // children" from (`marginLeft: path.length * 20` below) carries no structural signal
          // for them either. A leaf item (no children) stays a bare click, matching this screen's
          // own `FormFieldsEditor`-sibling "Remove" convention for low-stakes removals — see
          // `MenuEditor.hooks.tsx`'s `useMenuItemRemove` for the confirmation logic itself.
          onClick={handleRemoveClick}
          title={t("Remove item")}
          // `✕` is this button's only text content, so — unlike Move up/down above, whose glyphs
          // are at least paired with a real word via `title` alone being insufficient too — its
          // accessible name would otherwise compute to the glyph itself ("✕"/"multiplication
          // sign"), not "Remove item". Found empirically while adding this button's test:
          // `title` is never part of the accessible-name computation when text content exists.
          aria-label={t("Remove item")}
        >
          ✕
        </button>
      </div>
      <MenuItemAttrsFields item={item} path={path} onChange={onChange} t={t} />
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

export interface MenuEditorProps {
  menuId: string | null;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  only `menuId` and behave exactly as before. */
  useMenuEditorHook?: typeof useWiredMenuEditor;
}

export function MenuEditor({ menuId, useMenuEditorHook = useWiredMenuEditor }: MenuEditorProps) {
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
    saving,
    t,
  } = useMenuEditorHook(menuId);

  if (error && !isNew && !menu) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">{t("Loading menu…")}</div>;

  return (
    <div className="page">
      {/* `page-header-split` (`styles.css`) — same shared idiom Pages/Posts/Forms already use:
          back link alone at the left rail, title block centred. Menus (like Widgets) never grew a
          separate `.editor-action-row` below a toolbar, so Save/status stay IN the header instead
          of an empty third rail — `.page-header-actions` (`styles.css`) pins that rail to the
          right and gives it its own narrow-container stacking row alongside the back link (owner,
          2026-09-22: "put the back button on the left, like the other editors" — this used to be a
          plain `.page-header`/`.page-actions` row with Back and Save both crowded at the right). */}
      <div
        className="page-header page-header-split"
        {...agentHandle("menu-editor-header", {
          role: "region",
          label: "Menu editor header — the back link, the menu's title, and the Save button",
        })}
      >
        <div className="page-header-lead">
          {/* Audit finding: no editor screen warns before an in-app navigation discards unsaved
              edits — confirmed live on this exact screen. `preventDefault()` here also stops
              `router.ts`'s document-level click interceptor from firing `navigate()`, since that
              listener's first check is `event.defaultPrevented` — no change to `router.ts` needed.
              Plain `<a className="btn-secondary">`, not a `<button>` nested inside an `<a>`
              (invalid HTML) — same fix Pages/Posts/Forms' own back links already made; this one
              still carried the old nested-button markup.

              Visible label shortened to a plain "← Back" (owner, 2026-09-22 — every editor's back
              button reads the same short way now). `aria-label` keeps "Back: Menus" — colon-joined
              rather than concatenated into a sentence so it needs no new per-locale phrase key and
              still starts with the exact visible text (WCAG 2.5.3 Label in Name). */}
          <a
            className="btn-secondary"
            href="/admin/menus"
            onClick={(e) => {
              if (!confirmLeave()) e.preventDefault();
            }}
            aria-label={`${t("Back")}: ${t("Menus")}`}
            {...agentHandle("menu-editor-back", { role: "link", label: "Back to the list of all menus" })}
          >
            ← {t("Back")}
          </a>
        </div>
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t(isNew ? "New menu" : "Edit menu")}</h1>
          <p className="page-description">{t("Build this menu's items and where each one links to.")}</p>
        </div>
        <div
          className="page-header-actions page-actions"
          {...agentHandle("menu-editor-actions", { role: "region", label: "Save status and the Save button" })}
        >
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          <button onClick={save} disabled={saving} {...agentHandle("menu-editor-save", { role: "button", label: "Save this menu" })}>
            {t("Save")}
          </button>
        </div>
      </div>
      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title/slug
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). */}
      <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Menu title")}</span>
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
          <span className="visually-hidden">{t("Menu slug")}</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="menu-slug" />
        </label>
        {/* The internal id used to be surfaced here as a read-only field (2026-08-09). Removed
            2026-08-11 alongside PostEditor's, and this one had the stronger case for going: a menu's
            id is minted by `idGen.newId()`, so it is random per install and a theme can never
            reference it — which is exactly why `ffc0f44` made theme menu markers resolve by SLUG
            first. Showing the id next to the slug invited an author to paste the one handle that
            provably cannot work in a shipped theme. */}
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
