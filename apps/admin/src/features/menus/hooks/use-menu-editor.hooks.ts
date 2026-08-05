import { useEffect, useState } from "react";
import { api, type AdminMenu, type AdminMenuItem } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { useDirtyGuard } from "../../../hooks/use-dirty-guard.hooks";

/**
 * @file Everything the per-menu tree editor does, so `MenuEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. `props.menuId ===
 * null` is create mode (unsaved menu, empty tree to start); a non-null id loads and edits an
 * existing menu.
 *
 * The immutable tree operations below (`mapAtPath` … `moveAtPath`) and the `newItem` factory move
 * with the state actions they implement (`changeAt`/`removeAt`/`addChildAt`/`moveAt`/`addRootItem`).
 * `countDescendants` and `targetForKind` stay in `MenuEditor.tsx` — they're only ever called from
 * inside `ItemRow`'s own markup (confirm copy, select-driven target reshaping), not from this
 * hook's state transitions.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/menus` needs it; promote
 * to `src/hooks/` only when a second feature actually does.
 */

function newItemId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newItem(): AdminMenuItem {
  return { id: newItemId(), label: "", target: { kind: "url", href: "" } };
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

/** What `useDirtyGuard` compares — everything an operator can actually edit on this screen. */
interface MenuFormState {
  title: string;
  slug: string;
  items: AdminMenuItem[];
}

export interface MenuEditorController {
  isNew: boolean;
  menu: AdminMenu | null;
  title: string;
  setTitle: (title: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  items: AdminMenuItem[];
  message: string | null;
  error: string | null;
  loading: boolean;
  confirmLeave: () => boolean;
  changeAt: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void;
  removeAt: (path: number[]) => void;
  addChildAt: (path: number[]) => void;
  moveAt: (path: number[], direction: -1 | 1) => void;
  addRootItem: () => void;
  save: () => Promise<void>;
}

export function useMenuEditor(menuId: string | null): MenuEditorController {
  const isNew = menuId === null;
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
      .getMenu(menuId as string)
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
  }, [menuId, isNew]);

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

  return {
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
  };
}
