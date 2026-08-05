import { useEffect, useState } from "react";
import { api, type AdminMenu, type AdminMenuItem, type AdminMenuTarget } from "../lib/api";
import { navigate } from "../lib/router";
import { useDirtyGuard } from "../hooks/use-dirty-guard.hooks";

type AdminMenuTargetKind = AdminMenuTarget["kind"];

/**
 * @file Per-menu tree editor (ADR-029 whole-tree replace).
 *
 * v1 scope: a simple recursive nested-list UI — each item shows its
 * label/target-kind/target-value with add-child/remove/reorder controls.
 * No drag-and-drop. `props.menuId === null` is create mode (unsaved menu,
 * empty tree to start); a non-null id loads and edits an existing menu.
 */

function newItemId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newItem(): AdminMenuItem {
  return { id: newItemId(), label: "", target: { kind: "url", href: "" } };
}

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

function targetForKind(required: { kind: AdminMenuTargetKind; prev: AdminMenuTarget }): AdminMenuTarget {
  const { kind, prev } = required;
  switch (kind) {
    case "url":
      return { kind, href: prev.href ?? "" };
    case "route":
      return { kind, route: prev.route ?? "" };
    case "entryRef":
      return { kind, entryId: prev.entryId ?? "" };
    case "termRef":
      return { kind, termId: prev.termId ?? "", taxonomy: prev.taxonomy ?? "" };
  }
}

// ---------------------------------------------------------------------------
// Immutable tree operations over a `path` (array of sibling indices from the
// root down to the target node). The tree is bounded (menu-service.ts caps
// depth at 5, item count at 500), so plain recursive rebuilds are fine —
// no need for an index/map structure at this scale.
// ---------------------------------------------------------------------------

function mapAtPath(
  items: AdminMenuItem[],
  path: number[],
  fn: (item: AdminMenuItem) => AdminMenuItem
): AdminMenuItem[] {
  if (path.length === 0) return items;
  const [index, ...rest] = path;
  return items.map((item, i) => {
    if (i !== index) return item;
    if (rest.length === 0) return fn(item);
    return { ...item, children: mapAtPath(item.children ?? [], rest, fn) };
  });
}

function removeAtPath(items: AdminMenuItem[], path: number[]): AdminMenuItem[] {
  if (path.length === 0) return items;
  const [index, ...rest] = path;
  if (rest.length === 0) return items.filter((_, i) => i !== index);
  return items.map((item, i) =>
    i === index ? { ...item, children: removeAtPath(item.children ?? [], rest) } : item
  );
}

function addChildAtPath(items: AdminMenuItem[], path: number[]): AdminMenuItem[] {
  if (path.length === 0) return [...items, newItem()];
  const [index, ...rest] = path;
  return items.map((item, i) => {
    if (i !== index) return item;
    if (rest.length === 0) return { ...item, children: [...(item.children ?? []), newItem()] };
    return { ...item, children: addChildAtPath(item.children ?? [], rest) };
  });
}

function getChildrenAtPath(items: AdminMenuItem[], path: number[]): AdminMenuItem[] {
  if (path.length === 0) return items;
  const [index, ...rest] = path;
  return getChildrenAtPath(items[index]?.children ?? [], rest);
}

function setChildrenAtPath(
  items: AdminMenuItem[],
  path: number[],
  children: AdminMenuItem[]
): AdminMenuItem[] {
  if (path.length === 0) return children;
  const [index, ...rest] = path;
  return items.map((item, i) =>
    i === index ? { ...item, children: setChildrenAtPath(item.children ?? [], rest, children) } : item
  );
}

function moveAtPath(items: AdminMenuItem[], path: number[], direction: -1 | 1): AdminMenuItem[] {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const siblings = getChildrenAtPath(items, parentPath);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return items;
  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return setChildrenAtPath(items, parentPath, reordered);
}

function ItemRow(props: {
  item: AdminMenuItem;
  path: number[];
  onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
  onRemove: (path: number[]) => void;
  onAddChild: (path: number[]) => void;
  onMove: (path: number[], direction: -1 | 1) => void;
}) {
  const { item, path, onChange, onRemove, onAddChild, onMove } = props;

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
            placeholder="Label"
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
            <option value="url">URL</option>
            <option value="route">Route</option>
            <option value="entryRef">Entry</option>
            <option value="termRef">Term</option>
          </select>
        </label>
        {item.target.kind === "url" ? (
          <label className="a11y-label-wrap">
            <span className="visually-hidden">URL</span>
            <input
              value={item.target.href ?? ""}
              placeholder="https://…"
              onChange={(e) =>
                onChange(path, (it) => ({ ...it, target: { ...it.target, href: e.target.value } }))
              }
            />
          </label>
        ) : null}
        {item.target.kind === "route" ? (
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Route name</span>
            <input
              value={item.target.route ?? ""}
              placeholder="route name"
              onChange={(e) =>
                onChange(path, (it) => ({ ...it, target: { ...it.target, route: e.target.value } }))
              }
            />
          </label>
        ) : null}
        {item.target.kind === "entryRef" ? (
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Entry ID</span>
            <input
              value={item.target.entryId ?? ""}
              placeholder="entry id"
              onChange={(e) =>
                onChange(path, (it) => ({ ...it, target: { ...it.target, entryId: e.target.value } }))
              }
            />
          </label>
        ) : null}
        {item.target.kind === "termRef" ? (
          <>
            <label className="a11y-label-wrap">
              <span className="visually-hidden">Term ID</span>
              <input
                value={item.target.termId ?? ""}
                placeholder="term id"
                onChange={(e) =>
                  onChange(path, (it) => ({ ...it, target: { ...it.target, termId: e.target.value } }))
                }
              />
            </label>
            <label className="a11y-label-wrap">
              <span className="visually-hidden">Taxonomy</span>
              <input
                value={item.target.taxonomy ?? ""}
                placeholder="taxonomy"
                onChange={(e) =>
                  onChange(path, (it) => ({ ...it, target: { ...it.target, taxonomy: e.target.value } }))
                }
              />
            </label>
          </>
        ) : null}
        {/* `aria-label` alongside `title`: `title` alone isn't reliably exposed to assistive tech
            and isn't keyboard-discoverable without a mouse hover (audit Minor finding). */}
        <button className="tb-btn" onClick={() => onMove(path, -1)} title="Move up" aria-label="Move item up">
          ↑
        </button>
        <button className="tb-btn" onClick={() => onMove(path, 1)} title="Move down" aria-label="Move item down">
          ↓
        </button>
        <button className="tb-btn" onClick={() => onAddChild(path)} title="Add child item">
          + child
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
        />
      ))}
    </div>
  );
}

/** What `useDirtyGuard` compares — everything an operator can actually edit on this screen. */
interface MenuFormState {
  title: string;
  slug: string;
  items: AdminMenuItem[];
}

export function MenuEditor(props: { menuId: string | null }) {
  const isNew = props.menuId === null;
  const [menu, setMenu] = useState<AdminMenu | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  // Snapshot of the last loaded-or-saved state (audit finding: no editor screen tracks this at
  // all today, so there is nothing for a dirty check to compare against). `null` only while a load
  // is still in flight — set immediately for `isNew` (an empty menu IS the loaded state to diff
  // against), and refreshed after every successful save so a saved edit stops reading as dirty.
  const [original, setOriginal] = useState<MenuFormState | null>(null);

  useEffect(() => {
    if (isNew) {
      setMenu(null);
      setTitle("");
      setSlug("");
      setItems([]);
      setOriginal({ title: "", slug: "", items: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getMenu(props.menuId as string)
      .then(({ menu }) => {
        setMenu(menu);
        setTitle(menu.title);
        setSlug(menu.slug);
        setItems(menu.items);
        setOriginal({ title: menu.title, slug: menu.slug, items: menu.items });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load menu"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.menuId, isNew]);

  const { confirmLeave } = useDirtyGuard<MenuFormState>({ title, slug, items }, original);

  function changeAt(path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) {
    setItems((prev) => mapAtPath(prev, path, fn));
  }
  function removeAt(path: number[]) {
    setItems((prev) => removeAtPath(prev, path));
  }
  function addChildAt(path: number[]) {
    setItems((prev) => addChildAtPath(prev, path));
  }
  function moveAt(path: number[], direction: -1 | 1) {
    setItems((prev) => moveAtPath(prev, path, direction));
  }
  function addRootItem() {
    setItems((prev) => [...prev, newItem()]);
  }

  async function save() {
    setMessage(null);
    setError(null);
    try {
      if (isNew) {
        const { menu: created } = await api.createMenu({ title, slug }, { items });
        navigate(`/menus/${created.id}`);
        return;
      }
      if (!menu) return;
      const { menu: saved } = await api.updateMenuTree(
        { id: menu.id, expectedVersion: menu.version, items },
        { title, slug }
      );
      setMenu(saved);
      setItems(saved.items);
      // A saved edit is no longer "unsaved" — re-baseline what the dirty check compares against,
      // or the guard would keep firing for a change the operator just persisted.
      setOriginal({ title, slug, items: saved.items });
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  }

  if (error && !isNew && !menu) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading menu…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">{isNew ? "New menu" : "Edit menu"}</h1>
          <p className="page-description">Build this menu&apos;s items and where each one links to.</p>
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
              ← Menus
            </button>
          </a>
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          <button onClick={save}>Save</button>
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
          placeholder="Menu title"
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
          />
        ))}
        {/* Secondary, not bare/primary — Save in the header is this screen's one primary action;
            an equally-loud "+ Add item" here would be the same two-primaries flatness problem
            `styles.css`'s button-hierarchy comment describes for row actions, just at the
            page level instead of a table row. */}
        <button type="button" className="btn-secondary" onClick={addRootItem}>
          + Add item
        </button>
      </div>
    </div>
  );
}
