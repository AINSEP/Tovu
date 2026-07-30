import { useEffect, useState } from "react";
import { api, type AdminMenu, type AdminMenuItem, type AdminMenuTarget } from "../lib/api";

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
        <input
          value={item.label ?? ""}
          placeholder="Label"
          onChange={(e) => onChange(path, (it) => ({ ...it, label: e.target.value }))}
        />
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
        {item.target.kind === "url" ? (
          <input
            value={item.target.href ?? ""}
            placeholder="https://…"
            onChange={(e) =>
              onChange(path, (it) => ({ ...it, target: { ...it.target, href: e.target.value } }))
            }
          />
        ) : null}
        {item.target.kind === "route" ? (
          <input
            value={item.target.route ?? ""}
            placeholder="route name"
            onChange={(e) =>
              onChange(path, (it) => ({ ...it, target: { ...it.target, route: e.target.value } }))
            }
          />
        ) : null}
        {item.target.kind === "entryRef" ? (
          <input
            value={item.target.entryId ?? ""}
            placeholder="entry id"
            onChange={(e) =>
              onChange(path, (it) => ({ ...it, target: { ...it.target, entryId: e.target.value } }))
            }
          />
        ) : null}
        {item.target.kind === "termRef" ? (
          <>
            <input
              value={item.target.termId ?? ""}
              placeholder="term id"
              onChange={(e) =>
                onChange(path, (it) => ({ ...it, target: { ...it.target, termId: e.target.value } }))
              }
            />
            <input
              value={item.target.taxonomy ?? ""}
              placeholder="taxonomy"
              onChange={(e) =>
                onChange(path, (it) => ({ ...it, target: { ...it.target, taxonomy: e.target.value } }))
              }
            />
          </>
        ) : null}
        <button className="tb-btn" onClick={() => onMove(path, -1)} title="Move up">
          ↑
        </button>
        <button className="tb-btn" onClick={() => onMove(path, 1)} title="Move down">
          ↓
        </button>
        <button className="tb-btn" onClick={() => onAddChild(path)} title="Add child item">
          + child
        </button>
        <button className="tb-btn" onClick={() => onRemove(path)} title="Remove item">
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

export function MenuEditor(props: { menuId: string | null }) {
  const isNew = props.menuId === null;
  const [menu, setMenu] = useState<AdminMenu | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      setMenu(null);
      setTitle("");
      setSlug("");
      setItems([]);
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
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load menu"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.menuId, isNew]);

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
        window.location.hash = `#/menus/${created.id}`;
        return;
      }
      if (!menu) return;
      const { menu: saved } = await api.updateMenuTree(
        { id: menu.id, expectedVersion: menu.version, items },
        { title, slug }
      );
      setMenu(saved);
      setItems(saved.items);
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  }

  if (error && !isNew && !menu) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading menu…</div>;

  return (
    <div className="editor-page">
      <div className="editor-header">
        <a href="#/menus">← Menus</a>
        <div className="editor-actions">
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          <button onClick={save}>Save</button>
        </div>
      </div>
      <input
        className="editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Menu title"
      />
      <div className="editor-slug">
        /{" "}
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="menu-slug" />
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
        <button onClick={addRootItem}>+ Add item</button>
      </div>
    </div>
  );
}
