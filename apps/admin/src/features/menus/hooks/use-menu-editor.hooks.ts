import { useEffect, useRef, useState } from "react";
import { type AdminMenu, type AdminMenuItem } from "@/lib/api";
import { navigate as realNavigate } from "@/lib/router";
import { useDirtyGuard } from "@/hooks/use-dirty-guard.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../menus-i18n";
import { defaultMenusPort } from "./menus-dependencies.hooks";
import type { MenusPort } from "./menus-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

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
 *
 * `deps.port`/`deps.navigate` are injected (see `menus-port.hooks.ts`) rather than reaching for
 * `lib/api`'s `api` and `lib/router`'s `navigate` directly, sharing the `MenusPort`
 * `use-menus.hooks.ts` also injects.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — see `use-menus.hooks.ts`'s identical note): injected
 * so `MenuEditor.tsx` (and `ItemRow`, which it threads `t` into as a prop) source their UI copy
 * from this hook instead of their own `useAdminLocale()`/`MENUS_DICT` import. This hook's OWN error
 * strings stay hardcoded English (unchanged) — `useAdminLocale()`/`MENUS_DICT` are read only inside
 * {@link useWiredMenuEditor}.
 */

export interface MenuEditorDependencies {
  port: MenusPort;
  navigate: (path: string) => void;
  t: Translate;
}

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
  /**
   * Whether a Save request is currently in flight (S4a, 2026-09-20) — the button had no `disabled`
   * at all, unlike Pages/Posts' twin `saving` field (`PageEditorController.saving`,
   * `PostEditorController.saving` from the same pass, `use-post-editor.hooks.ts` M4). A double click
   * sent two `updateMenuTree` calls carrying the same `expectedVersion`; the first landed, the
   * second's basis was already stale, so the operator saw an error line next to "Saved". Unlike
   * Pages/Posts, this screen has no "later click wins" intent to preserve (Menus has one action, not
   * a Save-vs-Publish race), so `save()` itself drops a same-tick re-entry via a synchronous
   * `useRef` guard rather than letting a second write reach the port at all — see `save()`'s own
   * comment.
   */
  saving: boolean;
  /** Bound translator — `MenuEditor.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
}

export function useMenuEditor(menuId: string | null, { port, navigate, t }: MenuEditorDependencies): MenuEditorController {
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

  // Stale-response guard (2026-08-12 audit finding): this is a route-param loader — the panel
  // router reuses this same component/hook across `/new` and every `/:id`, so navigating from one
  // menu to another (or from an existing menu to `/new`) can let an OLDER `getMenu` response land
  // after a NEWER one, overwriting the currently-viewed menu with a previous one's data (or, for
  // `/new`, populating a blank editor with a stale record — the operator would then be editing and
  // saving over the wrong menu). `cancelled` is flipped by this same effect's own cleanup the
  // instant `menuId`/`isNew` changes again, before the new run starts — guarded on every completion
  // path (`then`/`catch`/`finally`), not just the success path, since an unguarded `finally`
  // clearing `loading` is the one most likely to leave stale data on screen with no spinner to flag
  // it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stale-response guard keyed on menuId/isNew only — see comment above; `port` intentionally excluded.
  useEffect(() => {
    let cancelled = false;
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
    port
      .getMenu(menuId as string)
      .then(({ menu }) => {
        if (cancelled) return;
        setMenu(menu);
        setTitle(menu.title);
        setSlug(menu.slug);
        setItems(menu.items);
        setOriginal({ title: menu.title, slug: menu.slug, items: menu.items });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load menu");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuId, isNew]);

  const { confirmLeave } = useDirtyGuard<MenuFormState>({ title, slug, items }, original);

  // Stale-response guard, save() half (2026-08-12 audit finding): the load effect's `cancelled`
  // flag above is scoped to a single effect run and flipped by that SAME effect's own cleanup — but
  // save() isn't an effect, so a route change mid-save never flips it. `activeMenuIdRef` always
  // holds the latest `menuId` this hook was RENDERED with (updated every render, not just on effect
  // re-run), so save()'s completion handlers can tell whether the operator has already navigated to
  // a different menu by the time create/update resolves, and skip committing state that belongs to
  // a menu no longer on screen. The `isNew` branch's own `navigate()` + early `return` stays
  // unguarded on purpose: it must always fire to land the operator on the menu they just created.
  const activeMenuIdRef = useRef(menuId);
  activeMenuIdRef.current = menuId;

  // Same-tick re-entry guard for `save()` (S4a, 2026-09-20) — see `MenuEditorController.saving`'s
  // own doc for the double-write bug this closes. A plain `useRef`, not `useSettlementGeneration`
  // (Pages/Posts' primitive): this screen has only one write action, so there is no "later click
  // wins" outcome to preserve — the second same-tick call should simply not happen at all. Checked
  // synchronously at the top of `save()`, before anything else runs, so two calls issued in the same
  // tick (a double click) both observe the first one's claim.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

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
    // Drop a same-tick duplicate outright — see `savingRef`'s own comment above and
    // `MenuEditorController.saving`'s doc for why this screen prefers "the second click never
    // happens" over Pages/Posts' "let the later one win".
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const savingForMenuId = menuId;
    setMessage(null);
    setError(null);
    try {
      if (isNew) {
        const { menu: created } = await port.createMenu({ title, slug }, { items });
        navigate(`/menus/${created.id}`);
        return;
      }
      if (!menu) return;
      const { menu: saved } = await port.updateMenuTree(
        { id: menu.id, expectedVersion: menu.version, items },
        { title, slug }
      );
      if (activeMenuIdRef.current !== savingForMenuId) return;
      setMenu(saved);
      setItems(saved.items);
      // A saved edit is no longer "unsaved" — re-baseline what the dirty check compares against,
      // or the guard would keep firing for a change the operator just persisted.
      setOriginal({ title, slug, items: saved.items });
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      if (activeMenuIdRef.current !== savingForMenuId) return;
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      // Unconditional, unlike the `activeMenuIdRef` checks above: this flag tracks whether THIS
      // save cycle is still on the wire, not whether its result still belongs to the menu on
      // screen, so it always clears when the request settles, whichever menu that request was for.
      savingRef.current = false;
      setSaving(false);
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
    saving,
    t,
  };
}

/**
 * Binds the real `/api/.../menus` client, the real `lib/router` `navigate`, and a
 * `MENUS_DICT`-bound translator — see `menus-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `MenuEditor.tsx` composes this and a test composes {@link useMenuEditor} with
 * `createFakeMenusPort`.
 */
export function useWiredMenuEditor(menuId: string | null): MenuEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useMenuEditor(menuId, { port: defaultMenusPort, navigate: realNavigate, t });
}
