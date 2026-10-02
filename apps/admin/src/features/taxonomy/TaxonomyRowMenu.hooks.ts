import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { RowMenuProps } from "@jini-ai/admin/react";

type MenuState = ReturnType<NonNullable<RowMenuProps["useRowMenu"]>>;

/**
 * Host-owned menu behavior for published admin versions whose popup destination is fixed.
 * Matches RowMenu's public hook seam, including viewport positioning and roving focus.
 * @param itemCount - Number of actions rendered by the menu.
 * @returns Menu state, DOM refs and keyboard/pointer actions; listeners exist only while open.
 */
export function useTaxonomyRowMenu({ itemCount }: { itemCount: number }): MenuState {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuState["position"]>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  itemRefs.current = itemRefs.current.slice(0, itemCount);

  /** Close explicitly; Escape and selection return focus, outside clicks and Tab leave it. */
  function close(focus: "trigger" | "leave") {
    setOpen(false);
    setPosition(null);
    if (focus === "trigger") triggerRef.current?.focus();
  }

  /** Open with the first or last action selected, according to the trigger key. */
  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    /** Measure the portal after layout and follow anchor movement on scroll/resize. */
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const height = menuRef.current?.offsetHeight ?? 0;
      const width = menuRef.current?.offsetWidth ?? 0;
      const fitsBelow = window.innerHeight - rect.bottom >= height + 8;
      const placement = fitsBelow || rect.top < height + 8 ? "below" : "above";
      setPosition({
        top: placement === "below" ? rect.bottom + 4 : rect.top - 4,
        left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
        placement,
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    /** Treat both the portal and its trigger as inside, regardless of their DOM ancestry. */
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close("leave");
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  /** Toggle by pointer without stealing focus back when closing the same trigger. */
  function onTriggerClick() {
    if (open) close("leave");
    else openAt(0);
  }

  /** Arrow keys open with a predictable initial focused action. */
  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openAt(event.key === "ArrowDown" ? 0 : itemCount - 1);
  }

  /** Keep menu navigation local; Tab follows the browser's ordinary focus order. */
  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % itemCount);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + itemCount) % itemCount);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(itemCount - 1);
        break;
      case "Escape":
        event.preventDefault();
        close("trigger");
        break;
      case "Tab":
        close("leave");
        break;
    }
  }

  /** Close before handing the selected action back to its owner. */
  function selectItem(onSelect: () => void) {
    close("trigger");
    onSelect();
  }

  return { open, position, triggerRef, menuRef, itemRefs, onTriggerClick, onTriggerKeyDown, onMenuKeyDown, selectItem };
}
